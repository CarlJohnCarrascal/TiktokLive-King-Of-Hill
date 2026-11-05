import React, { useState } from 'react';
import { AttackerRecord, LeaderboardStats } from '../game/rules';
import { Swords, Trophy, Clock, Skull, Heart } from 'lucide-react';

interface SidePanelProps {
  lastAttackers: AttackerRecord[];
  leaderboards: {
    mostKnockouts: LeaderboardStats[];
    longestReigns: LeaderboardStats[];
  };
  orientation?: 'landscape' | 'portrait';
}

export const SidePanel: React.FC<SidePanelProps> = ({
  lastAttackers,
  leaderboards,
  orientation = 'landscape'
}) => {
  const [activeTab, setActiveTab] = useState<'activity' | 'leaderboard'>('activity');

  const formatReignTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const renderRecentGifts = () => (
    <div>
      <div className="flex items-center justify-between text-[11px] font-condensed tracking-wider text-slate-400 uppercase mb-2 px-1">
        <span className="flex items-center gap-1.5 font-fighting text-amber-300">
          <Swords className="w-3.5 h-3.5" />
          <span>Last 5 Gifts</span>
        </span>
        <span>Impact</span>
      </div>

      {lastAttackers.length === 0 ? (
        <div className="py-6 text-center text-xs text-slate-400 italic">
          No attacks yet. Awaiting challengers!
        </div>
      ) : (
        <div className="space-y-1.5">
          {lastAttackers.slice(0, 5).map((atk) => (
            <div
              key={atk.id}
              className={`flex items-center justify-between gap-2.5 p-2 rounded-xl border text-xs transition-all ${
                atk.isKo
                  ? 'bg-red-950/40 border-red-500/50 text-red-200'
                  : atk.isHeal
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-900/70 border-slate-800 text-slate-200'
              }`}
            >
              {/* User Avatar & Gift Details */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-700 bg-slate-800">
                  <img
                    src={atk.profilePictureUrl}
                    alt={atk.nickname}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(atk.nickname)}`;
                    }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate max-w-[130px] text-xs">
                    {atk.nickname}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {atk.repeatCount > 1 ? `${atk.repeatCount}x ` : ''}{atk.giftName} ({atk.coins.toLocaleString()} coins)
                  </p>
                </div>
              </div>

              {/* Combat Outcome Tag */}
              <div className="text-right shrink-0">
                {atk.isKo ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white font-fighting text-[10px] tracking-wider uppercase shadow-sm">
                    <Skull className="w-3 h-3" />
                    <span>KO TAKE</span>
                  </span>
                ) : atk.isHeal ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/30 border border-emerald-500 text-emerald-300 font-fighting text-[10px]">
                    <Heart className="w-3 h-3 fill-emerald-300" />
                    <span>+{atk.hpEffect} HP</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 font-fighting text-[10px]">
                    <span>-{Math.abs(atk.hpEffect)} HP</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderLeaderboards = () => (
    <div className="space-y-3">
      {/* Top Knockouts */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-fighting text-amber-300 uppercase mb-2">
          <Skull className="w-3.5 h-3.5 text-red-400" />
          <span>Most Knockouts</span>
        </div>
        {leaderboards.mostKnockouts.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No KOs recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {leaderboards.mostKnockouts.slice(0, 3).map((item, idx) => (
              <div
                key={item.userId}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-900/60 border border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-fighting text-xs text-amber-400 w-4 text-center">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-white truncate max-w-[120px]">
                    {item.nickname}
                  </span>
                </div>
                <span className="font-fighting text-red-400 text-xs">
                  {item.knockouts} KOs
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Longest Reign */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-fighting text-amber-300 uppercase mb-2">
          <Clock className="w-3.5 h-3.5 text-yellow-400" />
          <span>Longest Reign</span>
        </div>
        {leaderboards.longestReigns.length === 0 ? (
          <p className="text-[11px] text-slate-400 italic">No reigns recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {leaderboards.longestReigns.slice(0, 3).map((item, idx) => (
              <div
                key={item.userId}
                className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-slate-900/60 border border-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span className="font-fighting text-xs text-amber-400 w-4 text-center">
                    #{idx + 1}
                  </span>
                  <span className="font-medium text-white truncate max-w-[120px]">
                    {item.nickname}
                  </span>
                </div>
                <span className="font-fighting text-emerald-400 text-xs">
                  {formatReignTime(item.longestReignSeconds)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950/85 backdrop-blur-md shadow-xl text-white transition-all w-full max-w-3xl mx-auto`}
    >
      {/* In Landscape: Dual columns side-by-side underneath the defender card */}
      {orientation === 'landscape' ? (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-b md:border-b-0 md:border-r border-slate-800 pb-3 md:pb-0 md:pr-4">
            {renderRecentGifts()}
          </div>
          <div className="md:pl-1">
            <div className="flex items-center justify-between text-[11px] font-condensed tracking-wider text-slate-400 uppercase mb-2 px-1">
              <span className="flex items-center gap-1.5 font-fighting text-amber-300">
                <Trophy className="w-3.5 h-3.5 text-yellow-400" />
                <span>Hall of Fame</span>
              </span>
              <span>Records</span>
            </div>
            {renderLeaderboards()}
          </div>
        </div>
      ) : (
        /* In Portrait: Tabbed switch underneath defender card */
        <div>
          <div className="flex border-b border-slate-800 bg-slate-900/60 p-1">
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-fighting uppercase tracking-wider transition-all ${
                activeTab === 'activity'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Last 5 Gifts</span>
            </button>

            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-fighting uppercase tracking-wider transition-all ${
                activeTab === 'leaderboard'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Hall of Fame</span>
            </button>
          </div>

          <div className="p-3">
            {activeTab === 'activity' ? renderRecentGifts() : renderLeaderboards()}
          </div>
        </div>
      )}
    </div>
  );
};
