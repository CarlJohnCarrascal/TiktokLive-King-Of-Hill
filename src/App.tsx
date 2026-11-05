import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameState,
  GameConfig,
  initialGameState,
  processGiftAction,
  applyDecayTick,
  processLikeAction,
  King,
  CombatResult
} from './game/rules';
import { OverlayView } from './components/OverlayView';
import { ControlPanel } from './components/ControlPanel';
import { FloatingItem } from './components/FloatingCombatText';
import { soundManager } from './utils/audio';
import { Eye, Sliders, Maximize2, Sparkles, Volume2, VolumeX } from 'lucide-react';

export default function App() {
  // Check if opened as dedicated OBS browser source via URL query
  const queryParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const isPureOverlayMode = queryParams.get('mode') === 'overlay' || queryParams.get('overlay') === 'true';
  const urlOrientation = queryParams.get('orientation') as 'landscape' | 'portrait' | null;

  // View mode switcher for streamer (Studio vs Clean Overlay)
  const [activeView, setActiveView] = useState<'studio' | 'overlay'>(
    isPureOverlayMode ? 'overlay' : 'studio'
  );

  // Configuration state
  const [config, setConfig] = useState<GameConfig>({
    tiktokUsername: '',
    hpMultiplier: 1,
    maxHp: 50000,
    minStartingHp: 10,
    enableDecay: false,
    decayAmount: 5,
    decayIntervalSeconds: 3,
    soundEnabled: true,
    soundVolume: 0.8,
    theme: 'cyber-arena',
    orientation: urlOrientation || 'landscape',
    likesPerHp: 1000
  });

  // Core Game State
  const [gameState, setGameState] = useState<GameState>(() => {
    // Attempt local storage persistence for session continuity
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('koth_game_state');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return initialGameState;
  });

  // Animation triggers
  const [isHit, setIsHit] = useState(false);
  const [isHealed, setIsHealed] = useState(false);
  const [floatingItems, setFloatingItems] = useState<FloatingItem[]>([]);
  const [takeoverInfo, setTakeoverInfo] = useState<{
    newKing: King | null;
    defeatedKing: King | null;
    leftoverHp: number;
  } | null>(null);

  // TikTok connection status from backend
  const [tiktokStatus, setTiktokStatus] = useState<{
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'ended';
    username: string;
    error: string | null;
  }>({
    status: 'disconnected',
    username: '',
    error: null
  });

  const wsRef = useRef<WebSocket | null>(null);

  // Synchronize audio manager settings with config
  useEffect(() => {
    soundManager.setMuted(!config.soundEnabled);
    soundManager.setVolume(config.soundVolume);
  }, [config.soundEnabled, config.soundVolume]);

  // Save game state to localStorage for persistence
  useEffect(() => {
    try {
      localStorage.setItem('koth_game_state', JSON.stringify(gameState));
    } catch (e) {
      // ignore
    }
  }, [gameState]);

  // Add floating combat text popup
  const addFloatingText = (
    text: string,
    type: 'damage' | 'heal' | 'ko' | 'first_king',
    subtext?: string
  ) => {
    const newItem: FloatingItem = {
      id: `float_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text,
      type,
      subtext,
      xOffset: (Math.random() - 0.5) * 80
    };
    setFloatingItems(prev => [...prev.slice(-6), newItem]);

    // Auto-remove after 1.5s
    setTimeout(() => {
      setFloatingItems(prev => prev.filter(item => item.id !== newItem.id));
    }, 1500);
  };

  // Process incoming combat gift action
  const handleIncomingGift = useCallback((gift: {
    userId: string;
    nickname: string;
    profilePictureUrl: string;
    giftName: string;
    diamondCount: number;
    repeatCount: number;
    coins: number;
  }) => {
    setGameState(prev => {
      const { nextState, result } = processGiftAction(prev, gift, config);

      // Trigger audio & animations based on result
      if (result.eventType === 'FIRST_KING') {
        soundManager.playKo();
        addFloatingText(`👑 NEW KING: ${gift.nickname}`, 'first_king', `+${result.leftoverHp} Starting HP`);
        setTakeoverInfo({
          newKing: result.newKing,
          defeatedKing: null,
          leftoverHp: result.leftoverHp
        });
      } else if (result.eventType === 'HEAL') {
        soundManager.playHeal();
        setIsHealed(true);
        setTimeout(() => setIsHealed(false), 600);
        addFloatingText(`+${result.healedAmount.toLocaleString()} HP HEAL`, 'heal', `${gift.nickname}'s ${gift.giftName}`);
      } else if (result.eventType === 'HIT') {
        soundManager.playHit();
        setIsHit(true);
        setTimeout(() => setIsHit(false), 350);
        addFloatingText(`-${result.damageDealt.toLocaleString()} HP`, 'damage', `${gift.nickname} (${gift.giftName})`);
      } else if (result.eventType === 'TAKEOVER') {
        soundManager.playKo();
        setIsHit(true);
        setTimeout(() => setIsHit(false), 400);
        addFloatingText(`💥 KO TAKEOVER!`, 'ko', `+${result.leftoverHp.toLocaleString()} HP Leftover`);
        setTakeoverInfo({
          newKing: result.newKing,
          defeatedKing: result.defeatedKing,
          leftoverHp: result.leftoverHp
        });
      }

      // Sync updated state to other connected browser sources via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'GAME_STATE_SYNC',
          state: nextState
        }));
      }

      return nextState;
    });
  }, [config]);

  // Process incoming like action (Rule: every 1,000 heart likes gives +1 HP)
  const handleIncomingLike = useCallback((likeData: {
    likeCount: number;
    totalLikes?: number;
    nickname?: string;
  }) => {
    setGameState(prev => {
      const { nextState, hpGained } = processLikeAction(prev, likeData.likeCount, config, likeData.nickname);
      if (hpGained > 0) {
        soundManager.playHeal();
        setIsHealed(true);
        setTimeout(() => setIsHealed(false), 500);
        addFloatingText(`❤️ +${hpGained} HP`, 'heal', `1,000 Heart Likes reached!`);
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'GAME_STATE_SYNC',
          state: nextState
        }));
      }

      return nextState;
    });
  }, [config]);

  // Connect to Backend WebSocket
  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[App] WebSocket connected to server');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'INIT_STATE') {
              if (message.config) {
                setConfig(prev => ({ ...prev, ...message.config }));
              }
              if (message.tiktokStatus) {
                setTiktokStatus(message.tiktokStatus);
              }
            } else if (message.type === 'GIFT_EVENT') {
              handleIncomingGift(message.data);
            } else if (message.type === 'LIKE_EVENT') {
              handleIncomingLike(message.data);
            } else if (message.type === 'TIKTOK_STATUS') {
              setTiktokStatus({
                status: message.status,
                username: message.username || '',
                error: message.error || null
              });
            } else if (message.type === 'CONFIG_UPDATED') {
              setConfig(prev => ({ ...prev, ...message.config }));
            } else if (message.type === 'SYNCED_GAME_STATE') {
              // Synchronize state across tabs if another tab triggered it
              setGameState(message.state);
            }
          } catch (err) {
            console.error('[App] Error parsing WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          console.log('[App] WebSocket disconnected. Reconnecting in 3s...');
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = (err) => {
          console.warn('[App] WebSocket error:', err);
          ws.close();
        };
      } catch (e) {
        console.error('[App] Failed to create WebSocket:', e);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [handleIncomingGift]);

  // Rule 6: Optional HP Decay Interval
  useEffect(() => {
    if (!config.enableDecay || !gameState.currentKing) return;

    const intervalMs = Math.max(1, config.decayIntervalSeconds || 3) * 1000;
    const decayInterval = setInterval(() => {
      setGameState(prev => {
        const { nextState, decayedAmount } = applyDecayTick(prev, config);
        if (decayedAmount > 0) {
          addFloatingText(`-${decayedAmount} HP`, 'damage', 'Decay');
        }
        return nextState;
      });
    }, intervalMs);

    return () => clearInterval(decayInterval);
  }, [config.enableDecay, config.decayAmount, config.decayIntervalSeconds, gameState.currentKing?.userId]);

  // Handlers for Control Panel
  const handleSimulateGift = (giftData: any) => {
    // If backend is connected, route through backend for multi-source sync, otherwise apply directly
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SIMULATE_GIFT',
        payload: giftData
      }));
    } else {
      handleIncomingGift(giftData);
    }
  };

  const handleUpdateConfig = (newConfig: Partial<GameConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'UPDATE_CONFIG',
        config: updated
      }));
    }
    // Also save via HTTP
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    }).catch(e => console.warn('[App] Error saving config:', e));
  };

  const handleConnectTikTok = (username: string) => {
    setTiktokStatus(prev => ({ ...prev, status: 'connecting', username, error: null }));
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CONNECT_TIKTOK',
        username
      }));
    } else {
      fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      }).catch(e => console.error('[App] Connect error:', e));
    }
  };

  const handleDisconnectTikTok = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'DISCONNECT_TIKTOK' }));
    } else {
      fetch('/api/disconnect', { method: 'POST' }).catch(e => console.error(e));
    }
  };

  const handleResetGame = () => {
    setGameState(initialGameState);
    localStorage.removeItem('koth_game_state');
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'GAME_STATE_SYNC',
        state: initialGameState
      }));
    }
  };

  // If running directly as OBS Browser Source (`?mode=overlay`):
  if (isPureOverlayMode) {
    return (
      <div className="min-h-screen bg-transparent select-none">
        <OverlayView
          gameState={gameState}
          config={config}
          floatingItems={floatingItems}
          isHit={isHit}
          isHealed={isHealed}
          takeoverInfo={takeoverInfo}
          tiktokStatus={tiktokStatus}
          onClearTakeover={() => setTakeoverInfo(null)}
          orientation={urlOrientation || config.orientation}
        />
      </div>
    );
  }

  // Pure Overlay Preview Mode (streamer testing full screen overlay)
  if (activeView === 'overlay') {
    return (
      <div className="min-h-screen bg-transparent select-none">
        <div className="fixed top-3 left-3 z-50">
          <button
            onClick={() => setActiveView('studio')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/95 hover:bg-slate-800 border border-slate-700 text-xs text-amber-300 font-semibold shadow-xl transition-all"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Back to Studio Controls</span>
          </button>
        </div>

        <OverlayView
          gameState={gameState}
          config={config}
          floatingItems={floatingItems}
          isHit={isHit}
          isHealed={isHealed}
          takeoverInfo={takeoverInfo}
          tiktokStatus={tiktokStatus}
          onClearTakeover={() => setTakeoverInfo(null)}
          orientation={urlOrientation || config.orientation}
        />
      </div>
    );
  }

  // Streamer Studio Mode: Interactive preview + Live controls & test buttons
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Top Streamer Toolbar */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <span className="font-fighting text-base tracking-wider text-amber-400">
            👑 TIKTOK LIVE KING OF THE HILL
          </span>
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300">
            OBS Browser Source Ready
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              onClick={() => setActiveView('studio')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-fighting uppercase tracking-wider transition-all bg-amber-500 text-slate-950 shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Studio & Test</span>
            </button>

            <button
              onClick={() => setActiveView('overlay')}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-fighting uppercase tracking-wider transition-all text-slate-400 hover:text-white"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Full Overlay</span>
            </button>
          </div>

          <a
            href="/?mode=overlay"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-amber-300 hover:text-white transition-all shadow-sm"
            title="Open pure transparent overlay in dedicated OBS window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Open Clean OBS Window</span>
          </a>
        </div>
      </header>

      {/* Main Studio Content Area */}
      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Live Overlay Preview Frame */}
        <section className="rounded-3xl border-2 border-slate-800 bg-black/60 shadow-2xl overflow-hidden relative">
          <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Live Overlay Preview ({config.orientation.toUpperCase()})</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              OBS Source Dimensions: {config.orientation === 'portrait' ? '1080 x 1920' : '1920 x 1080'}
            </div>
          </div>

          <div className="p-2 md:p-4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/40 via-slate-950 to-black">
            <OverlayView
              gameState={gameState}
              config={config}
              floatingItems={floatingItems}
              isHit={isHit}
              isHealed={isHealed}
              takeoverInfo={takeoverInfo}
              tiktokStatus={tiktokStatus}
              onClearTakeover={() => setTakeoverInfo(null)}
              orientation={config.orientation}
            />
          </div>
        </section>

        {/* Streamer Studio & Testing Controller */}
        <section>
          <ControlPanel
            gameState={gameState}
            config={config}
            tiktokStatus={tiktokStatus}
            onSimulateGift={handleSimulateGift}
            onUpdateConfig={handleUpdateConfig}
            onConnectTikTok={handleConnectTikTok}
            onDisconnectTikTok={handleDisconnectTikTok}
            onResetGame={handleResetGame}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-4 px-6 text-center text-xs text-slate-400">
        TikTok LIVE King of the Hill Overlay • Playful Arena Combat • 100% Free & Open Source
      </footer>
    </div>
  );
}
