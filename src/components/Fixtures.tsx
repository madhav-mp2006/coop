import React, { useState } from 'react';
import type { Match, Team, AppUser } from '../services/firebase';
import { Calendar, CheckCircle2, ShieldAlert, Edit3 } from 'lucide-react';

interface FixturesProps {
  fixtures: Match[];
  teams: Record<string, Team>;
  currentRound: number;
  currentUser: AppUser | null;
  onUpdateScore: (matchId: string, homeScore: number, awayScore: number) => Promise<void>;
}

export const Fixtures: React.FC<FixturesProps> = ({
  fixtures,
  teams,
  currentRound,
  currentUser,
  onUpdateScore
}) => {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group fixtures by round (only numeric round-robin rounds here)
  const roundRobinMatches = fixtures.filter(m => typeof m.round === 'number');
  const allRounds = Array.from(new Set(roundRobinMatches.map(m => m.round as number))).sort((a, b) => a - b);
  // Only show rounds up to currentRound
  const rounds = allRounds.filter(r => r <= currentRound);

  const startSubmitScore = (match: Match) => {
    setSelectedMatchId(match.id);
    setHomeScore(match.homeScore !== null ? match.homeScore.toString() : '');
    setAwayScore(match.awayScore !== null ? match.awayScore.toString() : '');
    setError(null);
  };

  const handleScoreSubmit = async (matchId: string) => {
    const hScoreVal = parseInt(homeScore);
    const aScoreVal = parseInt(awayScore);

    if (isNaN(hScoreVal) || isNaN(aScoreVal) || hScoreVal < 0 || aScoreVal < 0) {
      setError('Please enter valid, non-negative scores.');
      return;
    }

    try {
      setSubmitting(true);
      await onUpdateScore(matchId, hScoreVal, aScoreVal);
      setSelectedMatchId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to update score.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-8">
      {rounds.length === 0 ? (
        <div className="glass-panel rounded-2xl p-8 text-center text-slate-500 glow-emerald">
          <Calendar className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-slate-600 mb-3 animate-pulse" />
          <p className="text-sm">Fixtures will appear once the league is active and schedules are generated.</p>
        </div>
      ) : (
        rounds.map((roundNum) => {
          const isRoundActive = roundNum === currentRound;
          const isRoundLocked = roundNum > currentRound;
          const roundMatches = roundRobinMatches.filter(m => m.round === roundNum);

          return (
            <div
              key={roundNum}
              className={`glass-panel rounded-2xl p-4 sm:p-6 transition-all duration-300 ${
                isRoundActive
                  ? 'border-emerald-500/30 bg-slate-900/75 glow-emerald'
                  : 'opacity-70 border-slate-800'
              }`}
            >
              {/* Round Header */}
              <div className="flex items-center justify-between mb-4 sm:mb-6 border-b border-slate-800/80 pb-3 sm:pb-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className={`p-2 sm:p-2.5 rounded-xl ${
                    isRoundActive
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-100">Round {roundNum}</h3>
                    <p className="text-xs text-slate-400 hidden sm:block">
                      {isRoundActive
                        ? 'Active Round'
                        : isRoundLocked
                          ? 'Locked — Complete current round first'
                          : 'Completed'}
                    </p>
                  </div>
                </div>
                {isRoundActive && (
                  <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    Active
                  </span>
                )}
              </div>

              {/* Match Cards Grid */}
              <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                {roundMatches.map((match) => {
                  const homeTeam = teams[match.homeTeamId];
                  const awayTeam = teams[match.awayTeamId];

                  if (!homeTeam || !awayTeam) return null;

                  const isCompleted = match.isCompleted;
                  const isAdmin = currentUser?.role === 'admin';
                  const canEnterScore = isRoundActive && isAdmin;
                  const isEditing = selectedMatchId === match.id;

                  return (
                    <div
                      key={match.id}
                      className={`relative flex flex-col justify-between p-3 sm:p-4 rounded-xl border transition-all duration-300 ${
                        isCompleted
                          ? 'bg-slate-950/40 border-slate-800/80'
                          : 'bg-slate-900/40 border-slate-800'
                      } ${canEnterScore ? 'hover:border-slate-700/80' : ''}`}
                    >
                      {/* Teams & Score Row */}
                      <div className="flex items-center justify-between gap-2 py-1 sm:py-2">
                        {/* Home Team */}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {homeTeam.flagCode ? (
                            <img
                              src={`https://flagcdn.com/w40/${homeTeam.flagCode.toLowerCase()}.png`}
                              className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                              alt={`${homeTeam.name} flag`}
                            />
                          ) : (
                            <span
                              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: homeTeam.color }}
                            />
                          )}
                          <span className="font-semibold text-slate-200 truncate text-xs sm:text-sm">{homeTeam.name}</span>
                        </div>

                        {/* Score Box */}
                        <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 bg-slate-950/80 rounded-lg border border-slate-800 font-mono text-base sm:text-lg font-bold min-w-[56px] sm:min-w-[70px] justify-center flex-shrink-0">
                          {isCompleted ? (
                            <>
                              <span className="text-slate-100">{match.homeScore}</span>
                              <span className="text-slate-600">:</span>
                              <span className="text-slate-100">{match.awayScore}</span>
                            </>
                          ) : (
                            <span className="text-slate-600 text-sm">vs</span>
                          )}
                        </div>

                        {/* Away Team */}
                        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end text-right">
                          <span className="font-semibold text-slate-200 truncate text-xs sm:text-sm">{awayTeam.name}</span>
                          {awayTeam.flagCode ? (
                            <img
                              src={`https://flagcdn.com/w40/${awayTeam.flagCode.toLowerCase()}.png`}
                              className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                              alt={`${awayTeam.name} flag`}
                            />
                          ) : (
                            <span
                              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: awayTeam.color }}
                            />
                          )}
                        </div>
                      </div>

                      {/* Status & Action Bar */}
                      <div className="mt-2 sm:mt-3 flex items-center justify-between border-t border-slate-800/40 pt-2 sm:pt-3">
                        <div className="flex items-center gap-1.5 text-xs">
                          {isCompleted ? (
                            <div className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Score confirmed</span>
                              <span className="sm:hidden">Done</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">Scheduled</span>
                          )}

                          {match.isDisputed && (
                            <div className="flex items-center gap-1 text-amber-500 font-bold ml-2">
                              <ShieldAlert className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Disputed!</span>
                            </div>
                          )}
                        </div>

                        {canEnterScore && !isEditing && (
                          <button
                            onClick={() => startSubmitScore(match)}
                            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors bg-emerald-500/10 hover:bg-emerald-500/25 px-2.5 py-1.5 rounded-md border border-emerald-500/20 tap-target"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isCompleted ? 'Override' : 'Submit Score'}</span>
                            <span className="sm:hidden">Score</span>
                          </button>
                        )}
                      </div>

                      {/* Inline Score Input Panel */}
                      {isEditing && (
                        <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800/80 space-y-3">
                          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                            Enter Score
                          </p>
                          <div className="flex items-center justify-between gap-2 sm:gap-4">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xs text-slate-400 truncate max-w-[60px] sm:max-w-[80px]">{homeTeam.name}</span>
                              <input
                                type="number"
                                min="0"
                                value={homeScore}
                                onChange={(e) => setHomeScore(e.target.value)}
                                className="w-12 sm:w-14 bg-slate-900 border border-slate-800 rounded px-2 py-2 text-center text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                            <span className="text-slate-500 font-bold">:</span>
                            <div className="flex items-center gap-2 flex-1 justify-end">
                              <input
                                type="number"
                                min="0"
                                value={awayScore}
                                onChange={(e) => setAwayScore(e.target.value)}
                                className="w-12 sm:w-14 bg-slate-900 border border-slate-800 rounded px-2 py-2 text-center text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
                              />
                              <span className="text-xs text-slate-400 truncate max-w-[60px] sm:max-w-[80px] text-right">{awayTeam.name}</span>
                            </div>
                          </div>

                          {error && <p className="text-xs text-rose-400 text-center font-medium">{error}</p>}

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => setSelectedMatchId(null)}
                              disabled={submitting}
                              className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded transition-colors tap-target"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleScoreSubmit(match.id)}
                              disabled={submitting}
                              className="text-xs bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded transition-colors shadow-lg"
                            >
                              {submitting ? 'Saving...' : 'Save Result'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
