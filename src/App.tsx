import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameState,
  GameConfig,
  initialGameState,
  processGiftAction,
  applyDecayTick,
  processLikeAction,
  King
} from './game/rules';
import { OverlayView } from './components/OverlayView';
import { ControlPanel } from './components/ControlPanel';
import { FloatingItem } from './components/FloatingCombatText';
import { RocketGiftItem, RocketGiftLayer } from './components/RocketGiftLayer';
import { soundManager } from './utils/audio';
import { Eye, Sliders, Maximize2 } from 'lucide-react';

const STORAGE_KEY = 'koth_game_state_v2';

export default function App() {
  // Check if opened as dedicated OBS browser source via URL query
  const queryParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const isPureOverlayMode = queryParams.get('mode') === 'overlay' || queryParams.get('overlay') === 'true';
  const urlOrientation = queryParams.get('orientation') as 'landscape' | 'portrait' | null;

  // View mode switcher for streamer (Studio vs Clean Overlay)
  const [activeView, setActiveView] = useState<'studio' | 'overlay'>(
    isPureOverlayMode ? 'overlay' : 'studio'
  );
  const [showOverlayControls, setShowOverlayControls] = useState(false);

  // Auto-hide "Back to Studio Controls" button in Full Overlay view after 2.2s of inactivity
  useEffect(() => {
    if (activeView !== 'overlay' || isPureOverlayMode) return;

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const triggerShow = () => {
      setShowOverlayControls(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        setShowOverlayControls(false);
      }, 2200);
    };

    // Show briefly on entry, then auto-hide
    triggerShow();

    window.addEventListener('mousemove', triggerShow);
    window.addEventListener('touchstart', triggerShow);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      window.removeEventListener('mousemove', triggerShow);
      window.removeEventListener('touchstart', triggerShow);
    };
  }, [activeView, isPureOverlayMode]);

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
    likesPerHp: 100
  });

  // Core Game State
  const [gameState, setGameState] = useState<GameState>(() => {
    if (typeof window !== 'undefined') {
      try {
        // Clear legacy v1 storage that may contain duplicated gifts or '0' userId
        localStorage.removeItem('koth_game_state');
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          return {
            ...initialGameState,
            ...parsed,
            defenderLikesPool: parsed.defenderLikesPool || 0,
            processedEventIds: Array.isArray(parsed.processedEventIds) ? parsed.processedEventIds : []
          };
        }
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
  const [rocketGifts, setRocketGifts] = useState<RocketGiftItem[]>([]);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    } catch (e) {
      // ignore
    }
  }, [gameState]);

  // Add floating combat text popup
  const addFloatingText = useCallback((
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
  }, []);

  // Launch gift rocketing directly into the defender profile avatar
  const launchRocketGift = useCallback((gift: {
    giftName: string;
    giftPictureUrl?: string;
    diamondCount: number;
    nickname: string;
    profilePictureUrl: string;
    coins: number;
    isHeal?: boolean;
  }) => {
    // 1. Calculate random start position along the bottom edge of the screen
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

    // Random start along the bottom (5% to 95% of viewport width)
    const startX = 20 + Math.random() * (windowWidth - 40);
    const startY = windowHeight - (10 + Math.random() * 40);

    // 2. Measure actual bounding rectangle of the Defender Profile Avatar in real time!
    let targetX = windowWidth * 0.35;
    let targetY = 120;

    const avatarElem = typeof document !== 'undefined' ? document.getElementById('defender-avatar-target') : null;
    if (avatarElem) {
      const rect = avatarElem.getBoundingClientRect();
      targetX = rect.left + rect.width / 2;
      targetY = rect.top + rect.height / 2;
    }

    // 3. Compute exact vector delta
    const deltaX = targetX - startX;
    const deltaY = targetY - startY; // negative value since target is higher up

    // 4. Compute pointing angle in degrees:
    // When deltaX = 0, deltaY < 0 (pointing straight UP), angle is 0deg.
    // In math: Math.atan2(deltaY, deltaX) gives angle relative to positive X-axis (pointing right).
    // Straight UP is -90deg (-PI/2). To align 0deg with UP: (rad * 180 / Math.PI) + 90
    const rad = Math.atan2(deltaY, deltaX);
    const pointingAngleDeg = Math.round((rad * 180) / Math.PI + 90);

    const newRocket: RocketGiftItem = {
      id: `rocket_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      giftName: gift.giftName,
      giftPictureUrl: gift.giftPictureUrl,
      diamondCount: gift.diamondCount,
      nickname: gift.nickname,
      avatarUrl: gift.profilePictureUrl,
      coins: gift.coins,
      isHeal: !!gift.isHeal,
      startX,
      startY,
      targetX,
      targetY,
      deltaX,
      deltaY,
      pointingAngle: pointingAngleDeg
    };

    setRocketGifts(prev => [...prev.slice(-8), newRocket]);

    // Remove projectile after animation finishes
    setTimeout(() => {
      setRocketGifts(prev => prev.filter(r => r.id !== newRocket.id));
    }, 1100);
  }, []);

  // Process incoming combat gift action
  const handleIncomingGift = useCallback((gift: {
    eventId?: string;
    streakKey?: string;
    userId: string;
    nickname: string;
    profilePictureUrl: string;
    giftName: string;
    giftPictureUrl?: string;
    diamondCount: number;
    repeatCount: number;
    coins: number;
  }) => {
    setGameState(prev => {
      const { nextState, result } = processGiftAction(prev, gift, config);

      if (result.eventType === 'DUPLICATE') {
        return prev;
      }

      // Always launch animated rocketing gift towards defender!
      launchRocketGift({
        giftName: gift.giftName,
        giftPictureUrl: gift.giftPictureUrl,
        diamondCount: gift.diamondCount,
        nickname: gift.nickname,
        profilePictureUrl: gift.profilePictureUrl,
        coins: gift.coins,
        isHeal: result.eventType === 'HEAL'
      });

      // The rocket takes ~900ms to fly across the screen and reach the Defender profile avatar.
      // Trigger the bomb explosion, sound, screen shake, and floating text precisely upon arrival!
      const ROCKET_FLIGHT_DURATION_MS = 900;

      setTimeout(() => {
        if (result.eventType === 'FIRST_KING') {
          soundManager.playKo();
          addFloatingText(`👑 NEW DEFENDER: ${gift.nickname}`, 'first_king', `+${result.leftoverHp} Starting HP`);
          setTakeoverInfo({
            newKing: result.newKing,
            defeatedKing: null,
            leftoverHp: result.leftoverHp
          });
        } else if (result.eventType === 'HEAL') {
          soundManager.playHeal();
          setIsHealed(true);
          setTimeout(() => setIsHealed(false), 700);
          addFloatingText(`+${result.healedAmount.toLocaleString()} HP HEAL`, 'heal', `${gift.nickname}'s ${gift.giftName}`);
        } else if (result.eventType === 'HIT') {
          soundManager.playHit();
          setIsHit(true);
          setTimeout(() => setIsHit(false), 450);
          addFloatingText(`-${result.damageDealt.toLocaleString()} HP`, 'damage', `${gift.nickname} (${gift.giftName})`);
        } else if (result.eventType === 'TAKEOVER') {
          soundManager.playKo();
          setIsHit(true);
          setTimeout(() => setIsHit(false), 500);
          addFloatingText(`💥 KO TAKEOVER!`, 'ko', `+${result.leftoverHp.toLocaleString()} HP Leftover`);
          setTakeoverInfo({
            newKing: result.newKing,
            defeatedKing: result.defeatedKing,
            leftoverHp: result.leftoverHp
          });
        }
      }, ROCKET_FLIGHT_DURATION_MS);

      // Sync updated state to other connected browser sources via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'GAME_STATE_SYNC',
          state: nextState
        }));
      }

      return nextState;
    });
  }, [config, addFloatingText]);

  // Process incoming like action:
  // - 100 heart likes from challengers DECREASES Defender HP (-1 HP)
  // - 100 heart likes from Current Defender INCREASES her own HP (+1 HP)
  const handleIncomingLike = useCallback((likeData: {
    eventId?: string;
    userId?: string;
    nickname?: string;
    profilePictureUrl?: string;
    likeCount: number;
    totalLikes?: number;
  }) => {
    setGameState(prev => {
      const result = processLikeAction(prev, likeData, config);
      const { nextState, eventType, damageDealt, healedAmount, defeatedKing, newKing, leftoverHp } = result;
      const likesTarget = config.likesPerHp || 100;

      if (eventType === 'LIKE_HEAL' && healedAmount > 0) {
        soundManager.playHeal();
        setIsHealed(true);
        setTimeout(() => setIsHealed(false), 500);
        addFloatingText(
          `❤️ +${healedAmount} HP HEAL`,
          'heal',
          `Defender ${likeData.nickname || ''} (${likesTarget} Heart Likes)`
        );
      } else if (eventType === 'LIKE_HIT' && damageDealt > 0) {
        soundManager.playHit();
        setIsHit(true);
        setTimeout(() => setIsHit(false), 350);
        addFloatingText(
          `💔 -${damageDealt} HP`,
          'damage',
          `${likesTarget} Heart Likes Attack!`
        );
      } else if (eventType === 'LIKE_TAKEOVER') {
        soundManager.playKo();
        setIsHit(true);
        setTimeout(() => setIsHit(false), 400);
        addFloatingText(`💥 LIKE KO TAKEOVER!`, 'ko', `+${leftoverHp} HP Leftover`);
        setTakeoverInfo({
          newKing,
          defeatedKing,
          leftoverHp
        });
      }

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'GAME_STATE_SYNC',
          state: nextState
        }));
      }

      return nextState;
    });
  }, [config, addFloatingText]);

  // Keep latest callbacks in refs so WebSocket connection is never torn down/recreated on config updates
  const handleGiftRef = useRef(handleIncomingGift);
  const handleLikeRef = useRef(handleIncomingLike);

  useEffect(() => {
    handleGiftRef.current = handleIncomingGift;
  }, [handleIncomingGift]);

  useEffect(() => {
    handleLikeRef.current = handleIncomingLike;
  }, [handleIncomingLike]);

  // Connect to Backend WebSocket (single persistent connection per tab)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectWs = () => {
      if (!isMounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[App] WebSocket connected to server');
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'INIT_STATE') {
              if (message.config) {
                const incomingConfig = { ...message.config };
                if (incomingConfig.likesPerHp === 1000) {
                  incomingConfig.likesPerHp = 100;
                }
                setConfig(prev => ({ ...prev, ...incomingConfig }));
              }
              if (message.tiktokStatus) {
                setTiktokStatus(message.tiktokStatus);
              }
            } else if (message.type === 'GIFT_EVENT') {
              handleGiftRef.current(message.data);
            } else if (message.type === 'LIKE_EVENT') {
              handleLikeRef.current(message.data);
            } else if (message.type === 'TIKTOK_STATUS') {
              setTiktokStatus({
                status: message.status,
                username: message.username || '',
                error: message.error || null
              });
            } else if (message.type === 'CONFIG_UPDATED') {
              setConfig(prev => ({ ...prev, ...message.config }));
            } else if (message.type === 'SYNCED_GAME_STATE') {
              setGameState(message.state);
            }
          } catch (err) {
            console.error('[App] Error parsing WebSocket message:', err);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.log('[App] WebSocket disconnected. Reconnecting in 3s...');
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          if (ws) {
            ws.close();
          }
        };
      } catch (e) {
        console.error('[App] Failed to create WebSocket:', e);
        if (isMounted) {
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
    };
  }, []);

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
  }, [config.enableDecay, config.decayAmount, config.decayIntervalSeconds, gameState.currentKing?.userId, addFloatingText]);

  // Handlers for Control Panel
  const handleSimulateGift = (giftData: any) => {
    const payload = {
      ...giftData,
      eventId: giftData.eventId || `sim_gift_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SIMULATE_GIFT',
        payload
      }));
    } else {
      handleIncomingGift(payload);
    }
  };

  const handleSimulateLike = (likeData: {
    userId?: string;
    nickname: string;
    profilePictureUrl?: string;
    likeCount: number;
  }) => {
    const payload = {
      ...likeData,
      eventId: `sim_like_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SIMULATE_LIKE',
        payload
      }));
    } else {
      handleIncomingLike(payload);
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
    localStorage.removeItem(STORAGE_KEY);
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
      <div className="h-screen w-screen overflow-hidden bg-transparent select-none">
        <OverlayView
          gameState={gameState}
          config={config}
          floatingItems={floatingItems}
          rocketGifts={rocketGifts}
          isHit={isHit}
          isHealed={isHealed}
          takeoverInfo={takeoverInfo}
          tiktokStatus={tiktokStatus}
          onClearTakeover={() => setTakeoverInfo(null)}
          orientation={urlOrientation || config.orientation}
          isFullOverlay={true}
        />
      </div>
    );
  }

  // Pure Overlay Preview Mode (streamer testing full screen overlay)
  if (activeView === 'overlay') {
    return (
      <div className="h-screen w-screen overflow-hidden bg-transparent select-none">
        <div
          className={`fixed top-3 left-3 z-50 transition-all duration-300 ${
            showOverlayControls
              ? 'opacity-100 translate-y-0 pointer-events-auto'
              : 'opacity-0 -translate-y-2 pointer-events-none'
          }`}
        >
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
          rocketGifts={rocketGifts}
          isHit={isHit}
          isHealed={isHealed}
          takeoverInfo={takeoverInfo}
          tiktokStatus={tiktokStatus}
          onClearTakeover={() => setTakeoverInfo(null)}
          orientation={urlOrientation || config.orientation}
          isFullOverlay={true}
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
              rocketGifts={rocketGifts}
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
            onSimulateLike={handleSimulateLike}
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
