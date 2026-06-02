import { useState, useEffect } from 'react';
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
  approveOrRejectTeam,
  saveFixtures,
  updateMatchScore,
  resetTournament,
  deleteLeague,
  publicCreateTeam,
  publicJoinTeam,
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
  Trophy, 
  LogIn, 
  LogOut, 
  Tv, 
  UserCheck, 
  AlertCircle,
  HelpCircle
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

  // Subscriptions for user, active league ID, all leagues, and teams
  useEffect(() => {
    const unsubAuth = subscribeToAuth((user) => {
      setCurrentUser(user);
    });

    const unsubActiveId = subscribeToActiveLeagueId((id) => {
      setActiveLeagueId(id);
    });

    const unsubLeagues = subscribeToLeagues((list) => {
      setLeagues(list);
    });

    const unsubTeams = subscribeToTeams((t) => {
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

  // Reactive subscription to fixtures based on active league ID
  useEffect(() => {
    let unsubFixtures = () => {};
    if (activeLeagueId) {
      unsubFixtures = subscribeToFixtures(activeLeagueId, (f) => {
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

  // Auto-switch tabs based on league status
  useEffect(() => {
    if (league) {
      if (league.status === 'knockout' || league.status === 'finished') {
        setActiveTab('knockout');
      } else if (league.status === 'active') {
        setActiveTab('fixtures');
      }
    }
  }, [league?.status]);

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

  // Score submit and state transition manager
  const handleUpdateScore = async (matchId: string, homeScoreVal: number, awayScoreVal: number) => {
    if (!activeLeagueId) return;
    const roleSubmitter = currentUser?.role === 'admin' ? 'admin' : 'captain';
    
    // 1. Submit match result
    await updateMatchScore(activeLeagueId, matchId, homeScoreVal, awayScoreVal, roleSubmitter);

    if (roleSubmitter === 'captain') {
      return; // Captain submissions are pending admin approval, do not progress the round yet
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
          } else {
            // Not enough teams, finish tournament
            await saveLeagueSettings(activeLeagueId, { status: 'finished' });
          }
        } else {
          // Unlock next round by incrementing active round
          await saveLeagueSettings(activeLeagueId, { currentRound: activeRoundNum + 1 });
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
      await saveLeagueSettings(activeLeagueId, {
        status: 'finished',
        championId: championId
      });
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
              
              {/* Publicly available registration team tab */}
              <button
                onClick={() => setActiveTab('registration')}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  activeTab === 'registration' ? 'bg-slate-900 text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Team Entry
              </button>

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
              {currentUser ? (
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
              ) : (
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    setShowAuthModal(true);
                    setAuthError(null);
                  }}
                  className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-xs sm:text-sm transition-all shadow-md flex items-center gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </button>
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
        <button
          onClick={() => setActiveTab('registration')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex-shrink-0 ${
            activeTab === 'registration' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-400'
          }`}
        >
          Team Entry
        </button>
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
                {!currentUser && (
                  <button
                    onClick={() => {
                      setIsSignUp(false);
                      setShowAuthModal(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-md"
                  >
                    Login as Admin
                  </button>
                )}
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
            onApproveTeam={approveOrRejectTeam}
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
              return await publicCreateTeam(activeLeagueId, name, color, player, flagCode);
            }}
            onJoinTeam={publicJoinTeam}
            onUpdateScore={handleUpdateScore}
          />
        )}
      </main>

      {/* FOOTER BAR */}
      <footer className="bg-slate-950 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <p>© 2026 Scores — Football Tournament Management. Built with React & Tailwind.</p>
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
