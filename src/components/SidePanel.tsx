import React, { useState, useEffect } from 'react';
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

const RECENT_ATTACKS_DURATION_MS = 60000; // 1 minute for Last Gift & Recent Attacks
const HALL_OF_FAME_DURATION_MS = 5000;    // 5 seconds for Hall of Fame

export const SidePanel: React.FC<SidePanelProps> = ({
  lastAttackers,
  leaderboards,
  orientation = 'landscape'
}) => {
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
  const [maxDisplayItems, setMaxDisplayItems] = useState(5);

  // Dynamically calculate how many gifters/hall of fame entries to render based on device/window height
  useEffect(() => {
    const calculateCapacity = () => {
      const windowHeight = window.innerHeight;
      // On standard 1080p, OBS landscape, or tall phone portrait:
      // < 600px: 4-5 items
      // 600-800px: 6-7 items
      // 800-1000px: 8-10 items
      // > 1000px (e.g. 1080x1920 mobile OBS portrait or 2K displays): 12-15 items
      if (windowHeight > 1300) {
        setMaxDisplayItems(16);
      } else if (windowHeight > 1000) {
        setMaxDisplayItems(12);
      } else if (windowHeight > 850) {
        setMaxDisplayItems(9);
      } else if (windowHeight > 700) {
        setMaxDisplayItems(7);
      } else if (windowHeight > 550) {
        setMaxDisplayItems(5);
      } else {
        setMaxDisplayItems(4);
      }
    };

    calculateCapacity();
    window.addEventListener('resize', calculateCapacity);
    return () => window.removeEventListener('resize', calculateCapacity);
  }, []);

  // Automatically switch carousel slides:
  // - Slide 0 ("Last Gift & Recent Attacks") stays for 1 minute (60,000ms)
  // - Slide 1 ("Hall of Fame") stays for 5 seconds (5,000ms)
  useEffect(() => {
    const duration = activeSlide === 0 ? RECENT_ATTACKS_DURATION_MS : HALL_OF_FAME_DURATION_MS;
    const timer = setTimeout(() => {
      setActiveSlide((prev) => (prev === 0 ? 1 : 0));
    }, duration);

    return () => clearTimeout(timer);
  }, [activeSlide]);

  const formatReignTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  // Ensure no duplicate gift records are ever rendered
  const uniqueAttackers = lastAttackers.filter((atk, index, self) => {
    return (
      index ===
      self.findIndex(
        (t) =>
          t.id === atk.id ||
          (t.eventId && atk.eventId && t.eventId === atk.eventId) ||
          (t.streakKey &&
            atk.streakKey &&
            t.streakKey === atk.streakKey &&
            Math.abs(t.timestamp - atk.timestamp) < 15000) ||
          (t.userId === atk.userId &&
            t.giftName === atk.giftName &&
            t.coins === atk.coins &&
            Math.abs(t.timestamp - atk.timestamp) < 2500)
      )
    );
  });

  const renderRecentGiftsSlide = () => (
    <div className="animate-fade-in">
      {uniqueAttackers.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-400 italic">
          No gifts yet. Awaiting challengers!
        </div>
      ) : (
        <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-340px)] pr-0.5">
          {uniqueAttackers.slice(0, maxDisplayItems).map((atk, idx) => (
            <div
              key={atk.id}
              className={`flex items-center justify-between gap-2.5 px-2.5 py-1 rounded-xl border text-xs transition-all ${
                atk.isKo
                  ? 'bg-red-950/40 border-red-500/50 text-red-200'
                  : atk.isHeal
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : idx === 0
                  ? 'bg-amber-950/30 border-amber-500/50 text-white'
                  : 'bg-slate-900/70 border-slate-800 text-slate-200'
              }`}
            >
              {/* User Avatar & Gift Details */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-6 h-6 rounded-lg overflow-hidden shrink-0 border border-slate-700 bg-slate-800">
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
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-white truncate max-w-[140px] text-xs leading-tight">
                      {atk.nickname}
                    </p>
                    {idx === 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] font-fighting text-amber-300 uppercase">
                        LAST GIFT
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate leading-tight">
                    {atk.repeatCount > 1 ? `${atk.repeatCount}x ` : ''}
                    {atk.giftName} ({atk.coins.toLocaleString()} {atk.coins === 1 ? 'coin' : 'coins'})
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

  const renderHallOfFameSlide = () => (
    <div className="animate-fade-in">
      {leaderboards.longestReigns.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-400 italic">
          No reigns recorded yet. Defend the throne to enter the Hall of Fame!
        </div>
      ) : (
        <div className="space-y-1 overflow-y-auto max-h-[calc(100vh-340px)] pr-0.5">
          {leaderboards.longestReigns.slice(0, maxDisplayItems).map((item, idx) => (
            <div
              key={item.userId}
              className={`flex items-center justify-between text-xs px-2.5 py-1 rounded-xl border ${
                idx === 0
                  ? 'bg-amber-950/30 border-amber-500/50 text-white'
                  : 'bg-slate-900/70 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`font-fighting text-xs w-5 text-center ${
                    idx === 0
                      ? 'text-yellow-400'
                      : idx === 1
                      ? 'text-slate-300'
                      : idx === 2
                      ? 'text-amber-600'
                      : 'text-slate-500'
                  }`}
                >
                  #{idx + 1}
                </span>
                <div className="relative w-6 h-6 rounded-lg overflow-hidden shrink-0 border border-slate-700 bg-slate-800">
                  <img
                    src={item.profilePictureUrl}
                    alt={item.nickname}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(item.nickname)}`;
                    }}
                  />
                </div>
                <span className="font-semibold text-white truncate max-w-[160px]">
                  {item.nickname}
                </span>
              </div>
              <span className="font-fighting text-emerald-400 text-xs shrink-0">
                {formatReignTime(item.longestReignSeconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-slate-700/80 bg-slate-950/85 backdrop-blur-md shadow-xl text-white transition-all w-full ${
        orientation === 'portrait' ? 'max-w-md mx-auto' : 'max-w-3xl mx-auto'
      }`}
    >
      {/* Single Active Title Header + Carousel Indicators */}
      <div className="flex items-center justify-between border-b border-slate-800/90 bg-slate-900/70 px-3.5 py-2">
        <button
          onClick={() => setActiveSlide((prev) => (prev === 0 ? 1 : 0))}
          className="flex items-center gap-2 text-xs font-fighting uppercase tracking-wider text-amber-300 hover:text-amber-200 transition-colors"
          title="Click to switch view"
        >
          {activeSlide === 0 ? (
            <>
              <Swords className="w-3.5 h-3.5 text-amber-400" />
              <span>Last Gift & Recent Attacks</span>
            </>
          ) : (
            <>
              <Trophy className="w-3.5 h-3.5 text-yellow-400" />
              <span>Hall of Fame • Longest Reign</span>
            </>
          )}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-[11px] font-condensed tracking-wider text-slate-400 uppercase flex items-center gap-1">
            {activeSlide === 0 ? (
              <span>Impact</span>
            ) : (
              <>
                <Clock className="w-3 h-3 text-yellow-400/90" />
                <span className="text-yellow-400/90">Time on Stage</span>
              </>
            )}
          </span>

          {/* Carousel Dots */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveSlide(0)}
              aria-label="Slide 1: Last Gift"
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeSlide === 0 ? 'w-4 bg-amber-400' : 'w-1.5 bg-slate-600'
              }`}
            />
            <button
              onClick={() => setActiveSlide(1)}
              aria-label="Slide 2: Hall of Fame"
              className={`h-1.5 rounded-full transition-all duration-300 ${
                activeSlide === 1 ? 'w-4 bg-amber-400' : 'w-1.5 bg-slate-600'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Carousel Body */}
      <div className="p-3">
        {activeSlide === 0 ? renderRecentGiftsSlide() : renderHallOfFameSlide()}
      </div>
    </div>
  );
};
