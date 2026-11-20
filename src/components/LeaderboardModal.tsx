import React, { useEffect, useState } from 'react';
import { Flame, RefreshCw, Timer, Trophy, X } from 'lucide-react';
import { CAR_SPECS, TRACK_SPECS, type LeaderboardEntry, type TrackId } from '../game/types';
import { formatLapTime } from '../utils/format';

interface LeaderboardModalProps {
  initialTrack: TrackId | 'all';
  highlightId?: string | null;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  initialTrack,
  highlightId,
  onClose,
}) => {
  const [trackFilter, setTrackFilter] = useState<TrackId | 'all'>(initialTrack);
  const [sortBy, setSortBy] = useState<'lap' | 'drift' | 'race'>('lap');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScores = async (track: TrackId | 'all', sort: 'lap' | 'drift' | 'race') => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/leaderboard?track=${encodeURIComponent(track)}&sort=${encodeURIComponent(sort)}`);
      if (!res.ok) throw new Error('Failed to load leaderboard');
      const data = (await res.json()) as { entries: LeaderboardEntry[] };
      setEntries(data.entries ?? []);
    } catch {
      setError('Unable to reach global leaderboard server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchScores(trackFilter, sortBy);
  }, [trackFilter, sortBy]);

  const getCarName = (carId: string) => CAR_SPECS.find((c) => c.id === carId)?.name ?? carId;
  const getTrackName = (trackId: string) => TRACK_SPECS.find((t) => t.id === trackId)?.name ?? trackId;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-2.5 sm:p-4">
      <div className="w-full max-w-4xl bg-[#0c1018] border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-[#090c12]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-bold tracking-wider uppercase text-white truncate">
                SB RACING 2026 · LEADERBOARD
              </h2>
              <p className="hidden sm:block text-xs text-slate-400 tracking-wide">
                Verified lap times, race finishes, and drift records across all circuits
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 sm:py-3 border-b border-slate-800/80 bg-[#0e131d]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTrackFilter('all')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase cursor-pointer transition-colors ${
                trackFilter === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              ALL
            </button>
            {TRACK_SPECS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTrackFilter(t.id)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase cursor-pointer transition-colors ${
                  trackFilter === t.id
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSortBy('lap')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 cursor-pointer ${
                sortBy === 'lap' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Timer className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              LAP
            </button>
            <button
              type="button"
              onClick={() => setSortBy('race')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 cursor-pointer ${
                sortBy === 'race' ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              RACE
            </button>
            <button
              type="button"
              onClick={() => setSortBy('drift')}
              className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold tracking-wider uppercase flex items-center gap-1 cursor-pointer ${
                sortBy === 'drift' ? 'bg-rose-500 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              DRIFT
            </button>
            <button
              type="button"
              onClick={() => void fetchScores(trackFilter, sortBy)}
              title="Refresh"
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto px-3 py-3 sm:px-6 sm:py-4">
          {error ? (
            <div className="py-12 text-center text-rose-400 font-semibold text-sm">{error}</div>
          ) : loading ? (
            <div className="py-12 text-center text-slate-400 tracking-wider uppercase text-sm">
              LOADING GLOBAL STANDINGS...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-10 sm:py-14 text-center">
              <p className="text-slate-300 font-semibold tracking-wider uppercase text-sm">
                No records posted yet for this circuit
              </p>
              <p className="text-slate-500 text-xs sm:text-sm mt-1">
                Complete a 3-lap race to claim the #1 global track record.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[440px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-slate-400">
                  <th className="py-2 pr-2 sm:pr-3">RANK</th>
                  <th className="py-2 pr-2 sm:pr-3">DRIVER</th>
                  <th className="hidden sm:table-cell py-2 pr-3">VEHICLE</th>
                  {trackFilter === 'all' && <th className="hidden md:table-cell py-2 pr-3">CIRCUIT</th>}
                  <th className="py-2 pr-2 sm:pr-3 text-right">BEST LAP</th>
                  <th className="hidden sm:table-cell py-2 pr-3 text-right">RACE TIME</th>
                  <th className="py-2 pr-2 sm:pr-3 text-right">DRIFT</th>
                  <th className="py-2 text-right">KM/H</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs sm:text-sm">
                {entries.map((entry, idx) => {
                  const isHighlighted = highlightId && entry.id === highlightId;
                  return (
                    <tr
                      key={entry.id}
                      className={
                        isHighlighted
                          ? 'bg-amber-500/15 text-amber-200'
                          : 'hover:bg-slate-800/40 text-slate-200'
                      }
                    >
                      <td className="py-2.5 pr-2 sm:pr-3 font-mono-num font-bold">
                        <span
                          className={
                            idx === 0
                              ? 'text-amber-400'
                              : idx === 1
                                ? 'text-slate-300'
                                : idx === 2
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                          }
                        >
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 sm:pr-3 font-bold tracking-wide max-w-[110px] truncate">
                        {entry.driverName}
                      </td>
                      <td className="hidden sm:table-cell py-2.5 pr-3 text-xs text-slate-400 font-semibold">
                        {getCarName(entry.carId)}
                      </td>
                      {trackFilter === 'all' && (
                        <td className="hidden md:table-cell py-2.5 pr-3 text-xs text-slate-400">
                          {getTrackName(entry.trackId)}
                        </td>
                      )}
                      <td className="py-2.5 pr-2 sm:pr-3 text-right font-mono-num font-semibold text-emerald-400">
                        {formatLapTime(entry.bestLapMs)}
                      </td>
                      <td className="hidden sm:table-cell py-2.5 pr-3 text-right font-mono-num text-slate-300">
                        {formatLapTime(entry.totalRaceMs)}
                      </td>
                      <td className="py-2.5 pr-2 sm:pr-3 text-right font-mono-num font-bold text-rose-400">
                        {entry.driftScore.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono-num text-sky-400">
                        {entry.maxSpeedKmh}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
