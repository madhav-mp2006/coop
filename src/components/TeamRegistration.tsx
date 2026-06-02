import React, { useState, useEffect } from 'react';
import type { LeagueSettings, Team, Player, Match } from '../services/firebase';
import type { StandingRow } from '../services/db';
import { 
  Shield, 
  UserPlus, 
  Users, 
  Plus, 
  Key, 
  LogOut, 
  Trophy, 
  Calendar, 
  Copy, 
  Check, 
  Star,
  Tv
} from 'lucide-react';

interface TeamRegistrationProps {
  league: LeagueSettings | null;
  activeLeagueId: string | null;
  teams: Record<string, Team>;
  fixtures: Match[];
  standings: StandingRow[];
  onRegisterTeam: (name: string, color: string, player: Player) => Promise<{ teamId: string, code: string }>;
  onJoinTeam: (code: string, player: Player) => Promise<{ teamId: string, code: string }>;
  onUpdateScore?: (matchId: string, homeScore: number, awayScore: number) => Promise<void>;
}

const PRESET_COLORS = [
  { name: 'Sky Blue', hex: '#38bdf8' },
  { name: 'Red Devil', hex: '#ef4444' },
  { name: 'Orange Gunners', hex: '#f97316' },
  { name: 'Classic Blue', hex: '#2563eb' },
  { name: 'Emerald Green', hex: '#10b981' },
  { name: 'Purple Magic', hex: '#a855f7' },
  { name: 'Neon Gold', hex: '#eab308' },
  { name: 'Hot Pink', hex: '#ec4899' }
];

const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'];

export const TeamRegistration: React.FC<TeamRegistrationProps> = ({
  league,
  activeLeagueId,
  teams,
  fixtures,
  standings,
  onRegisterTeam,
  onJoinTeam,
  onUpdateScore
}) => {
  // Portal Navigation tab: 'create' | 'join' | 'access'
  const [activePortalTab, setActivePortalTab] = useState<'create' | 'join' | 'access'>('create');
  
  // My Team Code session state
  const [myTeamCode, setMyTeamCode] = useState<string | null>(null);
  
  // Create Team States
  const [teamName, setTeamName] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].hex);
  const [p1Name, setP1Name] = useState('');
  const [p1Number, setP1Number] = useState('10');
  const [p1Position, setP1Position] = useState('Forward');

  // Join Team States
  const [joinCode, setJoinCode] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p2Number, setP2Number] = useState('7');
  const [p2Position, setP2Position] = useState('Midfielder');

  // Access Team State
  const [accessCode, setAccessCode] = useState('');

  // UI status states
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Team Dashboard fixture view states
  const [fixtureViewMode, setFixtureViewMode] = useState<'ours' | 'all'>('ours');
  const [selectedDashboardRound, setSelectedDashboardRound] = useState<number | 'SF' | 'FINAL' | null>(null);

  // Match score editing states
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editHomeScore, setEditHomeScore] = useState<string>('');
  const [editAwayScore, setEditAwayScore] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Sync myTeamCode on mount or active league change
  useEffect(() => {
    const savedCode = localStorage.getItem('scores_my_team_code');
    if (savedCode) {
      setMyTeamCode(savedCode.toUpperCase());
    } else {
      setMyTeamCode(null);
    }
    setError(null);
    setSuccess(null);
  }, [activeLeagueId]);

  // Sync selectedDashboardRound with league status/currentRound
  useEffect(() => {
    if (league) {
      if (league.status === 'knockout') {
        setSelectedDashboardRound('SF');
      } else {
        setSelectedDashboardRound(league.currentRound);
      }
    } else {
      setSelectedDashboardRound(null);
    }
  }, [league]);

  // Find user's active team associated with the active league and code
  const myTeam = myTeamCode 
    ? Object.values(teams).find(t => t.code && t.code.toUpperCase() === myTeamCode && t.leagueId === activeLeagueId) 
    : null;

  // Filter teams registered for this active league
  const leagueTeams = Object.values(teams).filter(t => t.leagueId === activeLeagueId);
  
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!activeLeagueId) {
      setError('Please select or create an active league first.');
      return;
    }
    if (league && league.status !== 'registration') {
      setError('Registration is closed for this league.');
      return;
    }
    if (!teamName.trim() || !p1Name.trim()) {
      setError('Team name and player name are required.');
      return;
    }

    const num = parseInt(p1Number);
    if (isNaN(num) || num < 1 || num > 99) {
      setError('Jersey number must be between 1 and 99.');
      return;
    }

    try {
      setSubmitting(true);
      const player: Player = {
        name: p1Name.trim(),
        number: num,
        position: p1Position
      };
      
      const result = await onRegisterTeam(teamName.trim(), selectedColor, player);
      
      localStorage.setItem('scores_my_team_code', result.code.toUpperCase());
      setMyTeamCode(result.code.toUpperCase());
      setSuccess(`Team "${teamName}" created successfully! Code: ${result.code}`);
      setTeamName('');
      setP1Name('');
    } catch (err: any) {
      setError(err.message || 'Failed to register team.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (league && league.status !== 'registration') {
      setError('Registration is closed for this league.');
      return;
    }
    if (!joinCode.trim()) {
      setError('Please enter a team code.');
      return;
    }
    if (!p2Name.trim()) {
      setError('Your player name is required.');
      return;
    }

    const num = parseInt(p2Number);
    if (isNaN(num) || num < 1 || num > 99) {
      setError('Jersey number must be between 1 and 99.');
      return;
    }

    try {
      setSubmitting(true);
      const player: Player = {
        name: p2Name.trim(),
        number: num,
        position: p2Position
      };
      
      const result = await onJoinTeam(joinCode.trim().toUpperCase(), player);
      
      localStorage.setItem('scores_my_team_code', result.code.toUpperCase());
      setMyTeamCode(result.code.toUpperCase());
      setSuccess('You have successfully joined the team roster!');
      setP2Name('');
      setJoinCode('');
    } catch (err: any) {
      setError(err.message || 'Failed to join team.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccessTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!accessCode.trim()) {
      setError('Please enter a team code.');
      return;
    }

    const codeUpper = accessCode.trim().toUpperCase();
    const foundTeam = Object.values(teams).find(
      t => t.code && t.code.toUpperCase() === codeUpper && t.leagueId === activeLeagueId
    );

    if (!foundTeam) {
      setError('No team found in this league with the entered code.');
      return;
    }

    localStorage.setItem('scores_my_team_code', codeUpper);
    setMyTeamCode(codeUpper);
    setSuccess(`Successfully loaded team "${foundTeam.name}" dashboard.`);
    setAccessCode('');
  };

  const handleDisconnectTeam = () => {
    if (window.confirm('Disconnect from this team dashboard? You can re-enter your team code at any time.')) {
      localStorage.removeItem('scores_my_team_code');
      setMyTeamCode(null);
      setError(null);
      setSuccess(null);
    }
  };

  // Helper check if a match is open for score submission by this team
  const canTeamSubmitScore = (match: Match) => {
    if (!myTeam || myTeam.status !== 'approved') return false;
    if (match.isCompleted) return false;
    if (match.scoreStatus === 'pending_approval') return false; // Prevent resubmission when pending
    
    const isMyMatch = match.homeTeamId === myTeam.id || match.awayTeamId === myTeam.id;
    if (!isMyMatch) return false;

    if (typeof match.round === 'number') {
      return league?.status === 'active' && match.round === league.currentRound;
    } else {
      return league?.status === 'knockout';
    }
  };

  const startSubmitScore = (match: Match) => {
    setEditingMatchId(match.id);
    setEditHomeScore(match.homeScore !== null ? match.homeScore.toString() : '');
    setEditAwayScore(match.awayScore !== null ? match.awayScore.toString() : '');
    setEditError(null);
  };

  const handleScoreSubmit = async (matchId: string) => {
    const hScoreVal = parseInt(editHomeScore);
    const aScoreVal = parseInt(editAwayScore);

    if (isNaN(hScoreVal) || isNaN(aScoreVal) || hScoreVal < 0 || aScoreVal < 0) {
      setEditError('Please enter valid, non-negative scores.');
      return;
    }

    if (!onUpdateScore) {
      setEditError('Score submission is not configured.');
      return;
    }

    try {
      setEditSubmitting(true);
      await onUpdateScore(matchId, hScoreVal, aScoreVal);
      setEditingMatchId(null);
      setSuccess('Match score submitted successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update score.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const isRegistrationClosed = league ? league.status !== 'registration' : true;

  // Filter standing row specifically for myTeam
  const myStanding = myTeam
    ? standings.find(row => row.teamId === myTeam.id)
    : null;

  // Filter approved teams only (for points table display)
  const approvedStandings = standings.filter(row => {
    const teamObj = teams[row.teamId];
    return teamObj && teamObj.status === 'approved';
  });

  // Filter matches based on view mode and selected round
  const getFilteredDashboardFixtures = (): Match[] => {
    if (!myTeam) return [];
    
    if (fixtureViewMode === 'ours') {
      // Sort matches: numeric rounds first, then SF1/SF2, then FINAL. Hide future rounds.
      const myMatches = fixtures.filter(m => {
        const isMyMatch = m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id;
        if (!isMyMatch) return false;
        if (typeof m.round === 'number') {
          return m.round <= (league?.currentRound || 1);
        }
        return league?.status === 'knockout';
      });
      return [...myMatches].sort((a, b) => {
        const roundA = a.round;
        const roundB = b.round;
        if (typeof roundA === 'number' && typeof roundB === 'number') return roundA - roundB;
        if (typeof roundA === 'number') return -1;
        if (typeof roundB === 'number') return 1;
        return String(roundA).localeCompare(String(roundB));
      });
    } else {
      // Group by selected round
      if (selectedDashboardRound === 'SF') {
        return fixtures.filter(m => m.round === 'SF1' || m.round === 'SF2');
      } else if (selectedDashboardRound === 'FINAL') {
        return fixtures.filter(m => m.round === 'FINAL');
      } else if (typeof selectedDashboardRound === 'number') {
        return fixtures.filter(m => m.round === selectedDashboardRound);
      }
      return [];
    }
  };

  const dashboardFixtures = getFilteredDashboardFixtures();

  // Round options for all round robin matches
  const roundRobinMatches = fixtures.filter(m => typeof m.round === 'number');
  const allRounds = Array.from(new Set(roundRobinMatches.map(m => m.round as number))).sort((a, b) => a - b);
  const rounds = allRounds.filter(r => r <= (league?.currentRound || 1));
  const hasSF = fixtures.some(m => m.round === 'SF1' || m.round === 'SF2');
  const hasFinal = fixtures.some(m => m.round === 'FINAL');

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* 1. PORTAL PANEL OR TEAM DASHBOARD */}
      {myTeam ? (
        /* ================== TEAM DASHBOARD VIEW ================== */
        <div className="space-y-4 sm:space-y-6">
          <div className="glass-panel rounded-2xl p-4 sm:p-6 glow-emerald border border-slate-800/80">
            {/* Header info bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-slate-850 pb-4 sm:pb-5">
              <div className="flex items-center gap-3">
                <span 
                  className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-slate-900 shadow-md flex-shrink-0"
                  style={{ backgroundColor: myTeam.color }}
                />
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-100 uppercase tracking-tight">{myTeam.name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    League: <span className="text-slate-400 font-semibold">{league?.name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded border ${
                  myTeam.status === 'approved' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : myTeam.status === 'rejected'
                      ? 'bg-rose-500/10 text-rose-450 border-rose-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {myTeam.status === 'approved' ? 'Approved Squad' : myTeam.status === 'rejected' ? 'Rejected' : 'Pending Approval'}
                </span>
                
                <button
                  onClick={handleDisconnectTeam}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-450 hover:text-slate-200 rounded-xl text-xs font-bold transition-all"
                  title="Log out of this team dashboard"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Exit Portal</span>
                </button>
              </div>
            </div>

            {/* Team Code Display */}
            <div className="mt-5 p-4 bg-slate-950/50 rounded-xl border border-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="text-left">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teammate Entry Code</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Provide this code to Player 2 to join your team roster from their device.
                </p>
              </div>
              <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl border border-slate-850 justify-between">
                <span className="font-mono text-base font-black tracking-widest text-emerald-400">{myTeam.code}</span>
                <div className="w-px h-5 bg-slate-800 mx-2" />
                <button
                  onClick={() => handleCopyCode(myTeam.code || '')}
                  className="p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title="Copy team code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Teammates visual card display */}
            <div className="grid gap-6 md:grid-cols-2 mt-6">
              {/* Player 1 Card */}
              <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[9px] font-black uppercase text-emerald-450 tracking-wider">Player 1 (Creator)</span>
                  <h4 className="font-bold text-slate-200 truncate mt-1 text-base">{myTeam.players[0].name}</h4>
                  <p className="text-xs text-slate-500 uppercase font-semibold mt-0.5">{myTeam.players[0].position}</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-black text-lg">
                  #{myTeam.players[0].number}
                </div>
              </div>

              {/* Player 2 Card */}
              {myTeam.players.length >= 2 ? (
                <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-850 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="text-[9px] font-black uppercase text-emerald-450 tracking-wider">Player 2 (Teammate)</span>
                    <h4 className="font-bold text-slate-200 truncate mt-1 text-base">{myTeam.players[1].name}</h4>
                    <p className="text-xs text-slate-500 uppercase font-semibold mt-0.5">{myTeam.players[1].position}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-black text-lg">
                    #{myTeam.players[1].number}
                  </div>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-center text-slate-500 text-xs animate-pulse">
                  <div>
                    <UserPlus className="w-6 h-6 mx-auto text-slate-700 mb-1" />
                    <span>Waiting for Player 2 to join with code...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats & Matches info */}
          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {/* Stats Block - Simplified Standings Points Table (1 Col Wide) */}
            <div className="md:col-span-1 glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800">
              <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-1.5 border-b border-slate-850 pb-2">
                <Trophy className="w-4 h-4 text-emerald-400" />
                <span>League Points Table</span>
              </h3>

              {approvedStandings.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  League standings will populate once teams are approved.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Brief overview of user's own team status */}
                  {myStanding && (
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="text-[9px] text-slate-450 uppercase font-bold tracking-wider">Your Position</span>
                        <span className="block text-lg font-black text-emerald-400 font-mono">
                          #{myStanding.pos} <span className="text-xs font-semibold text-slate-400 lowercase">place</span>
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] text-slate-455 uppercase font-bold tracking-wider">Your Points</span>
                        <span className="block text-lg font-black text-emerald-400 font-mono">
                          {myStanding.pts} <span className="text-xs font-semibold text-slate-400 uppercase font-bold">pts</span>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Clean table showing ONLY the points */}
                  <div className="overflow-hidden rounded-xl border border-slate-900 bg-slate-950/20">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-850 bg-slate-950 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                          <th className="py-2.5 px-3 text-center w-10">Pos</th>
                          <th className="py-2.5 px-2">Team</th>
                          <th className="py-2.5 px-3 text-center w-14">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/60 font-medium">
                        {approvedStandings.map((row) => {
                          const isOurs = row.teamId === myTeam.id;
                          return (
                            <tr 
                              key={row.teamId} 
                              className={`transition-colors ${
                                isOurs 
                                  ? 'bg-emerald-500/5 text-emerald-400 font-bold' 
                                  : 'text-slate-355 hover:bg-slate-900/20'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-mono font-bold">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${
                                  isOurs ? 'bg-emerald-500/10 text-emerald-400' : 'text-slate-500'
                                }`}>
                                  {row.pos}
                                </span>
                              </td>
                              <td className="py-2.5 px-2">
                                <div className="flex items-center gap-2 truncate max-w-[120px]">
                                  <span 
                                    className="w-2.5 h-2.5 rounded-full border border-slate-950 flex-shrink-0"
                                    style={{ backgroundColor: row.color }}
                                  />
                                  <span className="truncate">{row.teamName}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono font-black text-slate-100">
                                {row.pts}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Squad Fixtures list (2 Cols Wide) */}
            <div className="md:col-span-2 glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-850">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span>Tournament Fixtures</span>
                  </h3>
                  
                  {/* View Mode Toggle */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-900 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setFixtureViewMode('ours')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        fixtureViewMode === 'ours' ? 'bg-slate-900 text-emerald-400 border border-slate-800/80 shadow' : 'text-slate-550 hover:text-slate-350'
                      }`}
                    >
                      Our Matches
                    </button>
                    <button
                      type="button"
                      onClick={() => setFixtureViewMode('all')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        fixtureViewMode === 'all' ? 'bg-slate-900 text-emerald-400 border border-slate-800/80 shadow' : 'text-slate-550 hover:text-slate-350'
                      }`}
                    >
                      All Round Fixtures
                    </button>
                  </div>
                </div>

                {/* Round Dropdown Selector - only visible when view mode is 'all' */}
                {fixtureViewMode === 'all' && (rounds.length > 0 || hasSF || hasFinal) && (
                  <div className="flex items-center justify-between bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-900 mb-4">
                    <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Tournament Round</span>
                    <select
                      value={selectedDashboardRound || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'SF' || val === 'FINAL') {
                          setSelectedDashboardRound(val);
                        } else {
                          setSelectedDashboardRound(parseInt(val));
                        }
                      }}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-250 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {rounds.map(r => (
                        <option key={r} value={r}>
                          Round {r} {r === league?.currentRound && league?.status === 'active' ? '(Active)' : ''}
                        </option>
                      ))}
                      {hasSF && <option value="SF">Semi-Finals</option>}
                      {hasFinal && <option value="FINAL">Grand Final</option>}
                    </select>
                  </div>
                )}

                {/* Scrollable Matches List */}
                <div className="space-y-3 max-h-[350px] sm:max-h-[300px] overflow-y-auto pr-1">
                  {dashboardFixtures.length === 0 ? (
                    <div className="py-12 text-center text-slate-550 text-xs">
                      {league?.status === 'setup' 
                        ? 'Waiting for league setup to complete.' 
                        : 'No matches generated for this selection.'}
                    </div>
                  ) : (
                    dashboardFixtures.map((m) => {
                      const isMyMatch = m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id;
                      const isMyTeamHome = m.homeTeamId === myTeam.id;
                      const isMyTeamAway = m.awayTeamId === myTeam.id;

                      const homeTeam = teams[m.homeTeamId];
                      const awayTeam = teams[m.awayTeamId];

                      const homeName = homeTeam ? homeTeam.name : (m.homeTeamId === 'BYE' ? 'BYE' : 'TBD');
                      const awayName = awayTeam ? awayTeam.name : (m.awayTeamId === 'BYE' ? 'BYE' : 'TBD');

                      const homeColor = homeTeam ? homeTeam.color : '#475569';
                      const awayColor = awayTeam ? awayTeam.color : '#475569';

                      const canSubmit = canTeamSubmitScore(m);

                      return (
                        <div 
                          key={m.id} 
                          className={`relative flex flex-col p-3 bg-slate-955/40 rounded-xl border text-xs gap-2.5 transition-all ${
                            isMyMatch 
                              ? 'border-emerald-500/30 bg-emerald-950/5' 
                              : 'border-slate-900/60 bg-slate-955/15'
                          }`}
                        >
                          {/* Top Tag Header */}
                          {isMyMatch && (
                            <div className="flex items-center justify-between pb-1 border-b border-emerald-500/10">
                              <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                                <Star className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                                <span>Your Squad Match</span>
                              </span>
                              <span className="text-[9px] text-slate-500 font-mono uppercase font-bold">
                                {typeof m.round === 'number' ? `Round ${m.round}` : m.round}
                              </span>
                            </div>
                          )}

                          {/* Teams & Score Display */}
                          <div className="flex items-center justify-between gap-3">
                            {/* Home Team */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="w-2.5 h-2.5 rounded-full border border-slate-950 flex-shrink-0" style={{ backgroundColor: homeColor }} />
                              <span className={`font-semibold truncate ${isMyTeamHome ? 'text-emerald-400 font-bold' : 'text-slate-250'}`}>
                                {homeName}
                              </span>
                            </div>

                            {/* Score Display Box */}
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-950/90 rounded border border-slate-900 font-mono font-black text-slate-100 min-w-[56px] justify-center text-xs">
                              {m.isCompleted ? (
                                <span>{m.homeScore} - {m.awayScore}</span>
                              ) : m.scoreStatus === 'pending_approval' ? (
                                <span className="text-amber-400/80 text-[10px] animate-pulse">
                                  {m.proposedHomeScore} - {m.proposedAwayScore} (P)
                                </span>
                              ) : (
                                <span className="text-slate-650">vs</span>
                              )}
                            </div>

                            {/* Away Team */}
                            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                              <span className={`font-semibold truncate ${isMyTeamAway ? 'text-emerald-400 font-bold' : 'text-slate-255'}`}>
                                {awayName}
                              </span>
                              <span className="w-2.5 h-2.5 rounded-full border border-slate-955 flex-shrink-0" style={{ backgroundColor: awayColor }} />
                            </div>
                          </div>

                          {m.scoreStatus === 'pending_approval' && (
                            <div className="mt-1 text-[10px] text-amber-400/80 font-bold text-right flex items-center justify-end gap-1">
                              <span>⏳ Pending admin approval</span>
                            </div>
                          )}

                          {/* Submit score button */}
                          {canSubmit && editingMatchId !== m.id && (
                            <div className="mt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => startSubmitScore(m)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all shadow"
                              >
                                Submit Score
                              </button>
                            </div>
                          )}

                          {/* Editing Inline Form Panel */}
                          {editingMatchId === m.id && (
                            <div className="mt-2.5 p-3 bg-slate-950/90 rounded-xl border border-slate-850 space-y-3">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Enter Match Result
                              </p>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-[10px] text-slate-450 truncate max-w-[80px]">{homeName}</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={editHomeScore}
                                    onChange={(e) => setEditHomeScore(e.target.value)}
                                    className="w-12 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-center text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                                  />
                                </div>
                                <span className="text-slate-650 font-bold">:</span>
                                <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                  <input
                                    type="number"
                                    min="0"
                                    value={editAwayScore}
                                    onChange={(e) => setEditAwayScore(e.target.value)}
                                    className="w-12 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-center text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                                  />
                                  <span className="text-[10px] text-slate-455 truncate max-w-[80px]">{awayName}</span>
                                </div>
                              </div>

                              {editError && (
                                <p className="text-[10px] text-rose-450 text-center font-bold">{editError}</p>
                              )}

                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setEditingMatchId(null)}
                                  disabled={editSubmitting}
                                  className="text-[10px] text-slate-550 hover:text-slate-350 px-2 py-1 font-bold"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleScoreSubmit(m.id)}
                                  disabled={editSubmitting}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1 rounded-lg text-[10px] font-black transition-all shadow"
                                >
                                  {editSubmitting ? 'Saving...' : 'Confirm'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================== ENTRY PORTAL TABS VIEW ================== */
        <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto">
          {/* Navigation Tab Selectors */}
          <div className="flex bg-slate-950 p-1 sm:p-1.5 rounded-xl border border-slate-900">
            <button
              onClick={() => { setActivePortalTab('create'); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activePortalTab === 'create' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-450 hover:text-slate-250'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Create Team</span>
            </button>
            <button
              onClick={() => { setActivePortalTab('join'); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activePortalTab === 'join' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-450 hover:text-slate-250'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Join with Code</span>
            </button>
            <button
              onClick={() => { setActivePortalTab('access'); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activePortalTab === 'access' ? 'bg-slate-900 text-emerald-400 border border-slate-800' : 'text-slate-450 hover:text-slate-250'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Access Your Team</span>
            </button>
          </div>

          {/* Form Content Cards */}
          <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800 glow-emerald">
            {/* 1. CREATE SQUAD TAB */}
            {activePortalTab === 'create' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Create a Team</h3>
                    <p className="text-xs text-slate-400">Register Player 1 and get your squad join code</p>
                  </div>
                </div>

                {isRegistrationClosed ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-900">
                    🔒 Registration is closed for this tournament.
                  </div>
                ) : (
                  <form onSubmit={handleCreateTeamSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                          Team Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Real Madrid"
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                          Badge Color
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {PRESET_COLORS.map((c) => (
                            <button
                              type="button"
                              key={c.hex}
                              onClick={() => setSelectedColor(c.hex)}
                              className={`w-6 h-6 rounded-full border transition-all cursor-pointer relative ${
                                selectedColor === c.hex 
                                  ? 'border-slate-100 scale-105 shadow' 
                                  : 'border-slate-950 hover:border-slate-800'
                              }`}
                              style={{ backgroundColor: c.hex }}
                              title={c.name}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 space-y-3">
                      <p className="text-[10px] font-extrabold text-emerald-405 uppercase tracking-wider">
                        Player 1 Details (Creator)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <input
                            type="text"
                            placeholder="Player Name"
                            value={p1Name}
                            onChange={(e) => setP1Name(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            placeholder="Jersey No."
                            value={p1Number}
                            onChange={(e) => setP1Number(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <select
                            value={p1Position}
                            onChange={(e) => setP1Position(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                          >
                            {POSITIONS.map(pos => (
                              <option key={pos} value={pos}>{pos}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Team & Generate Code</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 2. JOIN TEAM TAB */}
            {activePortalTab === 'join' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Join Team Roster</h3>
                    <p className="text-xs text-slate-400">Join an existing squad using a shared team code</p>
                  </div>
                </div>

                {isRegistrationClosed ? (
                  <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-900">
                    🔒 Registration is closed for this tournament.
                  </div>
                ) : (
                  <form onSubmit={handleJoinTeamSubmit} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                        Enter Team Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 7X9KW"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono tracking-widest focus:outline-none"
                      />
                    </div>

                    <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-900 space-y-3">
                      <p className="text-[10px] font-extrabold text-emerald-405 uppercase tracking-wider">
                        Player 2 Details (Teammate)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <input
                            type="text"
                            placeholder="Player Name"
                            value={p2Name}
                            onChange={(e) => setP2Name(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            placeholder="Jersey No."
                            value={p2Number}
                            onChange={(e) => setP2Number(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none"
                          />
                        </div>
                        <div>
                          <select
                            value={p2Position}
                            onChange={(e) => setP2Position(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
                          >
                            {POSITIONS.map(pos => (
                              <option key={pos} value={pos}>{pos}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Join Team</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* 3. ACCESS TEAM TAB */}
            {activePortalTab === 'access' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Access Your Team Dashboard</h3>
                    <p className="text-xs text-slate-400">Enter your team code to view your roster and fixtures on this device</p>
                  </div>
                </div>

                <form onSubmit={handleAccessTeamSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                      Enter Team Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 7X9KW"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono tracking-widest focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow"
                  >
                    <Tv className="w-4 h-4" />
                    <span>Enter Dashboard</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Errors and Success alerts */}
      {error && (
        <div className="p-3 bg-rose-950/20 border border-rose-500/20 text-rose-450 text-xs rounded-xl text-center font-bold max-w-2xl mx-auto animate-pulse">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl text-center font-bold max-w-2xl mx-auto">
          {success}
        </div>
      )}

      {/* 2. PUBLIC TEAMS ROSTER LIST (Visible to all viewers) */}
      <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-805/80">
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Registered Teams</h2>
            <p className="text-xs text-slate-400">Rosters entered for this tournament</p>
          </div>
        </div>

        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {leagueTeams.length === 0 ? (
            <div className="col-span-full py-8 text-center text-slate-500 text-xs">
              No teams entered yet. Start by filling the form above.
            </div>
          ) : (
            leagueTeams.map((t) => (
              <div 
                key={t.id} 
                className={`p-4 rounded-xl border border-slate-850 bg-slate-900/20 space-y-4 transition-all hover:border-slate-700`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-3.5 h-3.5 rounded-full border border-slate-955 flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="font-bold text-slate-200 truncate">{t.name}</span>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border ${
                    t.status === 'approved' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : t.status === 'rejected'
                        ? 'bg-rose-500/10 text-rose-455 border-rose-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {t.status}
                  </span>
                </div>

                {/* Lineup list */}
                <div className="space-y-2">
                  {t.players.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-950/30 p-2 rounded border border-slate-900 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-slate-500 font-mono font-bold">#{p.number}</span>
                        <span className="font-semibold text-slate-200 truncate">{p.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">{p.position}</span>
                    </div>
                  ))}

                  {t.players.length === 1 && (
                    <div className="p-3 border border-dashed border-slate-850 rounded text-center text-slate-550 text-[11px] flex items-center justify-center gap-1.5 animate-pulse">
                      <span>Waiting for teammate to join...</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
