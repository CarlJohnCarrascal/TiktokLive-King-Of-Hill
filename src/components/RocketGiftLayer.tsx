import React, { useEffect } from 'react';
import { soundManager } from '../utils/audio';

export interface RocketGiftItem {
  id: string;
  giftName: string;
  giftPictureUrl?: string;
  diamondCount: number;
  nickname: string;
  avatarUrl: string;
  coins: number;
  isHeal: boolean;
  startX: number; // pixel X
  startY: number; // pixel Y
  targetX: number; // pixel target X (defender avatar center)
  targetY: number; // pixel target Y (defender avatar center)
  deltaX: number;  // pixel delta X
  deltaY: number;  // pixel delta Y
  pointingAngle: number; // angle in degrees pointing straight at defender avatar
}

interface RocketGiftLayerProps {
  rockets: RocketGiftItem[];
}

/**
 * Maps common TikTok LIVE gifts to high-fidelity SVG/Emoji visual representations
 */
function getGiftVisual(giftName: string, coins: number): { emoji: string; color: string; label: string } {
  const lower = (giftName || '').toLowerCase();

  if (lower.includes('rose') || lower.includes('rosa')) {
    return { emoji: '🌹', color: 'text-rose-400', label: 'Rose' };
  }
  if (lower.includes('heart me') || lower.includes('finger heart')) {
    return { emoji: '🫰', color: 'text-pink-400', label: 'Heart' };
  }
  if (lower.includes('heart') || lower.includes('love')) {
    return { emoji: '💖', color: 'text-red-400', label: 'Hearts' };
  }
  if (lower.includes('perfume')) {
    return { emoji: '🧴', color: 'text-purple-300', label: 'Perfume' };
  }
  if (lower.includes('doughnut') || lower.includes('donut')) {
    return { emoji: '🍩', color: 'text-amber-400', label: 'Doughnut' };
  }
  if (lower.includes('cap') || lower.includes('hat')) {
    return { emoji: '🧢', color: 'text-blue-400', label: 'Cap' };
  }
  if (lower.includes('corgi') || lower.includes('dog') || lower.includes('cat')) {
    return { emoji: '🐶', color: 'text-amber-300', label: 'Pet' };
  }
  if (lower.includes('money gun')) {
    return { emoji: '💸', color: 'text-emerald-400', label: 'Money Gun' };
  }
  if (lower.includes('galaxy') || lower.includes('space') || lower.includes('planet')) {
    return { emoji: '🌌', color: 'text-indigo-400', label: 'Galaxy' };
  }
  if (lower.includes('ship') || lower.includes('cruiser') || lower.includes('yacht')) {
    return { emoji: '🚢', color: 'text-cyan-400', label: 'Ship' };
  }
  if (lower.includes('dragon') || lower.includes('phoenix') || lower.includes('lion')) {
    return { emoji: '🦁', color: 'text-yellow-400', label: 'Lion Titan' };
  }
  if (lower.includes('universe')) {
    return { emoji: '🪐', color: 'text-purple-400', label: 'Universe' };
  }
  if (lower.includes('firework')) {
    return { emoji: '🎆', color: 'text-orange-400', label: 'Fireworks' };
  }
  if (lower.includes('crown') || lower.includes('tiara')) {
    return { emoji: '👑', color: 'text-yellow-300', label: 'Crown' };
  }
  if (coins >= 500) {
    return { emoji: '💎', color: 'text-cyan-300', label: 'Mega Diamond' };
  }
  if (coins >= 100) {
    return { emoji: '🔥', color: 'text-orange-400', label: 'Fire Power' };
  }

  return { emoji: '🎁', color: 'text-amber-300', label: giftName };
}

/**
 * Individual Rocket Projectile:
 * Fires a 'woosh' sound on launch from the bottom,
 * flies dynamically to the defender profile avatar,
 * and triggers a secondary 'thud' sound upon impact!
 */
const RocketProjectileItem: React.FC<{ rocket: RocketGiftItem }> = ({ rocket }) => {
  const isHeal = rocket.isHeal;
  const giftVisual = getGiftVisual(rocket.giftName, rocket.coins);

  useEffect(() => {
    // 1. Trigger 'woosh' sound when the rocket launches from the bottom
    soundManager.playWoosh();

    // 2. Trigger secondary 'thud' sound when the rocket impacts the defender profile (~900ms)
    const impactTimer = setTimeout(() => {
      soundManager.playThud();
    }, 900);

    return () => clearTimeout(impactTimer);
  }, [rocket.id]);

  return (
    <div
      className="absolute animate-gift-rocket pointer-events-none"
      style={{
        left: `${rocket.startX}px`,
        top: `${rocket.startY}px`,
        '--target-x': `${rocket.deltaX}px`,
        '--target-y': `${rocket.deltaY}px`,
        '--pointing-angle': `${rocket.pointingAngle}deg`
      } as React.CSSProperties}
    >
      {/* The Rocket Complex: Carrying Gifter Pilot in Cockpit & Gift Icon on Nose + Thruster + Smoke Trail */}
      <div className="relative flex flex-col items-center select-none">
        
        {/* CENTER: Space Rocket Missile carrying Gifter Avatar in Cockpit & Actual Gift Icon on Nose (Canopy badge removed) */}
        <div className="relative w-16 h-28 flex flex-col items-center">
          <svg
            viewBox="0 0 64 120"
            className="w-full h-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.6)]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id={`rocketBodyGrad_${rocket.id}`} x1="0" y1="0" x2="64" y2="120" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={isHeal ? '#34d399' : '#f59e0b'} />
                <stop offset="35%" stopColor={isHeal ? '#059669' : '#ef4444'} />
                <stop offset="85%" stopColor={isHeal ? '#064e3b' : '#991b1b'} />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id={`finGrad_${rocket.id}`} x1="0" y1="0" x2="0" y2="100%" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#dc2626" />
              </linearGradient>
              <radialGradient id={`cockpitGlass_${rocket.id}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                <stop offset="70%" stopColor="#0284c7" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#082f49" stopOpacity="0.95" />
              </radialGradient>
            </defs>

            {/* Rocket Nose Cone */}
            <path
              d="M32 4 C24 16, 16 32, 16 48 L48 48 C48 32, 40 16, 32 4 Z"
              fill={isHeal ? '#10b981' : '#dc2626'}
              stroke="#ffffff"
              strokeWidth="1.5"
            />

            {/* Nose Cone Highlight Tip */}
            <polygon points="32,4 29,18 35,18" fill="#fbbf24" />

            {/* Left Stabilizer Wing / Fin */}
            <path
              d="M16 68 L2 96 C2 96, 6 98, 16 92 Z"
              fill={`url(#finGrad_${rocket.id})`}
              stroke="#ffffff"
              strokeWidth="1.2"
            />

            {/* Right Stabilizer Wing / Fin */}
            <path
              d="M48 68 L62 96 C62 96, 58 98, 48 92 Z"
              fill={`url(#finGrad_${rocket.id})`}
              stroke="#ffffff"
              strokeWidth="1.2"
            />

            {/* Rocket Main Fuselage */}
            <rect
              x="16"
              y="46"
              width="32"
              height="46"
              rx="4"
              fill={`url(#rocketBodyGrad_${rocket.id})`}
              stroke="#ffffff"
              strokeWidth="1.5"
            />

            {/* Cyber Body Panels / Rivets */}
            <line x1="18" y1="62" x2="46" y2="62" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <line x1="18" y1="78" x2="46" y2="78" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
            <circle cx="20" cy="52" r="1.2" fill="#ffffff" />
            <circle cx="44" cy="52" r="1.2" fill="#ffffff" />
            <circle cx="20" cy="86" r="1.2" fill="#ffffff" />
            <circle cx="44" cy="86" r="1.2" fill="#ffffff" />

            {/* Rocket Cockpit Window (Porthole) */}
            <circle
              cx="32"
              cy="70"
              r="10"
              fill={`url(#cockpitGlass_${rocket.id})`}
              stroke="#ffffff"
              strokeWidth="2"
            />

            {/* Rocket Engine Nozzle / Exhaust Thruster */}
            <path
              d="M24 92 L20 102 L44 102 L40 92 Z"
              fill="#334155"
              stroke="#ffffff"
              strokeWidth="1.2"
            />
          </svg>

          {/* Actual TikTok Gift Icon mounted prominently on the Rocket's Nose Cone */}
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-slate-950/95 border-2 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,1)] flex items-center justify-center overflow-hidden z-20 animate-bounce"
            title={rocket.giftName}
          >
            {rocket.giftPictureUrl ? (
              <img
                src={rocket.giftPictureUrl}
                alt={rocket.giftName}
                className="w-full h-full object-contain p-0.5"
                onError={(e) => {
                  // If image fails, smoothly fallback to high-fidelity emoji icon
                  const parent = (e.target as HTMLElement).parentElement;
                  if (parent) {
                    (e.target as HTMLElement).style.display = 'none';
                    const span = document.createElement('span');
                    span.className = 'text-lg select-none drop-shadow-md';
                    span.textContent = giftVisual.emoji;
                    parent.appendChild(span);
                  }
                }}
              />
            ) : (
              <span className="text-lg drop-shadow-md select-none">{giftVisual.emoji}</span>
            )}
          </div>

          {/* Actual Gifter Pilot Avatar visible inside the Rocket's Cockpit */}
          <div className="absolute top-[58px] left-1/2 -translate-x-1/2 w-5 h-5 rounded-full overflow-hidden border border-cyan-300 z-10 shadow-inner">
            <img
              src={rocket.avatarUrl}
              alt={rocket.nickname}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                  rocket.nickname
                )}`;
              }}
            />
          </div>
        </div>

        {/* BOTTOM: Fiery Thruster Blast Exhaust */}
        <div className="relative -mt-3.5 flex flex-col items-center">
          {/* Core Fire Jet */}
          <div
            className={`w-4 h-12 rounded-full animate-rocket-flame blur-[1px] ${
              isHeal
                ? 'bg-gradient-to-b from-white via-emerald-300 to-teal-500'
                : 'bg-gradient-to-b from-yellow-200 via-orange-500 to-rose-600'
            }`}
          />

          {/* Intense Plasma Flare */}
          <div
            className={`w-6 h-6 -mt-8 rounded-full blur-[3px] animate-pulse ${
              isHeal ? 'bg-emerald-400/80' : 'bg-amber-400/90'
            }`}
          />
        </div>

        {/* SMOKE ANIMATION: Multi-layered expanding smoke puffs drifting behind the rocket */}
        <div className="relative -mt-2 w-16 flex flex-col items-center pointer-events-none">
          {/* Smoke Puff 1 (Upper) */}
          <div
            className="w-6 h-6 rounded-full bg-slate-200/50 blur-[2px] animate-smoke-puff"
            style={{ '--drift-x': '-6px' } as React.CSSProperties}
          />
          
          {/* Smoke Puff 2 (Middle) */}
          <div
            className="w-8 h-8 -mt-2 rounded-full bg-slate-400/40 blur-[3px] animate-smoke-puff"
            style={{ '--drift-x': '8px', animationDelay: '0.15s' } as React.CSSProperties}
          />

          {/* Smoke Puff 3 (Lower, expanding wide) */}
          <div
            className="w-10 h-10 -mt-2 rounded-full bg-slate-500/30 blur-[4px] animate-smoke-puff"
            style={{ '--drift-x': '-10px', animationDelay: '0.3s' } as React.CSSProperties}
          />
        </div>

      </div>
    </div>
  );
};

export const RocketGiftLayer: React.FC<RocketGiftLayerProps> = ({ rockets }) => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-35">
      {rockets.map((rocket) => (
        <RocketProjectileItem key={rocket.id} rocket={rocket} />
      ))}
    </div>
  );
};
