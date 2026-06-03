import { useState, useEffect, useRef } from 'react';
import { 
  subscribeToAuth, 
  subscribeToLeagues, 
  subscribeToActiveLeagueId, 
  subscribeToTeams, 
  subscribeToFixtures,
  signIn,
  signUp,
  signOut,
  saveLeagueSettings,
  saveActiveLeagueId,
  approveOrRejectTeam as firebaseApproveOrRejectTeam,
  saveFixtures,
  updateMatchScore,
  resetTournament,
  deleteLeague,
  publicCreateTeam as firebasePublicCreateTeam,
  publicJoinTeam,
  saveMatchRoomCode,
  getDatabaseMode,
  toggleDatabaseMode,
  isFirebaseConfigured
} from './services/firebase';
import type { AppUser, LeagueSettings, Team, Match } from './services/firebase';
import { generateRoundRobinFixtures, calculateStandings } from './services/db';
import type { StandingRow } from './services/db';
import { Standings } from './components/Standings';
import { Fixtures } from './components/Fixtures';
import { KnockoutBracket } from './components/KnockoutBracket';
import { AdminPanel } from './components/AdminPanel';
import { TeamRegistration } from './components/TeamRegistration';
import {
  notify,
  isNotificationsEnabled,
  requestNotificationPermission,
  disableNotifications,
  getNotificationPermission,
} from './services/notifications';
import {
  initOneSignal,
  setOneSignalUser,
  requestPushPermission,
  isPushPermissionGranted,
  getCachedPushGranted,
  notifyTeamOffline,
  notifyAdminsOffline,
  notifyLeagueOffline,
} from './services/onesignal';
import { 
  Trophy, 
  LogOut, 
  Tv, 
  UserCheck, 
  AlertCircle,
  HelpCircle,
  Bell,
  BellOff
} from 'lucide-react';

function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  
  // Multi-league state
  const [leagues, setLeagues] = useState<Record<string, LeagueSettings>>({});
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [league, setLeague] = useState<LeagueSettings | null>(null);
  
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [fixtures, setFixtures] = useState<Match[]>([]);

  // Active view: 'standings' | 'fixtures' | 'knockout' | 'registration' | 'admin'
  const [activeTab, setActiveTab] = useState<string>('standings');
  
  // Auth Form State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Live standings cache
  const [standings, setStandings] = useState<StandingRow[]>([]);

  // Notification state
  const [notifEnabled, setNotifEnabled] = useState<boolean>(isNotificationsEnabled());
  // Initialise from localStorage cache so the button shows the correct state
  // immediately on page load, before the async OneSignal SDK has resolved.
  const [pushEnabled, setPushEnabled] = useState<boolean>(getCachedPushGranted);
  const prevTeamsRef = useRef<Record<string, Team>>({});
  const prevLeagueStatusRef = useRef<string | null>(null);
  const prevLeagueRoundRef = useRef<number | null>(null);
  // Tracks previous fixtures so we can detect newly-added room codes on any browser
  const prevFixturesRef = useRef<Match[]>([]);
  // Latest-value snapshots for use inside subscription callbacks (avoids stale closures)
  const teamsRef = useRef<Record<string, Team>>({});
  const currentUserRef = useRef<AppUser | null>(null);

  // Visitor's own team ID — derived from the team code stored in localStorage
  // Used by Fixtures tab to know who is home/away for room code controls
  const [myVisitorTeamId, setMyVisitorTeamId] = useState<string | null>(() => {
    const savedCode = localStorage.getItem('scores_my_team_code');
    return savedCode ? savedCode.toUpperCase() : null;
  });

  // Initialize OneSignal Web Push on mount.
  // pushEnabled is already seeded from localStorage (getCachedPushGranted) so
  // the button renders correctly immediately. We still run the async SDK check
  // in the background and correct state if the cached value is stale.
  useEffect(() => {
    const setupOneSignal = async () => {
      await initOneSignal();
      const isGranted = await isPushPermissionGranted();
      // setPushEnabled is idempotent — no flicker if cached value was already correct.
      setPushEnabled(isGranted);
    };
    setupOneSignal();
  }, []);

  // Auto-open admin login when URL contains #admin (secret admin entry point).
  // Share the link as: yoursite.com/#admin
  useEffect(() => {
    if (window.location.hash === '#admin') {
      setIsSignUp(false);
      setShowAuthModal(true);
      setAuthError(null);
      // Clean the hash from the URL without a page reload
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // Subscriptions for user, active league ID, all leagues, and teams
  useEffect(() => {
    const unsubAuth = subscribeToAuth((user) => {
      currentUserRef.current = user;
      setCurrentUser(user);
    });

    const unsubActiveId = subscribeToActiveLeagueId((id) => {
      setActiveLeagueId(id);
    });

    const unsubLeagues = subscribeToLeagues((list) => {
      setLeagues(list);
    });

    const unsubTeams = subscribeToTeams((t) => {
      // Detect new team registrations (pending status newly appeared)
      const prev = prevTeamsRef.current;
      Object.values(t).forEach((team) => {
        if (!prev[team.id] && team.status === 'pending') {
          notify.newTeamRegistered(team.name);
        }
      });
      // Detect team approvals/rejections
      Object.values(t).forEach((team) => {
        const prevTeam = prev[team.id];
        if (prevTeam && prevTeam.status !== team.status) {
          if (team.status === 'approved') notify.teamApproved(team.name);
          if (team.status === 'rejected') notify.teamRejected(team.name);
        }
      });
      prevTeamsRef.current = t;
      teamsRef.current = t;
      setTeams(t);
    });

    return () => {
      unsubAuth();
      unsubActiveId();
      unsubLeagues();
      unsubTeams();
    };
  }, []);

  // Update specific selected league setting on change of list or active ID
  useEffect(() => {
    if (activeLeagueId && leagues[activeLeagueId]) {
      setLeague(leagues[activeLeagueId]);
    } else {
      setLeague(null);
    }
  }, [activeLeagueId, leagues]);

  // Reactive subscription to fixtures — also detects new room codes for away-team/admin notifications
  useEffect(() => {
    let unsubFixtures = () => {};
    if (activeLeagueId) {
      unsubFixtures = subscribeToFixtures(activeLeagueId, (f) => {
        // ── Room-code notification detection ──────────────────────────────
        // Runs on EVERY browser that has this league open.
        // Compare old vs new fixtures; if a match just got a roomCode for
        // the first time, notify this visitor if they are the away team OR admin.
        const prevF = prevFixturesRef.current;
        if (prevF.length > 0) {
          f.forEach((match) => {
            if (!match.roomCode) return;
            const prev = prevF.find(p => p.id === match.id);
            if (prev && !prev.roomCode) {
              // Room code was just set for the first time on this match.
              const latestTeams = teamsRef.current;
              const latestUser = currentUserRef.current;
              const homeTeam = latestTeams[match.homeTeamId];
              const awayTeam = latestTeams[match.awayTeamId];
              if (!homeTeam || !awayTeam) return;

              // Is this browser the away team?
              const savedCode = localStorage.getItem('scores_my_team_code');
              const visitorCode = savedCode ? savedCode.toUpperCase() : null;
              const isVisitorAwayTeam =
                visitorCode &&
                awayTeam.code &&
                awayTeam.code.toUpperCase() === visitorCode;

              const isAdmin = latestUser?.role === 'admin';

              if (isVisitorAwayTeam || isAdmin) {
                notify.roomCodePosted(homeTeam.name, awayTeam.name, match.roomCode);
              }
            }
          });
        }
        prevFixturesRef.current = f;
        // ──────────────────────────────────────────────────────────────────
        setFixtures(f);
      });
    } else {
      setFixtures([]);
    }
    return () => unsubFixtures();
  }, [activeLeagueId]);

  // Recalculate standings when teams or fixtures change
  useEffect(() => {
    if (league && teams && fixtures) {
      const calculated = calculateStandings(teams, fixtures, league);
      setStandings(calculated);
    }
  }, [league, teams, fixtures]);

  // Auto-switch tabs + notify on league status/round changes
  useEffect(() => {
    if (league) {
      const prevStatus = prevLeagueStatusRef.current;
      const prevRound = prevLeagueRoundRef.current;

      if (prevStatus !== null && prevStatus !== league.status) {
        if (league.status === 'knockout') notify.knockoutStageStarted();
        if (league.status === 'active') notify.tournamentStarted(league.name);
        if (league.status === 'finished' && league.championId) {
          // Champion notification is fired after champion is set
        }
      }

      if (
        prevRound !== null &&
        typeof league.currentRound === 'number' &&
        league.currentRound !== prevRound
      ) {
        notify.roundStarted(league.currentRound);
      }

      prevLeagueStatusRef.current = league.status;
      prevLeagueRoundRef.current = league.currentRound;

      if (league.status === 'knockout' || league.status === 'finished') {
        setActiveTab('knockout');
      } else if (league.status === 'active') {
        setActiveTab('fixtures');
      }
    }
  }, [league?.status, league?.currentRound]);

  // Auth actions
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authEmail || !authPassword) {
      setAuthError('Email and password are required.');
      return;
    }

    try {
      if (isSignUp) {
        await signUp(authEmail, authPassword);
      } else {
        await signIn(authEmail, authPassword);
      }
      setShowAuthModal(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed.');
    }
  };

  // Resolve myVisitorTeamId → actual team object ID whenever teams or league changes
  // (the stored code is the team join-code, not the internal team ID)
  const myVisitorTeam = (() => {
    if (!myVisitorTeamId || !activeLeagueId) return null;
    return Object.values(teams).find(
      t => t.code && t.code.toUpperCase() === myVisitorTeamId && t.leagueId === activeLeagueId
    ) || null;
  })();

  // Sync user details/tags to OneSignal for targeted push notifications
  useEffect(() => {
    let activeTeamId: string | null = null;
    if (currentUser && currentUser.teamId) {
      activeTeamId = currentUser.teamId;
    } else if (myVisitorTeam) {
      activeTeamId = myVisitorTeam.id;
    }
    const isAdmin = currentUser?.role === 'admin';
    setOneSignalUser(activeTeamId, currentUser?.email || null, isAdmin, activeLeagueId);
  }, [currentUser, myVisitorTeam, activeLeagueId]);

  // Room code save handler — saves to DB and notifies the away team
  const handleSaveRoomCode = async (matchId: string, code: string) => {
    if (!activeLeagueId) return;
    const match = fixtures.find(m => m.id === matchId);
    if (!match) return;

    const isFirstTime = !match.roomCode; // only notify on first set, not edits
    await saveMatchRoomCode(activeLeagueId, matchId, code);

    if (isFirstTime) {
      const homeTeam = teams[match.homeTeamId];
      const awayTeam = teams[match.awayTeamId];
      if (homeTeam && awayTeam) {
        notify.roomCodePosted(homeTeam.name, awayTeam.name, code);
        
        // Trigger offline/background push notifications
        notifyTeamOffline(
          awayTeam.id,
          '🎮 Room Code Ready!',
          `${homeTeam.name} has posted the room code for your match vs ${awayTeam.name}: ${code}`
        );
        
        notifyAdminsOffline(
          '🎮 Match Room Code Posted',
          `${homeTeam.name} vs ${awayTeam.name}: Room code is ${code}`
        );
      }
    }
  };

  // Sync myVisitorTeamId when localStorage changes (e.g. team created/joined in same session)
  const syncVisitorTeam = () => {
    const savedCode = localStorage.getItem('scores_my_team_code');
    setMyVisitorTeamId(savedCode ? savedCode.toUpperCase() : null);
  };

  // Notification bell toggle handler
  const handleToggleNotifications = async () => {
    if (notifEnabled) {
      disableNotifications();
      setNotifEnabled(false);
    } else {
      if (getNotificationPermission() === 'denied') {
        alert('Notifications are blocked in your browser. Please allow them in your browser site settings and try again.');
        return;
      }
      const result = await requestNotificationPermission();
      setNotifEnabled(result === 'granted');
    }
  };

  // Score submit and state transition manager
  const handleUpdateScore = async (matchId: string, homeScoreVal: number, awayScoreVal: number) => {
    if (!activeLeagueId) return;
    const roleSubmitter = currentUser?.role === 'admin' ? 'admin' : 'captain';
    
    // 1. Submit match result
    await updateMatchScore(activeLeagueId, matchId, homeScoreVal, awayScoreVal, roleSubmitter);

    if (roleSubmitter === 'captain') {
      // Notify captain submission
      const matchTeams = fixtures.find(m => m.id === matchId);
      if (matchTeams) {
        const home = teams[matchTeams.homeTeamId]?.name || 'Home';
        const away = teams[matchTeams.awayTeamId]?.name || 'Away';
        notify.scorePendingApproval(home, away);
        
        // Notify admins that a score is awaiting their approval
        notifyAdminsOffline(
          '📋 Score Pending Approval',
          `${home} vs ${away} (${homeScoreVal}-${awayScoreVal}) submitted by captain, awaiting your review.`
        );
      }
      return;
    }

    // Fire score updated notification for admin submission
    {
      const matchTeams = fixtures.find(m => m.id === matchId);
      if (matchTeams) {
        const home = teams[matchTeams.homeTeamId]?.name || 'Home';
        const away = teams[matchTeams.awayTeamId]?.name || 'Away';
        notify.scoreUpdated(home, away, homeScoreVal, awayScoreVal);
        
        // Notify all players in this league that the points table / score updated
        notifyLeagueOffline(
          activeLeagueId,
          '⚽ Points Table Updated',
          `${home} ${homeScoreVal} – ${awayScoreVal} ${away}. Standings points table has been updated!`
        );
        
        // Notify admins
        notifyAdminsOffline(
          '⚽ Points Table Updated',
          `Score approved: ${home} ${homeScoreVal} – ${awayScoreVal} ${away}`
        );
      }
    }

    // 2. Process rules on current active fixtures
    const updatedFixtures = [...fixtures];
    const matchIdx = updatedFixtures.findIndex(m => m.id === matchId);
    if (matchIdx === -1) return;

    // Apply the local score change immediately to check progression
    updatedFixtures[matchIdx] = {
      ...updatedFixtures[matchIdx],
      homeScore: homeScoreVal,
      awayScore: awayScoreVal,
      isCompleted: true
    };

    const currentSettings = league;
    if (!currentSettings) return;

    // A. Round Robin Progression
    if (typeof updatedFixtures[matchIdx].round === 'number') {
      const activeRoundNum = updatedFixtures[matchIdx].round as number;
      const roundMatches = updatedFixtures.filter(m => m.round === activeRoundNum);
      const allCompleted = roundMatches.every(m => m.isCompleted);

      if (allCompleted) {
        if (activeRoundNum === currentSettings.totalRounds) {
          // Last round completed -> Transition to Knockouts
          const freshStandings = calculateStandings(teams, updatedFixtures, currentSettings);
          
          if (freshStandings.length >= 4) {
            const t1 = freshStandings[0].teamId;
            const t2 = freshStandings[1].teamId;
            const t3 = freshStandings[2].teamId;
            const t4 = freshStandings[3].teamId;

            const sf1: Match = {
              id: 'match-sf-1',
              leagueId: activeLeagueId,
              round: 'SF1',
              homeTeamId: t1,
              awayTeamId: t4,
              homeScore: null,
              awayScore: null,
              isCompleted: false,
              submittedBy: null,
              isDisputed: false
            };

            const sf2: Match = {
              id: 'match-sf-2',
              leagueId: activeLeagueId,
              round: 'SF2',
              homeTeamId: t2,
              awayTeamId: t3,
              homeScore: null,
              awayScore: null,
              isCompleted: false,
              submittedBy: null,
              isDisputed: false
            };

            const finalMatch: Match = {
              id: 'match-final',
              leagueId: activeLeagueId,
              round: 'FINAL',
              homeTeamId: 'TBD',
              awayTeamId: 'TBD',
              homeScore: null,
              awayScore: null,
              isCompleted: false,
              submittedBy: null,
              isDisputed: false
            };

            await saveFixtures(activeLeagueId, [...updatedFixtures, sf1, sf2, finalMatch]);
            await saveLeagueSettings(activeLeagueId, { status: 'knockout' });
            
            // Trigger offline push notifications
            notifyLeagueOffline(
              activeLeagueId,
              '🏆 Knockout Stage Begins!',
              'The Group Stage is complete. Semi-final matches are now live!'
            );
            notifyAdminsOffline(
              '🏆 Knockout Stage Begins',
              `Tournament "${currentSettings.name}": transitioning to Knockouts.`
            );
          } else {
            // Not enough teams, finish tournament
            await saveLeagueSettings(activeLeagueId, { status: 'finished' });
            
            // Trigger offline push notifications
            notifyLeagueOffline(
              activeLeagueId,
              '🏁 Tournament Finished',
              `The tournament "${currentSettings.name}" has concluded.`
            );
          }
        } else {
          // Unlock next round by incrementing active round
          await saveLeagueSettings(activeLeagueId, { currentRound: activeRoundNum + 1 });
          
          // Trigger offline push notifications for new round
          notifyLeagueOffline(
            activeLeagueId,
            '🏁 New Round Started',
            `Round ${activeRoundNum + 1} fixtures are now live! Check your match sheet.`
          );
          notifyAdminsOffline(
            '🏁 New Round Started',
            `Tournament "${currentSettings.name}": Round ${activeRoundNum + 1} has started.`
          );
        }
      }
    }
    // B. Semi-Finals Progression
    else if (updatedFixtures[matchIdx].round === 'SF1' || updatedFixtures[matchIdx].round === 'SF2') {
      const sf1Match = updatedFixtures.find(m => m.round === 'SF1');
      const sf2Match = updatedFixtures.find(m => m.round === 'SF2');

      if (sf1Match && sf2Match && sf1Match.isCompleted && sf2Match.isCompleted) {
        // Find winners
        const sf1Winner = sf1Match.homeScore! > sf1Match.awayScore! ? sf1Match.homeTeamId : sf1Match.awayTeamId;
        const sf2Winner = sf2Match.homeScore! > sf2Match.awayScore! ? sf2Match.homeTeamId : sf2Match.awayTeamId;

        const finalIdx = updatedFixtures.findIndex(m => m.round === 'FINAL');
        if (finalIdx !== -1) {
          updatedFixtures[finalIdx] = {
            ...updatedFixtures[finalIdx],
            homeTeamId: sf1Winner,
            awayTeamId: sf2Winner
          };
          await saveFixtures(activeLeagueId, updatedFixtures);
        }
      }
    }
    // C. Grand Final Progression
    else if (updatedFixtures[matchIdx].round === 'FINAL') {
      const finalMatch = updatedFixtures[matchIdx];
      const championId = finalMatch.homeScore! > finalMatch.awayScore! ? finalMatch.homeTeamId : finalMatch.awayTeamId;
      const championName = teams[championId]?.name || 'The champion';
      await saveLeagueSettings(activeLeagueId, {
        status: 'finished',
        championId: championId
      });
      notify.championCrowned(championName);
      
      // Trigger offline push notifications
      notifyLeagueOffline(
        activeLeagueId,
        '🥇 Champion Crowned!',
        `"${championName}" is the tournament champion! Congratulations!`
      );
      notifyAdminsOffline(
        '🥇 Champion Crowned',
        `Tournament "${currentSettings.name}": "${championName}" is crowned champion.`
      );
    }
  };

  // League Initializer
  const handleCreateLeague = async (id: string, settings: Omit<LeagueSettings, 'status' | 'currentRound' | 'totalRounds' | 'id'>) => {
    await saveLeagueSettings(id, {
      ...settings,
      id,
      status: 'registration',
      currentRound: 1,
      totalRounds: 0,
      championId: null
    });
    await saveActiveLeagueId(id);
    setActiveTab('admin');
  };

  // Wrapped approveOrRejectTeam with notifications
  const handleApproveOrRejectTeam = async (teamId: string, status: 'approved' | 'rejected' | 'pending') => {
    await firebaseApproveOrRejectTeam(teamId, status);
    
    const team = teams[teamId];
    if (team) {
      if (status === 'approved') {
        notifyTeamOffline(
          teamId,
          '✅ Team Approved!',
          `Your team "${team.name}" has been approved for the tournament.`
        );
        notifyAdminsOffline(
          '✅ Team Approved',
          `Team "${team.name}" has been approved.`
        );
      } else if (status === 'rejected') {
        notifyTeamOffline(
          teamId,
          '❌ Team Rejected',
          `Your team registration for "${team.name}" was not approved.`
        );
        notifyAdminsOffline(
          '❌ Team Rejected',
          `Team "${team.name}" registration was rejected.`
        );
      }
    }
  };

  // Wrapped publicCreateTeam with notifications
  const handlePublicCreateTeam = async (leagueId: string, name: string, color: string, player: import('./services/firebase').Player, flagCode?: string) => {
    const result = await firebasePublicCreateTeam(leagueId, name, color, player, flagCode);
    
    // Trigger offline/background push notifications for admin
    notifyAdminsOffline(
      '🆕 New Team Registered',
      `"${name}" has registered and is awaiting approval in the Admin Panel.`
    );
    
    return result;
  };

  // Start league schedule generation
  const handleStartLeague = async () => {
    if (!activeLeagueId || !league) return;
    const approvedTeams = Object.values(teams).filter(t => t.leagueId === activeLeagueId && t.status === 'approved');
    if (approvedTeams.length !== league.teamCount) return;

    const generatedFixtures = generateRoundRobinFixtures(approvedTeams);
    
    const numTeams = approvedTeams.length;
    const totalRounds = numTeams % 2 === 0 ? numTeams - 1 : numTeams;

    await saveFixtures(activeLeagueId, generatedFixtures);
    await saveLeagueSettings(activeLeagueId, {
      status: 'active',
      currentRound: 1,
      totalRounds: totalRounds
    });
    notify.tournamentStarted(league.name);

    // Trigger offline push notifications
    notifyLeagueOffline(
      activeLeagueId,
      '🏁 Tournament Started!',
      `"${league.name}" has kicked off! Round 1 fixtures are now live.`
    );
    notifyAdminsOffline(
      '🏁 Tournament Started',
      `Tournament "${league.name}" has been started successfully.`
    );

    setActiveTab('fixtures');
  };

  const handleResetTournament = async () => {
    if (!activeLeagueId) return;
    if (window.confirm('Are you sure you want to reset this league? This will wipe scores and teams registered for it.')) {
      await resetTournament(activeLeagueId);
      setActiveTab('standings');
    }
  };

  const handleDeleteLeague = async (leagueId: string) => {
    if (window.confirm('Are you sure you want to delete this tournament completely? This will wipe the tournament, all its teams, fixtures, and scores. This action CANNOT be undone.')) {
      await deleteLeague(leagueId);
      // Sync active tab
      setActiveTab('standings');
    }
  };

  // Direct login switcher for Mock Testing
  const handleMockLogin = async (email: string) => {
    const isEmailAdmin = email === 'admin@scores.com';
    const userDetails: AppUser = {
      uid: isEmailAdmin ? 'admin-uid-123' : `mock-uid-${Date.now()}`,
      email: email,
      role: isEmailAdmin ? 'admin' : 'viewer',
      teamId: null
    };
    setCurrentUser(userDetails);
    setActiveTab(isEmailAdmin ? 'admin' : 'standings');
  };

  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* HEADER BAR */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 shadow-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-2">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('standings')}>
              <div className="p-2 bg-emerald-500 rounded-lg text-slate-950 shadow-md">
                <Trophy className="w-5 h-5 font-bold" />
              </div>
              <span className="text-xl font-black tracking-wider text-slate-100 uppercase">
                Scores<span className="text-emerald-400">.</span>
              </span>
            </div>

            {/* Public League Switcher Dropdown */}
            {Object.keys(leagues).length > 0 && (
              <div className="flex items-center gap-1 sm:gap-2 flex-1 min-w-0 ml-2 sm:ml-4">
                <span className="hidden sm:inline text-xs text-slate-400 font-bold uppercase tracking-wider flex-shrink-0">Tournament:</span>
                <select
                  value={activeLeagueId || ''}
                  onChange={(e) => saveActiveLeagueId(e.target.value || null)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-2 sm:px-3 py-1.5 text-xs font-semibold text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer min-w-0 flex-1 max-w-[160px] sm:max-w-none"
                >
                  <option value="" disabled>-- Select --</option>
                  {Object.values(leagues).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Navigation Tabs */}
            <nav className="hidden md:flex items-center space-x-1">
              <button
                onClick={() => setActiveTab('standings')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'standings' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Standings
              </button>
              <button
                onClick={() => setActiveTab('fixtures')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'fixtures' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Fixtures
              </button>
              {(league?.status === 'knockout' || league?.status === 'finished') && (
                <button
                  onClick={() => setActiveTab('knockout')}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    activeTab === 'knockout' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Knockouts
                </button>
              )}
              
              {/* Team Entry tab — hidden for admins (they manage teams from Admin Panel) */}
              {currentUser?.role !== 'admin' && (
                <button
                  onClick={() => setActiveTab('registration')}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    activeTab === 'registration' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Team Entry
                </button>
              )}

              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    activeTab === 'admin' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Admin Panel
                </button>
              )}
            </nav>

            {/* Auth panel */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Notification Bell */}
              {'Notification' in window && (
                <button
                  id="notif-toggle-btn"
                  onClick={handleToggleNotifications}
                  title={notifEnabled ? 'Disable notifications' : 'Enable notifications'}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                    notifEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {notifEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  <span className="hidden sm:inline">{notifEnabled ? 'Notifications On' : 'Notify'}</span>
                </button>
              )}

              {/* OneSignal Offline Push Notifications */}
              {import.meta.env.VITE_ONESIGNAL_APP_ID && (
                <button
                  id="push-toggle-btn"
                  onClick={async () => {
                    await requestPushPermission();
                    // isPushPermissionGranted also writes the result to localStorage
                    const isGranted = await isPushPermissionGranted();
                    setPushEnabled(isGranted);
                  }}
                  title={pushEnabled ? 'Offline push notifications enabled' : 'Enable offline push alerts'}
                  className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-semibold ${
                    pushEnabled
                      ? 'bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25 shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-blue-300 hover:border-slate-700'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                  <span className="hidden sm:inline">{pushEnabled ? 'Offline Alerts On' : 'Offline Alerts'}</span>
                </button>
              )}

              {/* Show logout + email only when admin is signed in */}
              {currentUser && (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-xs font-semibold text-slate-350">{currentUser.email}</span>
                    <span className="text-[10px] text-slate-500 uppercase font-extrabold tracking-wider">
                      {currentUser.role}
                    </span>
                  </div>
                  <button
                    onClick={signOut}
                    className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-850 transition-all flex items-center gap-1.5 text-xs font-semibold"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE NAV (SCROLLABLE BAR) */}
      <div className="md:hidden sticky top-16 z-30 bg-slate-950 border-b border-slate-900/60 overflow-x-auto flex px-4 py-2 gap-2">
        <button
          onClick={() => setActiveTab('standings')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
            activeTab === 'standings' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
          }`}
        >
          Standings
        </button>
        <button
          onClick={() => setActiveTab('fixtures')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
            activeTab === 'fixtures' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
          }`}
        >
          Fixtures
        </button>
        {(league?.status === 'knockout' || league?.status === 'finished') && (
          <button
            onClick={() => setActiveTab('knockout')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
              activeTab === 'knockout' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
            }`}
          >
            Knockouts
          </button>
        )}
        {/* Team Entry tab — hidden for admins in mobile nav */}
        {currentUser?.role !== 'admin' && (
          <button
            onClick={() => setActiveTab('registration')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
              activeTab === 'registration' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
            }`}
          >
            Team Entry
          </button>
        )}
        {currentUser?.role === 'admin' && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
              activeTab === 'admin' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
            }`}
          >
            Admin Panel
          </button>
        )}
      </div>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex-1 w-full">
        {/* Connection Warning Banner */}
        {getDatabaseMode() === 'mock' && isFirebaseConfigured && (
          <div className="mb-6 p-4 bg-amber-950/25 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-400 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-amber-500/10 rounded-lg text-amber-400">⚠️</span>
              <span>
                <strong>Firebase connection unavailable:</strong> Running in self-healing Local Mock mode. 
                Verify that you have enabled/created a <strong>Realtime Database</strong> instance in your Firebase console for project <strong>efcoop</strong>.
              </span>
            </div>
            <button
              onClick={toggleDatabaseMode}
              className="bg-amber-500 hover:bg-amber-450 text-slate-950 font-bold px-3 py-1.5 rounded-xl transition-all shadow text-[10px] uppercase tracking-wider flex-shrink-0"
            >
              Try Reconnecting
            </button>
          </div>
        )}

        {/* LEAGUE BANNER HEADER */}
        {league && league.name && (
          <div className="mb-8 p-4 bg-slate-900/30 rounded-2xl border border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight uppercase leading-none">
                {league.name}
              </h1>
              <p className="text-xs text-slate-400 mt-1 font-semibold uppercase tracking-wider">
                League Status:{' '}
                <span className="text-emerald-450">
                  {league.status === 'setup' ? 'Setting Up' :
                   league.status === 'registration' ? 'Teams Registration Open' :
                   league.status === 'active' ? `Active — Playing Round ${league.currentRound} of ${league.totalRounds}` :
                   league.status === 'knockout' ? 'Knockout Bracket Stage' :
                   'Finished / Champion Crowned'}
                </span>
              </p>
            </div>

            {league.status === 'registration' && (
              <span className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-3 py-1.5 rounded-xl text-xs font-bold animate-pulse">
                Registration Open
              </span>
            )}
          </div>
        )}

        {/* TAB RENDERING CONTENT */}
        {activeTab === 'standings' && (
          <div className="space-y-6">
            {(!activeLeagueId || !league || league.status === 'setup') && (
              <div className="glass-panel rounded-2xl p-12 text-center text-slate-500 glow-emerald max-w-2xl mx-auto">
                <Trophy className="w-16 h-16 mx-auto text-slate-700 mb-4" />
                <h3 className="text-lg font-bold text-slate-350 mb-2">No Active Tournament</h3>
                <p className="text-sm max-w-md mx-auto text-slate-450 mb-6">
                  Please select a tournament from the header dropdown or log in as an Admin to create a new league.
                </p>

              </div>
            )}
            {activeLeagueId && league && league.status !== 'setup' && (
              <Standings standings={standings} teamCountSettings={league.teamCount} />
            )}
          </div>
        )}

        {activeTab === 'fixtures' && activeLeagueId && (
          <Fixtures
            fixtures={fixtures}
            teams={teams}
            currentRound={league?.currentRound || 1}
            currentUser={currentUser}
            onUpdateScore={handleUpdateScore}
            myTeamId={myVisitorTeam?.id || null}
            onSaveRoomCode={handleSaveRoomCode}
          />
        )}

        {activeTab === 'knockout' && activeLeagueId && (
          <KnockoutBracket
            fixtures={fixtures}
            teams={teams}
            currentUser={currentUser}
            onUpdateScore={handleUpdateScore}
            championId={league?.championId}
            onReset={handleResetTournament}
          />
        )}

        {activeTab === 'admin' && currentUser?.role === 'admin' && (
          <AdminPanel
            league={league}
            leagues={leagues}
            activeLeagueId={activeLeagueId}
            teams={teams}
            fixtures={fixtures}
            onCreateLeague={handleCreateLeague}
            onApproveTeam={handleApproveOrRejectTeam}
            onStartLeague={handleStartLeague}
            onSelectActiveLeague={saveActiveLeagueId}
            onReset={handleResetTournament}
            onDeleteLeague={handleDeleteLeague}
            onUpdateScore={handleUpdateScore}
          />
        )}

        {activeTab === 'registration' && (
          <TeamRegistration
            league={league}
            activeLeagueId={activeLeagueId}
            teams={teams}
            fixtures={fixtures}
            standings={standings}
            onRegisterTeam={async (name, color, player, flagCode) => {
              if (!activeLeagueId) throw new Error('No active league.');
              const result = await handlePublicCreateTeam(activeLeagueId, name, color, player, flagCode);
              syncVisitorTeam(); // keep myVisitorTeamId in sync after creating
              return result;
            }}
            onJoinTeam={async (code, player) => {
              const result = await publicJoinTeam(code, player);
              syncVisitorTeam(); // keep myVisitorTeamId in sync after joining
              return result;
            }}
            onUpdateScore={handleUpdateScore}
            onSaveRoomCode={handleSaveRoomCode}
          />
        )}
      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Scores — Football Tournament Management. Built with React & Tailwind.</p>
        {/* Unobtrusive admin entry point — share yoursite.com/#admin with admin users */}
        <button
          onClick={() => { setShowAuthModal(true); setAuthError(null); }}
          className="mt-3 text-slate-800 hover:text-slate-600 transition-colors text-[10px] tracking-widest uppercase"
        >
          Admin
        </button>
      </footer>

      {/* AUTHENTICATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 relative border border-slate-800 glow-emerald pb-safe">
            <button
              onClick={() => setShowAuthModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 font-bold"
            >
              ✕
            </button>

            <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <span>Admin Access Panel</span>
            </h2>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="admin@scores.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              {authError && (
                <div className="p-3 bg-rose-950/20 border border-rose-500/25 rounded-xl flex items-center gap-2 text-rose-400 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-lg"
              >
                Sign In
              </button>
            </form>
          </div>
        </div>
      )}

      {/* FLOATING DEMO CONTROL (Visible in DEV mode) */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-4 right-3 sm:right-4 z-50">
          <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-emerald-500/25 glow-emerald bg-slate-950/95 max-w-[220px] sm:max-w-[280px] shadow-2xl">
            <div className="flex items-center justify-between mb-3 border-b border-slate-900 pb-2">
              <div className="flex items-center gap-1.5">
                <Tv className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">Interactive Demo Console</span>
              </div>
              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${
                getDatabaseMode() === 'firebase'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}>
                {getDatabaseMode()}
              </span>
            </div>

            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Quickly switch accounts / roles to simulate different user actions instantly.
            </p>

            <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-bold mb-3">
              <button
                onClick={() => handleMockLogin('admin@scores.com')}
                className={`py-1.5 rounded transition-all border ${
                  currentUser?.role === 'admin' 
                    ? 'bg-emerald-600 text-slate-950 border-emerald-500 shadow' 
                    : 'bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Admin
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  setActiveTab('standings');
                }}
                className={`py-1.5 rounded transition-all border ${
                  !currentUser 
                    ? 'bg-emerald-600 text-slate-950 border-emerald-500 shadow' 
                    : 'bg-slate-900 text-slate-350 border-slate-800 hover:bg-slate-800'
                }`}
              >
                Viewer
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-900 space-y-2">
              <button
                onClick={toggleDatabaseMode}
                disabled={!isFirebaseConfigured}
                className="w-full bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-slate-300 hover:text-slate-100 border border-slate-800 hover:border-slate-700 py-1.5 rounded text-[10px] font-bold transition-all flex items-center justify-center gap-1"
                title={isFirebaseConfigured ? "Switch between Realtime Database and Local Storage Mock Mode" : "Firebase is not configured in .env"}
              >
                <span>🔄 Switch to {getDatabaseMode() === 'firebase' ? 'Mock DB' : 'Firebase DB'}</span>
              </button>

              <div className="flex items-center gap-1 text-[9px] text-slate-500 justify-center pt-1">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Admin Pass: <span className="font-mono text-slate-400">adminpassword</span></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
