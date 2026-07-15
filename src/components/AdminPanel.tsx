import React, { useState } from 'react';
import type { LeagueSettings, Team, Match } from '../services/firebase';
import { Settings, Users, ArrowRight, Play, RefreshCw, Check, X, ShieldAlert, Layers, Trash2 } from 'lucide-react';

interface AdminPanelProps {
  league: LeagueSettings | null;
  leagues: Record<string, LeagueSettings>;
  activeLeagueId: string | null;
  teams: Record<string, Team>;
  fixtures: Match[];
  onCreateLeague: (id: string, settings: Omit<LeagueSettings, 'status' | 'currentRound' | 'totalRounds' | 'id'>) => Promise<void>;
  onApproveTeam: (teamId: string, status: 'approved' | 'rejected' | 'pending') => Promise<void>;
  onStartLeague: () => Promise<void>;
  onSelectActiveLeague: (id: string | null) => Promise<void>;
  onReset: () => Promise<void>;
  onDeleteLeague: (id: string) => Promise<void>;
  onDeleteTeam: (teamId: string) => Promise<void>;
  onUpdateScore: (matchId: string, homeScore: number, awayScore: number) => Promise<void>;
  onResetMatchScore?: (matchId: string) => Promise<void>;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  league,
  leagues,
  activeLeagueId,
  teams,
  fixtures,
  onCreateLeague,
  onApproveTeam,
  onStartLeague,
  onSelectActiveLeague,
  onReset,
  onDeleteLeague,
  onDeleteTeam,
  onUpdateScore,
  onResetMatchScore
}) => {
  const [leagueName, setLeagueName] = useState('');
  const [teamCount, setTeamCount] = useState(4);
  const [wPoints, setWPoints] = useState(3);
  const [dPoints, setDPoints] = useState(1);
  const [lPoints, setLPoints] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Score override / approval states
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [editHomeScore, setEditHomeScore] = useState<string>('');
  const [editAwayScore, setEditAwayScore] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const startEditScore = (match: Match) => {
    setEditingMatchId(match.id);
    setEditHomeScore(match.proposedHomeScore !== null && match.proposedHomeScore !== undefined ? match.proposedHomeScore.toString() : '');
    setEditAwayScore(match.proposedAwayScore !== null && match.proposedAwayScore !== undefined ? match.proposedAwayScore.toString() : '');
    setOverrideError(null);
  };

  const handleApproveScore = async (matchId: string) => {
    const match = fixtures.find(m => m.id === matchId);
    if (!match) return;
    const homeS = match.proposedHomeScore ?? 0;
    const awayS = match.proposedAwayScore ?? 0;
    if (!window.confirm(`Are you sure you want to approve the score as ${homeS} - ${awayS}?`)) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onUpdateScore(matchId, homeS, awayS);
    } catch (err: any) {
      setError(err.message || 'Failed to approve score.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverrideSubmit = async (matchId: string) => {
    const hVal = parseInt(editHomeScore);
    const aVal = parseInt(editAwayScore);
    if (isNaN(hVal) || isNaN(aVal) || hVal < 0 || aVal < 0) {
      setOverrideError('Please enter valid, non-negative scores.');
      return;
    }
    if (!window.confirm(`Are you sure you want to override and approve the score as ${hVal} - ${aVal}?`)) {
      return;
    }

    try {
      setSubmitting(true);
      setOverrideError(null);
      await onUpdateScore(matchId, hVal, aVal);
      setEditingMatchId(null);
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to override score.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter teams registered for the active league
  const activeLeagueTeams = Object.values(teams).filter(t => t.leagueId === activeLeagueId);
  const approvedTeamsCount = activeLeagueTeams.filter(t => t.status === 'approved').length;

  const pendingApprovals = fixtures.filter(m => m.leagueId === activeLeagueId && m.scoreStatus === 'pending_approval');

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueName.trim()) {
      setError('League name is required.');
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      const newLeagueId = `league-${Date.now()}`;
      await onCreateLeague(newLeagueId, {
        name: leagueName,
        teamCount,
        wPoints,
        dPoints,
        lPoints
      });
      setLeagueName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create league.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartLeague = async () => {
    if (approvedTeamsCount !== (league?.teamCount || 4)) {
      setError(`You must approve exactly ${league?.teamCount} teams before starting.`);
      return;
    }
    try {
      setSubmitting(true);
      setError(null);
      await onStartLeague();
    } catch (err: any) {
      setError(err.message || 'Failed to start tournament.');
    } finally {
      setSubmitting(false);
    }
  };

  const leaguesList = Object.values(leagues);

  return (
    <div className="space-y-4 sm:space-y-8">
      {/* 1. LEAGUE SELECTOR & CREATOR (Multiple Leagues Manager) */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Leagues List (2 Cols Wide) */}
        <div className="lg:col-span-2 glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 flex-shrink-0">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">League Dashboard</h2>
              <p className="text-xs text-slate-400 hidden sm:block">Manage, select, and switch between tournaments</p>
            </div>
          </div>

          <div className="space-y-3 max-h-[300px] sm:max-h-[360px] overflow-y-auto pr-1">
            {leaguesList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No leagues created yet. Use the panel on the right to start a tournament.
              </div>
            ) : (
              leaguesList.map((l) => {
                const isActive = l.id === activeLeagueId;
                const leagueTeams = Object.values(teams).filter(t => t.leagueId === l.id);
                const approvedCount = leagueTeams.filter(t => t.status === 'approved').length;

                return (
                  <div 
                    key={l.id} 
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border transition-all duration-300 gap-3 ${
                      isActive 
                        ? 'border-emerald-500/40 bg-emerald-950/5' 
                        : 'border-slate-850 hover:border-slate-700 bg-slate-900/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200 truncate text-sm">{l.name}</span>
                        {isActive && (
                          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase font-black px-1.5 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 font-mono">
                        <span>Slots: {approvedCount} / {l.teamCount} Approved</span>
                        <span>Points: W={l.wPoints} D={l.dPoints} L={l.lPoints}</span>
                      </div>
                      <span className="inline-block mt-1 text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">
                        Status: <span className="text-emerald-500">{l.status}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto self-stretch sm:self-auto justify-end">
                      {!isActive && (
                        <button
                          onClick={() => onSelectActiveLeague(l.id)}
                          className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-slate-100 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                        >
                          Activate
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteLeague(l.id)}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 rounded-lg border border-rose-500/20 transition-colors flex-shrink-0"
                        title="Delete Tournament"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* League Creation Form (1 Col Wide) */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800">
          <div className="flex items-center gap-3 mb-4 sm:mb-6">
            <div className="p-2 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 flex-shrink-0">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100">New League</h2>
              <p className="text-xs text-slate-400">Create a tournament</p>
            </div>
          </div>

          <form onSubmit={handleCreateLeague} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. Winter Cup"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Team Slots
              </label>
              <select
                value={teamCount}
                onChange={(e) => setTeamCount(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-850 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value={4}>4 Teams</option>
                <option value={6}>6 Teams</option>
                <option value={8}>8 Teams</option>
                <option value={10}>10 Teams</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Points Distribution
              </label>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="block text-[9px] text-slate-500 text-center uppercase font-bold mb-1">Win</span>
                  <input
                    type="number"
                    value={wPoints}
                    onChange={(e) => setWPoints(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-850 text-center rounded p-1 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <span className="block text-[9px] text-slate-500 text-center uppercase font-bold mb-1">Draw</span>
                  <input
                    type="number"
                    value={dPoints}
                    onChange={(e) => setDPoints(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-850 text-center rounded p-1 font-mono text-slate-100"
                  />
                </div>
                <div>
                  <span className="block text-[9px] text-slate-500 text-center uppercase font-bold mb-1">Loss</span>
                  <input
                    type="number"
                    value={lPoints}
                    onChange={(e) => setLPoints(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-850 text-center rounded p-1 font-mono text-slate-100"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-rose-400 font-semibold">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm transition-colors shadow flex items-center justify-center gap-1.5"
            >
              <span>Create Tournament</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* 2. TEAMS MANAGEMENT & ROSTER APPROVALS FOR ACTIVE LEAGUE */}
      {activeLeagueId ? (
        <div className="space-y-4 sm:space-y-6">
          <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>Active League:</span>
                  <span className="text-emerald-400">{league ? league.name : 'Selected'}</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Status: <span className="uppercase text-slate-300 font-semibold">{league?.status}</span>.
                  Rosters and registrations below are associated with this active tournament.
                </p>
              </div>

              {league?.status === 'registration' && (
                <div className="bg-slate-950 px-4 py-2 rounded-xl border border-slate-850 flex items-center gap-6">
                  <div>
                    <span className="block text-[9px] text-slate-500 uppercase font-semibold">Approved Slot</span>
                    <span className="text-base font-extrabold font-mono text-emerald-400">
                      {approvedTeamsCount} / {league.teamCount}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-800" />
                  <div>
                    <span className="block text-[9px] text-slate-500 uppercase font-semibold">Registered</span>
                    <span className="text-base font-extrabold font-mono text-slate-350">
                      {activeLeagueTeams.length} Total
                    </span>
                  </div>
                </div>
              )}
            </div>

            {league?.status === 'registration' && approvedTeamsCount === league.teamCount && (
              <div className="mt-4 p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-xs text-slate-300 text-center sm:text-left">
                  🌟 All required team slots filled! You can now generate the round-robin schedule and start the league.
                </span>
                <button
                  onClick={handleStartLeague}
                  disabled={submitting}
                  className="bg-emerald-500 hover:bg-emerald-450 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 text-xs transition-colors shadow"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Generate Schedule & Start</span>
                </button>
              </div>
            )}
          </div>

          {/* Teams / Roster Visualizer grid */}
          <div className="grid gap-3 sm:gap-6 md:grid-cols-2">
            {activeLeagueTeams.length === 0 ? (
              <div className="col-span-2 glass-panel rounded-2xl p-8 text-center text-slate-500">
                <Users className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                <p className="text-xs">No teams registered for this league yet. Captains can sign up and submit rosters.</p>
              </div>
            ) : (
              activeLeagueTeams.map((team) => (
                <div 
                  key={team.id} 
                  className={`glass-panel p-4 sm:p-5 rounded-2xl border transition-all duration-300 ${
                    team.status === 'approved' 
                      ? 'border-emerald-500/20 bg-emerald-950/5' 
                      : team.status === 'rejected'
                        ? 'border-rose-500/10 opacity-70' 
                        : 'border-slate-800 bg-slate-900/20'
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {team.flagCode ? (
                          <img
                            src={`https://flagcdn.com/w40/${team.flagCode.toLowerCase()}.png`}
                            className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                            alt={`${team.name} flag`}
                          />
                        ) : (
                          <span 
                            className="w-3.5 h-3.5 rounded-full border border-slate-950 flex-shrink-0"
                            style={{ backgroundColor: team.color }}
                          />
                        )}
                        <h3 className="font-bold text-slate-200 truncate text-base">{team.name}</h3>
                      </div>
                      <p className="text-xs text-slate-400">Captain: {team.captainEmail}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Players: {team.players.length} registered</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {league?.status === 'registration' && team.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => onApproveTeam(team.id, 'approved')}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors"
                            title="Approve Team"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onApproveTeam(team.id, 'rejected')}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 rounded-lg border border-rose-500/20 transition-colors"
                            title="Reject Team"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            team.status === 'approved' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {team.status}
                          </span>
                          {league?.status === 'registration' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onApproveTeam(team.id, 'pending')}
                                className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                              >
                                Reconsider
                              </button>
                              {team.status === 'rejected' && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm('Are you sure you want to delete this rejected team permanently?')) {
                                      await onDeleteTeam(team.id);
                                    }
                                  }}
                                  className="p-1 text-rose-450 hover:text-rose-300 hover:bg-rose-500/10 rounded transition-colors"
                                  title="Delete Team"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Player Roster Section (Fully Visible on Admin Dashboard) */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                      <span>Roster List</span>
                      <span className="font-mono text-slate-650">{team.players.length} Players</span>
                    </p>
                    {team.players.length === 0 ? (
                      <p className="text-[11px] text-slate-500 italic">No players registered on squad roster.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-350">
                        {team.players.map((p, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 bg-slate-950/30 p-1.5 rounded border border-slate-900">
                            <div className="truncate flex-1 min-w-0">
                              <span className="font-semibold text-slate-200">{p.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pending score approvals card */}
          {activeLeagueId && league && (league.status === 'active' || league.status === 'knockout') && (
            <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-800 mt-4 sm:mt-6">
              <div className="flex items-center gap-3 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-800">
                <div className="p-2 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 flex-shrink-0">
                  <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-wide">Pending Score Approvals</h2>
                  <p className="text-xs text-slate-400 hidden sm:block">Review, override, and approve scores submitted by team captains</p>
                </div>
              </div>

              {pendingApprovals.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs bg-slate-950/20 rounded-xl border border-slate-900">
                  No pending match score approvals at the moment.
                </div>
              ) : (
                <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                  {pendingApprovals.map((m) => {
                    const homeTeam = teams[m.homeTeamId];
                    const awayTeam = teams[m.awayTeamId];
                    const homeName = homeTeam ? homeTeam.name : 'TBD';
                    const awayName = awayTeam ? awayTeam.name : 'TBD';
                    const isEditing = editingMatchId === m.id;

                    return (
                      <div key={m.id} className="p-4 rounded-xl border border-slate-850 bg-slate-950/30 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="font-mono bg-slate-900 border border-slate-850 px-2 py-0.5 rounded font-bold text-slate-400">
                            {typeof m.round === 'number' ? `Round ${m.round}` : m.round}
                          </span>
                          <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">
                            Pending Approval
                          </span>
                        </div>

                        {/* Teams & Score — stacked rows for mobile readability */}
                        <div className="flex flex-col gap-1.5 bg-slate-950/40 rounded-xl px-3 py-2.5 border border-slate-900">
                          {/* Home team row */}
                          <div className="flex items-center gap-2">
                            {homeTeam?.flagCode ? (
                              <img
                                src={`https://flagcdn.com/w40/${homeTeam.flagCode.toLowerCase()}.png`}
                                className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                                alt={`${homeName} flag`}
                              />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full border border-slate-950 flex-shrink-0" style={{ backgroundColor: homeTeam?.color || '#475569' }} />
                            )}
                            <span className="text-xs font-semibold text-slate-200 flex-1 min-w-0 truncate">{homeName}</span>
                            <span className="font-mono font-black text-emerald-400 text-base w-6 text-right flex-shrink-0">{m.proposedHomeScore}</span>
                          </div>
                          {/* Divider */}
                          <div className="flex items-center gap-2 pl-7">
                            <span className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">vs</span>
                          </div>
                          {/* Away team row */}
                          <div className="flex items-center gap-2">
                            {awayTeam?.flagCode ? (
                              <img
                                src={`https://flagcdn.com/w40/${awayTeam.flagCode.toLowerCase()}.png`}
                                className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                                alt={`${awayName} flag`}
                              />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full border border-slate-950 flex-shrink-0" style={{ backgroundColor: awayTeam?.color || '#475569' }} />
                            )}
                            <span className="text-xs font-semibold text-slate-200 flex-1 min-w-0 truncate">{awayName}</span>
                            <span className="font-mono font-black text-emerald-400 text-base w-6 text-right flex-shrink-0">{m.proposedAwayScore}</span>
                          </div>
                        </div>

                        {/* Action buttons — full width on mobile */}
                        {!isEditing ? (
                          <div className="flex gap-2 border-t border-slate-900/60 pt-3">
                            <button
                              type="button"
                              onClick={() => startEditScore(m)}
                              className="flex-1 bg-slate-900 hover:bg-slate-800 text-slate-350 border border-slate-800 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors text-center"
                            >
                              Override
                            </button>
                            {onResetMatchScore && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (window.confirm("Are you sure you want to reject and reset this pending score submission?")) {
                                    await onResetMatchScore(m.id);
                                  }
                                }}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors text-center"
                              >
                                Reject
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleApproveScore(m.id)}
                              disabled={submitting}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow text-center"
                            >
                              ✓ Approve
                            </button>
                          </div>
                        ) : (
                          <div className="mt-2.5 p-3 bg-slate-950 rounded-xl border border-slate-850 space-y-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Override Result & Approve
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-[10px] text-slate-450 truncate max-w-[80px]">{homeName}</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={editHomeScore}
                                  onChange={(e) => setEditHomeScore(e.target.value)}
                                  className="w-12 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-center text-slate-100 font-mono text-xs focus:outline-none"
                                />
                              </div>
                              <span className="text-slate-650 font-bold">:</span>
                              <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                                <input
                                  type="number"
                                  min="0"
                                  value={editAwayScore}
                                  onChange={(e) => setEditAwayScore(e.target.value)}
                                  className="w-12 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-center text-slate-100 font-mono text-xs focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-455 truncate max-w-[80px]">{awayName}</span>
                              </div>
                            </div>

                            {overrideError && (
                              <p className="text-[10px] text-rose-450 text-center font-bold">{overrideError}</p>
                            )}

                            <div className="flex gap-2 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingMatchId(null)}
                                className="text-[10px] text-slate-550 hover:text-slate-350 px-2 py-1 font-bold"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOverrideSubmit(m.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1 rounded-lg text-[10px] font-black transition-all shadow"
                              >
                                Confirm Override
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel p-8 rounded-2xl border border-slate-800 text-center text-slate-500 text-sm">
          No league selected as active. Select or create one above to view and approve teams.
        </div>
      )}

      {/* 3. ACTIVE LEAGUE DESTRUCTIVE ACTIONS */}
      {league && (league.status === 'active' || league.status === 'knockout' || league.status === 'finished') && (
        <div className="glass-panel rounded-2xl p-4 sm:p-6 border border-slate-850">
          <h2 className="text-sm font-bold text-slate-250 mb-1">Reset League</h2>
          <p className="text-xs text-slate-450 mb-4">
            Wipe all scores, teams, and tournament progression for <span className="text-rose-400 font-semibold">{league.name}</span>.
          </p>

          <div className="p-4 bg-rose-950/15 border border-rose-500/20 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-lg text-rose-450">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Destructive Actions</p>
                <p className="text-[11px] text-slate-500">This action cannot be undone.</p>
              </div>
            </div>
            <button
              onClick={onReset}
              className="bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold px-4 py-2 rounded-xl transition-all shadow text-xs flex items-center gap-1.5 flex-shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Active Tournament</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
