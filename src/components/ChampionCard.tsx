import React, { useEffect, useState, useRef } from 'react';
import { King } from '../game/rules';
import { Crown, Shield, Heart, Zap, Sparkles } from 'lucide-react';

interface ChampionCardProps {
  king: King | null;
  winStreak?: number;
  isHit: boolean;
  isHealed: boolean;
  theme?: string;
  orientation?: 'landscape' | 'portrait';
  likesPool?: number;
  defenderLikesPool?: number;
  totalLikes?: number;
  likesPerHp?: number;
}

export const ChampionCard: React.FC<ChampionCardProps> = ({
  king,
  winStreak,
  isHit,
  isHealed,
  theme = 'cyber-arena',
  orientation = 'landscape',
  likesPool = 0,
  defenderLikesPool = 0,
  totalLikes = 0,
  likesPerHp = 100
}) => {
  // Live Reign Timer in seconds
  const [reignSeconds, setReignSeconds] = useState(0);
  // Ghost HP bar for arcade fighting game damage-trail effect
  const [ghostHpPercent, setGhostHpPercent] = useState(100);

  useEffect(() => {
    if (!king) {
      setReignSeconds(0);
      setGhostHpPercent(100);
      return;
    }

    // Initialize timer
    const updateTimer = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - king.reignStartedAt) / 1000));
      setReignSeconds(elapsed);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [king?.reignStartedAt, king?.userId]);

  // Current HP percentage
  const maxHp = king ? Math.max(king.maxHp, king.currentHp, 1) : 1;
  const currentHp = king ? Math.max(0, king.currentHp) : 0;
  const hpPercent = Math.min(100, Math.max(0, (currentHp / maxHp) * 100));

  // Delay the ghost bar to create an authentic Street Fighter / Tekken delayed red trail
  useEffect(() => {
    const timer = setTimeout(() => {
      setGhostHpPercent(hpPercent);
    }, 450);
    return () => clearTimeout(timer);
  }, [hpPercent]);

  // Format time MM:SS or HH:MM:SS
  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // HP Color Gradient calculation
  const getHpGradient = () => {
    if (hpPercent > 55) {
      return 'from-emerald-400 via-green-500 to-teal-400';
    }
    if (hpPercent > 25) {
      return 'from-amber-300 via-yellow-500 to-orange-500';
    }
    return 'from-red-500 via-rose-600 to-red-700 animate-pulse';
  };

  const getHpGlow = () => {
    if (hpPercent > 55) return 'shadow-[0_0_20px_rgba(16,185,129,0.5)]';
    if (hpPercent > 25) return 'shadow-[0_0_20px_rgba(245,158,11,0.5)]';
    return 'shadow-[0_0_25px_rgba(239,68,68,0.8)]';
  };

  // Crown styling based on tier
  const getCrownBadge = () => {
    if (!king) return null;
    const tier = king.crownTier;
    if (tier === 'diamond') {
      return {
        label: 'DIAMOND KING',
        color: 'text-cyan-300 bg-cyan-950/80 border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.6)]',
        icon: <Sparkles className="w-4 h-4 text-cyan-300 animate-spin" />
      };
    }
    if (tier === 'gold') {
      return {
        label: 'GOLDEN TITAN',
        color: 'text-amber-300 bg-amber-950/80 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.6)]',
        icon: <Crown className="w-4 h-4 text-amber-300" />
      };
    }
    if (tier === 'silver') {
      return {
        label: 'SILVER WARRIOR',
        color: 'text-slate-200 bg-slate-900/80 border-slate-300 shadow-[0_0_10px_rgba(203,213,225,0.4)]',
        icon: <Shield className="w-4 h-4 text-slate-200" />
      };
    }
    return {
      label: 'DEFENDER',
      color: 'text-orange-300 bg-orange-950/80 border-orange-500/60',
      icon: <Crown className="w-4 h-4 text-orange-400" />
    };
  };

  const crown = getCrownBadge();

  // Empty Stage View
  if (!king) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border-2 border-dashed border-amber-400/40 bg-slate-950/85 backdrop-blur-md p-4 md:p-5 text-center text-white shadow-2xl transition-all duration-300 ${
        orientation === 'portrait' ? 'w-full max-w-md mx-auto' : 'w-full max-w-2xl mx-auto'
      }`}>
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 animate-pulse pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center justify-center py-3 space-y-2">
          <div className="w-14 h-14 rounded-full bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.3)] animate-bounce">
            <Crown className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl md:text-2xl font-fighting tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400 uppercase drop-shadow-md">
            The Throne is Empty!
          </h2>
          <p className="text-xs md:text-sm text-slate-300 font-medium max-w-sm">
            Send <span className="text-amber-400 font-bold">ANY GIFT</span> to claim the crown & become the first King of the Hill!
          </p>
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-xs text-amber-300/90 font-semibold tracking-wider uppercase">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            1 Coin = 1 HP
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl transition-all duration-200 select-none ${
        isHit ? 'animate-card-shake animate-defender-impact' : ''
      } ${
        isHealed ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-black/50 shadow-[0_0_40px_rgba(52,211,153,0.85)] scale-[1.02]' : ''
      } ${
        orientation === 'portrait' ? 'w-full max-w-md mx-auto' : 'w-full max-w-3xl mx-auto'
      }`}
    >
      {/* Outer Glow Container */}
      <div className={`relative overflow-hidden rounded-2xl border-2 ${
        hpPercent < 25 ? 'border-red-500/80 animate-glow-pulse' : 'border-amber-400/60'
      } bg-slate-950/90 backdrop-blur-md shadow-2xl p-3.5 md:p-4 text-white`}>
        
        {/* Subtle arena background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-slate-950/60 to-black/90 pointer-events-none" />

        {/* Animated combat sparks/glow flash when impacted by rocketing gifts */}
        {isHit && (
          <div className="absolute inset-0 bg-red-500/20 backdrop-blur-[1px] pointer-events-none animate-pulse z-30" />
        )}
        {isHealed && (
          <div className="absolute inset-0 bg-emerald-500/20 backdrop-blur-[1px] pointer-events-none animate-pulse z-30" />
        )}

        {/* Top Header: Crown Badge & Reign Timer */}
        <div className="relative z-10 flex items-center justify-between gap-2 mb-2.5">
          {/* Crown Title */}
          {crown && (
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-fighting uppercase tracking-wider ${crown.color}`}>
              {crown.icon}
              <span>{crown.label}</span>
            </div>
          )}

          {/* Reign Timer Badge */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900/90 border border-amber-500/40 text-amber-300 text-xs font-fighting shadow-inner">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>REIGN: {formatTime(reignSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Middle Section: Avatar, Nickname & HP Overview */}
        <div className="relative z-10 flex items-center gap-3.5 mb-3">
          {/* Champion Avatar with Floating Crown & Rocket Bomb Explosion */}
          <div className="relative shrink-0">
            {/* Crown above avatar */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] animate-bounce">
              <Crown className="w-6 h-6 text-yellow-400 fill-amber-400" />
            </div>

            <div
              id="defender-avatar-target"
              className={`relative w-14 h-14 md:w-16 md:h-16 rounded-2xl overflow-hidden p-0.5 border-2 ${
                hpPercent < 25 ? 'border-red-500 animate-pulse' : 'border-amber-400'
              } bg-gradient-to-b from-amber-400 to-amber-700 shadow-[0_0_20px_rgba(245,158,11,0.4)]`}
            >
              <img
                src={king.profilePictureUrl}
                alt={king.nickname}
                className="w-full h-full object-cover rounded-[14px]"
                onError={(e) => {
                  // Fallback avatar if external image fails to load
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(king.nickname)}`;
                }}
              />
            </div>

            {/* Live Indicator Dot */}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-950 border-2 border-slate-900 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
            </div>

            {/* BOMB EXPLOSION OVER DEFENDER PROFILE AVATAR WHEN HIT */}
            {isHit && (
              <div className="absolute -inset-4 pointer-events-none z-40 flex items-center justify-center overflow-visible">
                {/* Shockwave expanding ring */}
                <div className="absolute w-24 h-24 rounded-full border-4 border-amber-400/90 animate-bomb-ring" />
                
                {/* Secondary fiery ring */}
                <div className="absolute w-28 h-28 rounded-full border-2 border-rose-500/80 animate-bomb-ring" style={{ animationDelay: '0.08s' }} />

                {/* Central Fiery Blast Core */}
                <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-yellow-300 via-orange-500 to-red-600 blur-[3px] animate-fireball-blast" />

                {/* Cartoon Bomb Impact / Comic Burst Graphic */}
                <div className="relative text-3xl md:text-4xl animate-bomb-burst select-none drop-shadow-[0_0_25px_rgba(239,68,68,1)]">
                  💥
                </div>

                {/* Flying Fire Sparks / Shrapnel */}
                <div className="absolute w-2.5 h-2.5 rounded-full bg-yellow-300 animate-spark-shrapnel" style={{ '--spark-x': '38px', '--spark-y': '-35px' } as React.CSSProperties} />
                <div className="absolute w-2 h-2 rounded-full bg-orange-400 animate-spark-shrapnel" style={{ '--spark-x': '-40px', '--spark-y': '-28px' } as React.CSSProperties} />
                <div className="absolute w-3 h-3 rounded-full bg-red-500 animate-spark-shrapnel" style={{ '--spark-x': '32px', '--spark-y': '34px' } as React.CSSProperties} />
                <div className="absolute w-2 h-2 rounded-full bg-amber-300 animate-spark-shrapnel" style={{ '--spark-x': '-36px', '--spark-y': '32px' } as React.CSSProperties} />
                <div className="absolute w-2.5 h-2.5 rounded-full bg-yellow-200 animate-spark-shrapnel" style={{ '--spark-x': '0px', '--spark-y': '-46px' } as React.CSSProperties} />
              </div>
            )}

            {/* HEAL BURST OVER DEFENDER AVATAR WHEN DEFENDER SENDS GIFT */}
            {isHealed && (
              <div className="absolute -inset-4 pointer-events-none z-40 flex items-center justify-center overflow-visible">
                <div className="absolute w-24 h-24 rounded-full border-4 border-emerald-400/90 animate-bomb-ring" />
                <div className="absolute w-20 h-20 rounded-full bg-gradient-to-r from-emerald-300 via-teal-400 to-cyan-500 blur-[4px] animate-fireball-blast" />
                <div className="relative text-3xl md:text-4xl animate-bomb-burst select-none drop-shadow-[0_0_25px_rgba(52,211,153,1)]">
                  💚
                </div>
              </div>
            )}
          </div>

          {/* Nickname, Win Streak & Sub-info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-fighting tracking-wide text-white truncate drop-shadow-md">
                {king.nickname}
              </h1>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/25 to-orange-500/25 border border-amber-400/60 text-amber-300 text-xs font-fighting tracking-wider uppercase shadow-[0_0_12px_rgba(245,158,11,0.3)] shrink-0"
                title="Current Win Streak (Consecutive Knockouts)"
              >
                <span>🔥 {winStreak ?? king.winStreak ?? king.knockouts ?? 0} WIN STREAK</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-slate-300 font-medium">
              <span className="text-amber-400 font-semibold">Current Defender</span>
              <span>•</span>
              <span className="text-slate-400">Damage Taken: <strong className="text-rose-400">-{king.totalDamageTaken.toLocaleString()}</strong></span>
              <span>•</span>
              <span className="text-slate-400">Self Healed: <strong className="text-emerald-400">+{king.totalHealed.toLocaleString()} HP</strong></span>
            </div>

            {/* HP Numbers */}
            <div className="flex items-baseline justify-between mt-2 font-fighting">
              <div className="flex items-center gap-1.5 text-sm md:text-base">
                <Heart className={`w-4 h-4 ${hpPercent < 25 ? 'text-red-500 fill-red-500 animate-ping' : 'text-rose-500 fill-rose-500'}`} />
                <span className="tracking-wide">HEALTH</span>
              </div>
              <div className="text-right">
                <span className={`text-lg md:text-2xl font-bold tracking-tight drop-shadow-md ${
                  hpPercent < 25 ? 'text-red-400' : hpPercent < 55 ? 'text-amber-300' : 'text-emerald-300'
                }`}>
                  {king.currentHp.toLocaleString()}
                </span>
                <span className="text-xs md:text-sm text-slate-400 font-normal"> / {maxHp.toLocaleString()} HP</span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Bar with Ghost Damage Trail & Flash */}
        <div className="relative z-10">
          <div className={`relative h-6 md:h-7 w-full overflow-hidden rounded-xl bg-slate-900 border-2 border-slate-700 shadow-inner ${
            isHit ? 'animate-bar-flash' : ''
          } ${getHpGlow()}`}>
            
            {/* Ghost Health Trail (catch-up red/amber bar) */}
            <div
              className="absolute inset-y-0 left-0 bg-red-500/80 transition-all duration-700 ease-out"
              style={{ width: `${ghostHpPercent}%` }}
            />

            {/* Main Health Bar */}
            <div
              className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getHpGradient()} transition-all duration-200 ease-out`}
              style={{ width: `${hpPercent}%` }}
            >
              {/* Gloss shine highlight */}
              <div className="absolute inset-x-0 top-0 h-1/2 bg-white/25" />
              {/* Diagonal hazard stripes when critical HP */}
              {hpPercent < 25 && (
                <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,_transparent_25%,_rgba(255,255,255,0.4)_50%,_transparent_75%)] bg-[length:20px_20px]" />
              )}
            </div>

            {/* Percentage Badge centered in bar */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-xs md:text-sm font-fighting font-bold tracking-wider text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                {Math.round(hpPercent)}%
              </span>
            </div>
          </div>

          {/* Quick HP & Like Rule Status Helper */}
          <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-condensed tracking-wider mt-1.5 px-0.5 uppercase gap-1">
            <span className="text-rose-300 font-semibold">
              💔 {likesPerHp} Likes (Challengers) = -1 HP ({likesPool}/{likesPerHp})
            </span>
            <span>⚔️ Challenger Gifts = -HP</span>
            <span className="flex items-center gap-1 text-emerald-300 font-semibold">
              <Heart className="w-3 h-3 fill-emerald-400 text-emerald-400" />
              <span>Defender Gift / {likesPerHp} Likes = +HP ({defenderLikesPool}/{likesPerHp})</span>
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
