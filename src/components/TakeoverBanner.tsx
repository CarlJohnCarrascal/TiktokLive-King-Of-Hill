import React, { useEffect, useState } from 'react';
import { King } from '../game/rules';
import { Crown, Skull, Swords, Zap } from 'lucide-react';

interface TakeoverBannerProps {
  newKing: King | null;
  defeatedKing: King | null;
  leftoverHp: number;
  onFinished?: () => void;
}

export const TakeoverBanner: React.FC<TakeoverBannerProps> = ({
  newKing,
  defeatedKing,
  leftoverHp,
  onFinished
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onFinished?.();
    }, 4000); // Display for 4 seconds

    return () => clearTimeout(timer);
  }, [newKing?.userId, newKing?.reignStartedAt]);

  if (!visible || !newKing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      {/* Darkened backdrop with explosive radial flare */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-pulse" />

      {/* Main Banner Card */}
      <div className="relative z-10 w-full max-w-xl animate-ko-banner overflow-hidden rounded-3xl border-4 border-yellow-400 bg-gradient-to-b from-slate-950 via-slate-900 to-black p-6 text-center text-white shadow-[0_0_80px_rgba(245,158,11,0.8)]">
        
        {/* Animated Background Rays */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-amber-500/20 via-rose-600/10 to-transparent pointer-events-none" />

        {/* Top "KNOCKOUT & TAKEOVER" Ribbon */}
        <div className="relative z-10 inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 border border-yellow-400 text-yellow-300 font-fighting text-sm md:text-base tracking-widest uppercase shadow-lg">
          <Swords className="w-5 h-5 text-yellow-300 animate-spin" />
          <span>NEW KING TAKEOVER!</span>
          <Swords className="w-5 h-5 text-yellow-300 animate-spin" />
        </div>

        {/* Dual Avatars: Defeated KO'd vs New Victorious King */}
        <div className="relative z-10 flex items-center justify-center gap-4 md:gap-8 my-5">
          {/* Defeated King (KO Stamp) */}
          {defeatedKing && (
            <div className="relative flex flex-col items-center opacity-70 scale-90">
              <div className="relative w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border-2 border-slate-600 grayscale">
                <img
                  src={defeatedKing.profilePictureUrl}
                  alt={defeatedKing.nickname}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(defeatedKing.nickname)}`;
                  }}
                />
                {/* Dramatic KO Stamp */}
                <div className="absolute inset-0 bg-red-950/80 flex items-center justify-center">
                  <div className="px-2 py-0.5 rounded border-2 border-red-500 bg-red-600 text-white font-fighting text-sm md:text-base font-black rotate-[-15deg] shadow-lg">
                    KO'D!
                  </div>
                </div>
              </div>
              <span className="mt-1 text-xs text-slate-400 line-through truncate max-w-[90px]">
                {defeatedKing.nickname}
              </span>
            </div>
          )}

          {/* Versus / Defeated Icon */}
          <div className="flex flex-col items-center">
            <span className="text-xl md:text-2xl font-fighting text-red-500">VS</span>
            <Skull className="w-6 h-6 text-red-400 animate-pulse" />
          </div>

          {/* New King (Crowned Victor) */}
          <div className="relative flex flex-col items-center">
            {/* Animated Crown */}
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 drop-shadow-[0_0_15px_rgba(234,179,8,1)]">
              <Crown className="w-10 h-10 text-yellow-300 fill-amber-400 animate-bounce" />
            </div>

            <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden border-4 border-yellow-400 bg-gradient-to-b from-yellow-400 to-amber-600 shadow-[0_0_30px_rgba(245,158,11,0.8)]">
              <img
                src={newKing.profilePictureUrl}
                alt={newKing.nickname}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(newKing.nickname)}`;
                }}
              />
            </div>
            <span className="mt-2 text-sm md:text-base font-fighting text-yellow-300 drop-shadow truncate max-w-[140px]">
              {newKing.nickname}
            </span>
          </div>
        </div>

        {/* Leftover Starting HP Notice (Rule 4: leftover damage becomes starting HP) */}
        <div className="relative z-10 mx-auto max-w-sm rounded-xl bg-slate-900/90 border border-yellow-500/50 p-2.5 shadow-inner">
          <div className="flex items-center justify-center gap-1.5 text-xs text-amber-200 font-medium">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span>Leftover Damage Transferred:</span>
            <strong className="text-emerald-400 font-fighting text-sm">
              +{leftoverHp.toLocaleString()} HP
            </strong>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Zero wasted gift coins! The new King starts with remaining power.
          </p>
        </div>
      </div>
    </div>
  );
};
