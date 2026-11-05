import React, { useState, useEffect } from 'react';
import { GameState, GameConfig, King } from '../game/rules';
import { ChampionCard } from './ChampionCard';
import { TakeoverBanner } from './TakeoverBanner';
import { SidePanel } from './SidePanel';
import { FloatingCombatText, FloatingItem } from './FloatingCombatText';
import { RocketGiftItem, RocketGiftLayer } from './RocketGiftLayer';
import { Radio, Wifi, WifiOff, Volume2, VolumeX, Terminal, Shield } from 'lucide-react';

interface OverlayViewProps {
  gameState: GameState;
  config: GameConfig;
  floatingItems: FloatingItem[];
  rocketGifts?: RocketGiftItem[];
  isHit: boolean;
  isHealed: boolean;
  takeoverInfo: {
    newKing: King | null;
    defeatedKing: King | null;
    leftoverHp: number;
  } | null;
  tiktokStatus: {
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'ended';
    username: string;
    error: string | null;
  };
  onClearTakeover: () => void;
  orientation?: 'landscape' | 'portrait';
  isFullOverlay?: boolean;
}

export const OverlayView: React.FC<OverlayViewProps> = ({
  gameState,
  config,
  floatingItems,
  rocketGifts = [],
  isHit,
  isHealed,
  takeoverInfo,
  tiktokStatus,
  onClearTakeover,
  orientation: propOrientation,
  isFullOverlay = false
}) => {
  const [showDebug, setShowDebug] = useState(false);
  const orientation = propOrientation || config.orientation || 'landscape';

  // Toggle debug panel on keypress 'd' or 'D'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      className={`relative w-full bg-transparent overflow-hidden flex flex-col justify-start ${
        isFullOverlay ? 'h-screen max-h-screen p-2.5 md:p-4' : 'p-2 md:p-3'
      }`}
    >
      {/* Rocketing gifts flying straight to defender */}
      <RocketGiftLayer rockets={rocketGifts} />

      {/* Floating combat damage / heal popups */}
      <FloatingCombatText items={floatingItems} />

      {/* Knockout & Takeover Banner modal */}
      {takeoverInfo && (
        <TakeoverBanner
          newKing={takeoverInfo.newKing}
          defeatedKing={takeoverInfo.defeatedKing}
          leftoverHp={takeoverInfo.leftoverHp}
          onFinished={onClearTakeover}
        />
      )}

      {/* Main Overlay Layout: Defender Panel on top, Carousel (Last Gift & Hall of Fame) below */}
      <div
        className={`w-full mx-auto flex flex-col items-center gap-2.5 transition-all ${
          orientation === 'portrait' ? 'max-w-[480px]' : 'max-w-3xl'
        }`}
      >
        {/* Primary Focus: King / Defender Card */}
        <div className="w-full shrink-0">
          <ChampionCard
            king={gameState.currentKing}
            winStreak={
              gameState.currentKing?.winStreak ??
              gameState.currentKing?.knockouts ??
              gameState.currentWinStreak ??
              0
            }
            isHit={isHit}
            isHealed={isHealed}
            theme={config.theme}
            orientation={orientation}
            likesPool={gameState.likesPool}
            defenderLikesPool={gameState.defenderLikesPool || 0}
            totalLikes={gameState.totalRoomLikes}
            likesPerHp={config.likesPerHp || 100}
          />
        </div>

        {/* Supporting Panel: Auto-switching Carousel (Recent Activity & Hall of Fame) placed BELOW Defender */}
        <div className="w-full shrink-0">
          <SidePanel
            lastAttackers={gameState.lastAttackers}
            leaderboards={gameState.leaderboard}
            orientation={orientation}
          />
        </div>
      </div>

      {/* Discreet Debug Status Indicator (bottom right corner - auto-dimmed in Full Overlay unless hovered) */}
      <div className={`fixed bottom-2.5 right-2.5 z-30 transition-opacity duration-300 ${
        isFullOverlay && !showDebug ? 'opacity-0 hover:opacity-100' : 'opacity-100'
      }`}>
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-400 hover:text-white transition-all shadow-md"
          title="Press 'D' to toggle debug panel"
        >
          {tiktokStatus.status === 'connected' ? (
            <span className="flex items-center gap-1 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE @{tiktokStatus.username || 'connected'}</span>
            </span>
          ) : tiktokStatus.status === 'connecting' ? (
            <span className="flex items-center gap-1 text-amber-400">
              <Radio className="w-3 h-3 animate-spin" />
              <span>Connecting...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <WifiOff className="w-3 h-3" />
              <span>Offline (Press D)</span>
            </span>
          )}
        </button>

        {/* Expandable Debug & Status Panel */}
        {showDebug && (
          <div className="absolute bottom-9 right-0 w-80 rounded-2xl bg-slate-950/95 border border-slate-700 p-4 text-xs text-slate-300 shadow-2xl backdrop-blur-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-fighting text-amber-400">
              <div className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>OVERLAY DEBUG MONITOR</span>
              </div>
              <button
                onClick={() => setShowDebug(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">TikTok Target:</span>
                <span className="text-white font-bold">{tiktokStatus.username ? `@${tiktokStatus.username}` : 'None (Test Mode)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Connection Status:</span>
                <span className={`font-bold ${
                  tiktokStatus.status === 'connected' ? 'text-emerald-400' :
                  tiktokStatus.status === 'connecting' ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {tiktokStatus.status.toUpperCase()}
                </span>
              </div>
              {tiktokStatus.error && (
                <div className="text-red-400 bg-red-950/40 p-1.5 rounded border border-red-500/30 text-[10px]">
                  Error: {tiktokStatus.error}
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">HP Multiplier:</span>
                <span className="text-white">{config.hpMultiplier}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">MAX HP:</span>
                <span className="text-white">{config.maxHp.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Decay Enabled:</span>
                <span className={config.enableDecay ? 'text-emerald-400' : 'text-slate-400'}>
                  {config.enableDecay ? `Yes (-${config.decayAmount} HP / ${config.decayIntervalSeconds}s)` : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Audio Muted:</span>
                <span className={config.soundEnabled ? 'text-emerald-400' : 'text-amber-400'}>
                  {config.soundEnabled ? `On (${Math.round(config.soundVolume * 100)}%)` : 'Muted'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Coins:</span>
                <span className="text-amber-400">{gameState.totalCoinsContributed.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Battles:</span>
                <span className="text-white">{gameState.totalBattles}</span>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
              <span>Press <strong>'D'</strong> anytime to toggle</span>
              <span className="text-amber-400">v1.0 Ready for OBS</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
