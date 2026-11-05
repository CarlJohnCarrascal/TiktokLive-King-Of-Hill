import React from 'react';

export interface FloatingItem {
  id: string;
  text: string;
  type: 'damage' | 'heal' | 'ko' | 'first_king';
  subtext?: string;
  xOffset: number;
}

interface FloatingCombatTextProps {
  items: FloatingItem[];
}

export const FloatingCombatText: React.FC<FloatingCombatTextProps> = ({ items }) => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-40">
      {items.map((item) => {
        let colorClass = 'text-rose-400 drop-shadow-[0_2px_10px_rgba(244,63,94,0.8)]';
        let bgBadge = 'bg-rose-950/80 border-rose-500/60';

        if (item.type === 'heal') {
          colorClass = 'text-emerald-300 drop-shadow-[0_2px_10px_rgba(16,185,129,0.8)]';
          bgBadge = 'bg-emerald-950/80 border-emerald-500/60';
        } else if (item.type === 'ko') {
          colorClass = 'text-amber-300 drop-shadow-[0_2px_15px_rgba(245,158,11,1)] text-2xl md:text-3xl';
          bgBadge = 'bg-red-600/90 border-yellow-400';
        } else if (item.type === 'first_king') {
          colorClass = 'text-yellow-300 drop-shadow-[0_2px_15px_rgba(234,179,8,1)]';
          bgBadge = 'bg-amber-950/90 border-yellow-400';
        }

        return (
          <div
            key={item.id}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-float-damage flex flex-col items-center"
            style={{
              marginLeft: `${item.xOffset}px`
            }}
          >
            <div className={`px-3 py-1 rounded-full border-2 font-fighting tracking-wider uppercase text-lg md:text-xl font-black ${bgBadge} ${colorClass}`}>
              {item.text}
            </div>
            {item.subtext && (
              <span className="text-[11px] font-condensed tracking-wide text-white drop-shadow-md bg-black/60 px-2 py-0.5 rounded-md mt-0.5">
                {item.subtext}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
