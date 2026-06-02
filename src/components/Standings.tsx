import React from 'react';
import type { StandingRow } from '../services/db';
import { Trophy } from 'lucide-react';

interface StandingsProps {
  standings: StandingRow[];
  teamCountSettings: number;
}

export const Standings: React.FC<StandingsProps> = ({ standings, teamCountSettings: _teamCountSettings }) => {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-6 glow-emerald border border-slate-800/80 overflow-hidden">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="p-2 sm:p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 flex-shrink-0">
          <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-100">Live Standings</h2>
          <p className="text-xs text-slate-400 hidden sm:block">Top 4 positions qualify for the Knockout Stage</p>
        </div>
      </div>

      {/* Mobile card layout */}
      <div className="sm:hidden space-y-2">
        {standings.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">
            No approved teams registered yet.
          </div>
        ) : (
          standings.map((row) => {
            const isTop4 = row.pos <= 4;
            return (
              <div
                key={row.teamId}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                  isTop4
                    ? 'bg-emerald-950/10 border-emerald-500/15'
                    : 'bg-slate-900/20 border-slate-800/60'
                }`}
              >
                {/* Position badge */}
                <span className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  isTop4
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {row.pos}
                </span>

                {/* Team */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {row.flagCode ? (
                    <img
                      src={`https://flagcdn.com/w40/${row.flagCode.toLowerCase()}.png`}
                      className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                      alt={`${row.teamName} flag`}
                    />
                  ) : (
                    <span
                      className="w-3 h-3 rounded-full border border-slate-900 flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                  )}
                  <span className={`font-semibold truncate text-sm ${isTop4 ? 'text-slate-100' : 'text-slate-300'}`}>
                    {row.teamName}
                  </span>
                </div>

                {/* Stats compact */}
                <div className="flex items-center gap-3 flex-shrink-0 text-xs font-mono">
                  <div className="text-center">
                    <div className="text-slate-500 text-[9px] uppercase font-bold">P</div>
                    <div className="text-slate-300">{row.p}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-500 text-[9px] uppercase font-bold">W</div>
                    <div className="text-emerald-400">{row.w}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-500 text-[9px] uppercase font-bold">L</div>
                    <div className="text-rose-400">{row.l}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-500 text-[9px] uppercase font-bold">GD</div>
                    <div className={row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-rose-400' : 'text-slate-400'}>
                      {row.gd > 0 ? `+${row.gd}` : row.gd}
                    </div>
                  </div>
                  <div className="text-center pl-2 border-l border-slate-800">
                    <div className="text-slate-500 text-[9px] uppercase font-bold">Pts</div>
                    <div className={`text-base font-extrabold ${isTop4 ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {row.pts}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <th className="py-3 px-4 text-center w-12">Pos</th>
              <th className="py-3 px-4">Team</th>
              <th className="py-3 px-3 text-center">P</th>
              <th className="py-3 px-3 text-center">W</th>
              <th className="py-3 px-3 text-center">D</th>
              <th className="py-3 px-3 text-center">L</th>
              <th className="py-3 px-3 text-center hidden md:table-cell">GF</th>
              <th className="py-3 px-3 text-center hidden md:table-cell">GA</th>
              <th className="py-3 px-3 text-center">GD</th>
              <th className="py-3 px-4 text-center">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {standings.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-slate-500">
                  No approved teams registered yet.
                </td>
              </tr>
            ) : (
              standings.map((row) => {
                const isTop4 = row.pos <= 4;
                return (
                  <tr
                    key={row.teamId}
                    className={`transition-colors hover:bg-slate-800/20 ${
                      isTop4
                        ? 'bg-emerald-950/10 text-slate-100'
                        : 'text-slate-300'
                    }`}
                  >
                    <td className="py-3.5 px-4 text-center font-bold">
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                        isTop4
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {row.pos}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold">
                      <div className="flex items-center gap-3">
                        {row.flagCode ? (
                          <img
                            src={`https://flagcdn.com/w40/${row.flagCode.toLowerCase()}.png`}
                            className="w-5 h-3.5 object-cover rounded-sm shadow-sm flex-shrink-0 border border-slate-900/30"
                            alt={`${row.teamName} flag`}
                          />
                        ) : (
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-slate-955 shadow-inner flex-shrink-0"
                            style={{ backgroundColor: row.color }}
                          />
                        )}
                        <span className="truncate max-w-[140px] md:max-w-[200px]">{row.teamName}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-center font-medium">{row.p}</td>
                    <td className="py-3.5 px-3 text-center text-emerald-400/90">{row.w}</td>
                    <td className="py-3.5 px-3 text-center text-slate-400">{row.d}</td>
                    <td className="py-3.5 px-3 text-center text-rose-400/95">{row.l}</td>
                    <td className="py-3.5 px-3 text-center text-slate-400 hidden md:table-cell">{row.gf}</td>
                    <td className="py-3.5 px-3 text-center text-slate-400 hidden md:table-cell">{row.ga}</td>
                    <td className={`py-3.5 px-3 text-center font-bold ${
                      row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}>
                      {row.gd > 0 ? `+${row.gd}` : row.gd}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`text-base font-extrabold ${isTop4 ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {row.pts}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
