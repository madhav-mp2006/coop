import React, { useState } from 'react';
import type { Match, Team, AppUser } from '../services/firebase';
import { Trophy, ArrowDown, Award } from 'lucide-react';

interface KnockoutBracketProps {
  fixtures: Match[];
  teams: Record<string, Team>;
  currentUser: AppUser | null;
  onUpdateScore: (matchId: string, homeScore: number, awayScore: number) => Promise<void>;
  championId: string | null | undefined;
  onReset: () => Promise<void>;
}

export const KnockoutBracket: React.FC<KnockoutBracketProps> = ({
  fixtures,
  teams,
  currentUser,
  onUpdateScore,
  championId,
  onReset
}) => {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sf1 = fixtures.find(m => m.round === 'SF1');
  const sf2 = fixtures.find(m => m.round === 'SF2');
  const finalMatch = fixtures.find(m => m.round === 'FINAL');

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

    if (hScoreVal === aScoreVal) {
      setError('Knockout matches cannot end in a draw. Include penalty shootout goals to determine a winner.');
      return;
    }

    if (!window.confirm(`Are you sure you want to submit this knockout score as ${hScoreVal} - ${aScoreVal}?`)) {
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

  const renderTeamName = (teamId: string, placeholder: string) => {
    if (teamId === 'TBD' || !teamId) {
      return <span className="text-slate-500 italic text-sm">{placeholder}</span>;
    }
    const team = teams[teamId];
    return team ? (
      <div className="flex items-center gap-2 min-w-0">
        {team.flagCode ? (
          <img
            src={`https://flagcdn.com/w40/${team.flagCode.toLowerCase()}.png`}
            className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
            alt={`${team.name} flag`}
          />
        ) : (
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: team.color }}
          />
        )}
        <span className="font-semibold text-slate-200 truncate text-sm">{team.name}</span>
      </div>
    ) : (
      <span className="text-slate-400 text-sm">Loading...</span>
    );
  };

  const renderMatchCard = (match: Match | undefined, label: string, placeholderHome: string, placeholderAway: string) => {
    if (!match) return null;

    const homeTeam = teams[match.homeTeamId];
    const awayTeam = teams[match.awayTeamId];
    const isCompleted = match.isCompleted;

    const isAdmin = currentUser?.role === 'admin';
    const isFinalReady = match.round === 'FINAL' && match.homeTeamId !== 'TBD' && match.awayTeamId !== 'TBD';
    const canEnterScore = (match.round !== 'FINAL' || isFinalReady) && isAdmin;

    const isEditing = selectedMatchId === match.id;

    return (
      <div
        className={`glass-panel p-4 rounded-xl border transition-all duration-300 relative ${
          isCompleted
            ? 'border-emerald-500/20 bg-slate-900/30'
            : 'border-slate-800 bg-slate-900/60'
        } ${canEnterScore ? 'hover:border-slate-700' : ''}`}
      >
        <span className="absolute -top-2.5 left-4 bg-slate-900 border border-slate-800 text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded text-emerald-400">
          {label}
        </span>

        <div className="space-y-3 pt-1">
          {/* Home Team Row */}
          <div className="flex items-center justify-between gap-2">
            {renderTeamName(match.homeTeamId, placeholderHome)}
            {isCompleted && match.homeScore !== null && (
              <span className={`font-mono font-bold text-xl flex-shrink-0 ${
                match.homeScore > (match.awayScore || 0) ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {match.homeScore}
              </span>
            )}
          </div>

          <div className="h-px bg-slate-800/60" />

          {/* Away Team Row */}
          <div className="flex items-center justify-between gap-2">
            {renderTeamName(match.awayTeamId, placeholderAway)}
            {isCompleted && match.awayScore !== null && (
              <span className={`font-mono font-bold text-xl flex-shrink-0 ${
                match.awayScore > (match.homeScore || 0) ? 'text-emerald-400' : 'text-slate-400'
              }`}>
                {match.awayScore}
              </span>
            )}
          </div>
        </div>

        {/* Action Panel */}
        <div className="mt-3 pt-2 border-t border-slate-800/40 flex justify-between items-center text-xs">
          {isCompleted ? (
            <span className="text-emerald-400/90 font-medium">Result Confirmed</span>
          ) : (
            <span className="text-slate-500">Awaiting score</span>
          )}

          {canEnterScore && !isEditing && (
            <button
              onClick={() => startSubmitScore(match)}
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded tap-target"
            >
              {isCompleted ? 'Edit' : 'Submit'}
            </button>
          )}
        </div>

        {/* Inline Score Input */}
        {isEditing && (
          <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-xs text-slate-400 truncate max-w-[60px]">
                {homeTeam?.name || placeholderHome}
              </span>
              <input
                type="number"
                min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(e.target.value)}
                className="w-12 bg-slate-900 border border-slate-800 rounded py-2 text-center text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500 font-bold">:</span>
              <input
                type="number"
                min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(e.target.value)}
                className="w-12 bg-slate-900 border border-slate-800 rounded py-2 text-center text-slate-100 font-mono text-sm focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 truncate max-w-[60px] text-right">
                {awayTeam?.name || placeholderAway}
              </span>
            </div>
            {error && <p className="text-[11px] text-rose-400 text-center font-medium leading-tight">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setSelectedMatchId(null)}
                disabled={submitting}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 tap-target"
              >
                Cancel
              </button>
              <button
                onClick={() => handleScoreSubmit(match.id)}
                disabled={submitting}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded"
              >
                {submitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const championTeam = championId ? teams[championId] : null;

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Winner Banner */}
      {championTeam && (
        <div className="glass-panel rounded-2xl sm:rounded-3xl p-6 sm:p-8 border border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-slate-900/90 to-emerald-900/10 text-center glow-emerald-strong animate-pulse-glow max-w-2xl mx-auto">
          <div className="inline-flex p-3 sm:p-4 bg-emerald-500/15 rounded-full border border-emerald-500/30 text-emerald-400 mb-4">
            <Award className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight uppercase">Tournament Champion</h2>
          <div className="mt-4 flex items-center justify-center gap-3 sm:gap-4">
            {championTeam.flagCode ? (
              <img
                src={`https://flagcdn.com/w40/${championTeam.flagCode.toLowerCase()}.png`}
                className="w-7 h-5 sm:w-8 sm:h-5.5 object-cover rounded shadow-md flex-shrink-0 border border-slate-900/40"
                alt={`${championTeam.name} flag`}
              />
            ) : (
              <span
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full shadow-lg border border-slate-900"
                style={{ backgroundColor: championTeam.color }}
              />
            )}
            <span className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-wider drop-shadow-md">
              {championTeam.name}
            </span>
            {championTeam.flagCode ? (
              <img
                src={`https://flagcdn.com/w40/${championTeam.flagCode.toLowerCase()}.png`}
                className="w-7 h-5 sm:w-8 sm:h-5.5 object-cover rounded shadow-md flex-shrink-0 border border-slate-900/40"
                alt={`${championTeam.name} flag`}
              />
            ) : (
              <span
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full shadow-lg border border-slate-900"
                style={{ backgroundColor: championTeam.color }}
              />
            )}
          </div>
          <p className="text-slate-400 text-xs mt-3">All matches completed. The trophy goes home!</p>

          {currentUser?.role === 'admin' && (
            <button
              onClick={onReset}
              className="mt-5 sm:mt-6 text-xs text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-4 py-2.5 rounded-xl transition-all"
            >
              Reset Tournament / Set Up New League
            </button>
          )}
        </div>
      )}

      {/* Bracket - stacked on mobile, side by side on md+ */}
      <div className="max-w-4xl mx-auto">
        {/* Mobile: vertical stack with arrow indicators */}
        <div className="md:hidden space-y-4">
          <div className="space-y-4">
            {renderMatchCard(sf1, 'Semi-Final 1', '1st Place', '4th Place')}
            {renderMatchCard(sf2, 'Semi-Final 2', '2nd Place', '3rd Place')}
          </div>

          {/* Down arrow divider */}
          <div className="flex flex-col items-center py-2 text-slate-700">
            <ArrowDown className="w-5 h-5 animate-pulse" />
            <span className="text-[10px] text-slate-600 uppercase font-bold tracking-wider mt-1">Grand Final</span>
            <ArrowDown className="w-5 h-5 animate-pulse mt-1" />
          </div>

          <div>
            {renderMatchCard(finalMatch, 'Grand Final', 'Winner SF1', 'Winner SF2')}
          </div>

          {/* Trophy Icon */}
          <div className="flex justify-center pt-2">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-400">
              <Trophy className="w-7 h-7" />
            </div>
          </div>
        </div>

        {/* Desktop: horizontal bracket */}
        <div className="hidden md:flex items-center justify-center gap-4 relative">
          {/* Semi-Finals Column */}
          <div className="w-[280px] space-y-8 z-10">
            {renderMatchCard(sf1, 'Semi-Final 1', '1st Place', '4th Place')}
            {renderMatchCard(sf2, 'Semi-Final 2', '2nd Place', '3rd Place')}
          </div>

          {/* Arrow connectors */}
          <div className="flex flex-col justify-around min-h-[160px] text-slate-700 px-2">
            <svg className="w-12 h-24" viewBox="0 0 48 96" fill="none">
              <path d="M0 24 H24 V72 H0" stroke="#334155" strokeWidth="1.5" fill="none" />
              <path d="M24 48 H48" stroke="#334155" strokeWidth="1.5" />
              <polygon points="44,44 48,48 44,52" fill="#334155" />
            </svg>
          </div>

          {/* Finals Column */}
          <div className="w-[280px] z-10">
            {renderMatchCard(finalMatch, 'Grand Final', 'Winner SF1', 'Winner SF2')}
          </div>

          {/* Champion trophy icon */}
          <div className="flex flex-col justify-center items-center text-slate-700 ml-4">
            <svg width="24" height="24" className="mb-2" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L13 6M19 12L13 18" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl text-emerald-400">
              <Trophy className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
