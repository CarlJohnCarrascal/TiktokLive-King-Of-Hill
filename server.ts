import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Default configuration
const defaultConfig = {
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
  orientation: 'landscape',
  likesPerHp: 1000
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[Config] Error loading config.json:', err);
  }
  return { ...defaultConfig };
}

function saveConfig(newConfig: Record<string, unknown>) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Config] Error saving config.json:', err);
  }
}

let currentConfig = loadConfig();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Global broadcast to all connected WebSocket overlays/controls
function broadcast(message: Record<string, unknown>) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// TikTok Live Connector State & Auto-reconnect Management
let tiktokConnection: TikTokLiveConnection | null = null;
let currentTikTokUsername = currentConfig.tiktokUsername || '';
let connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
let lastError: string | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

// Streak deduplication cache (to strictly obey Rule 7: no double counting)
const pendingStreaks = new Map<string, { timer: NodeJS.Timeout; lastData: any }>();

function stopTikTok() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      // ignore
    }
    tiktokConnection = null;
  }
  connectionStatus = 'disconnected';
  lastError = null;
  broadcast({
    type: 'TIKTOK_STATUS',
    status: connectionStatus,
    username: currentTikTokUsername,
    error: null
  });
}

function startTikTok(username: string) {
  stopTikTok();
  if (!username || !username.trim()) return;

  const cleanUsername = username.trim().replace(/^@/, '');
  currentTikTokUsername = cleanUsername;
  connectionStatus = 'connecting';
  lastError = null;

  broadcast({
    type: 'TIKTOK_STATUS',
    status: connectionStatus,
    username: cleanUsername,
    error: null
  });

  try {
    tiktokConnection = new TikTokLiveConnection(cleanUsername, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      fetchRoomInfoOnConnect: false
    });

    tiktokConnection.connect().then((state: any) => {
      connectionStatus = 'connected';
      lastError = null;
      reconnectAttempts = 0;
      const roomId = state?.roomId || state?.roomInfo?.roomId || 'active_room';
      console.log(`[TikTok] Successfully connected to room ID: ${roomId} for user @${cleanUsername}`);
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'connected',
        username: cleanUsername,
        roomId,
        error: null
      });
    }).catch((err: any) => {
      const errorMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error(`[TikTok] Connection failed for @${cleanUsername}:`, errorMsg);
      connectionStatus = 'error';
      lastError = errorMsg;
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'error',
        username: cleanUsername,
        error: lastError
      });
      scheduleReconnect();
    });

    tiktokConnection.on(ControlEvent.DISCONNECTED, () => {
      console.log(`[TikTok] Disconnected from @${cleanUsername}`);
      if (connectionStatus !== 'error') {
        connectionStatus = 'disconnected';
        broadcast({
          type: 'TIKTOK_STATUS',
          status: 'disconnected',
          username: cleanUsername,
          error: null
        });
      }
      scheduleReconnect();
    });

    tiktokConnection.on(WebcastEvent.STREAM_END, () => {
      console.log(`[TikTok] Live stream ended for @${cleanUsername}`);
      connectionStatus = 'disconnected';
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'ended',
        username: cleanUsername,
        error: 'Stream has ended'
      });
    });

    tiktokConnection.on(ControlEvent.ERROR, (err: any) => {
      const errorMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      // Ignore non-fatal Euler background warnings if any
      if (errorMsg.includes('eulerstream') || errorMsg.includes('Failed to fetch room gifts')) {
        console.warn('[TikTok] Non-fatal background warning ignored:', errorMsg);
        return;
      }
      console.error('[TikTok] Connector error:', errorMsg);
      lastError = errorMsg;
      broadcast({
        type: 'TIKTOK_STATUS',
        status: connectionStatus,
        username: cleanUsername,
        error: lastError
      });
    });

    // Handle Gift events with strict streak protection (Rule 7)
    tiktokConnection.on(WebcastEvent.GIFT, (data: any) => {
      handleIncomingGift(data);
    });

    // Handle Like events (Rule: Every 1,000 heart likes gives +1 HP)
    tiktokConnection.on(WebcastEvent.LIKE, (data: any) => {
      handleIncomingLike(data);
    });

  } catch (err: any) {
    console.error('[TikTok] Initialization error:', err);
    connectionStatus = 'error';
    lastError = err?.message || 'Initialization failed';
    broadcast({
      type: 'TIKTOK_STATUS',
      status: 'error',
      username: cleanUsername,
      error: lastError
    });
  }
}

function scheduleReconnect() {
  if (reconnectTimer || !currentTikTokUsername) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[TikTok] Max reconnect attempts reached. Waiting for user action.');
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts - 1), 30000);
  console.log(`[TikTok] Scheduling reconnect #${reconnectAttempts} in ${Math.round(delay / 1000)}s...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentTikTokUsername) {
      startTikTok(currentTikTokUsername);
    }
  }, delay);
}

// Process gift data and apply Rule 7 (Count repeat/streaks only once per final streak value)
function handleIncomingGift(data: any) {
  try {
    const rawUserId = data.userId ||
      data.user?.id ||
      data.user?.idStr ||
      data.user?.uniqueId ||
      data.user?.secUid ||
      data.uniqueId ||
      data.secUid;

    const nickname = data.nickname || data.user?.nickname || data.user?.uniqueId || data.uniqueId || 'Mystery Gifter';
    const userId = rawUserId
      ? String(rawUserId)
      : `gifter_${encodeURIComponent(nickname)}_${Math.random().toString(36).substring(2, 7)}`;

    const profilePictureUrl = data.profilePictureUrl || 
      data.user?.profilePictureUrls?.[0] || 
      data.user?.avatarThumb?.urlList?.[0] || 
      data.userDetails?.profilePictureUrls?.[0] || 
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;
    
    let giftName = data.giftName || data.gift?.name || data.giftDetails?.giftName;
    const giftId = data.giftId || data.gift?.id || 'gift';
    const diamondCount = Number(data.diamondCount || data.gift?.diamond_count || data.diamonds || 1);
    const repeatCount = Number(data.repeatCount || data.repeat_count || 1);
    const repeatEnd = Boolean(data.repeatEnd || data.repeat_end === 1 || data.gift?.repeat_end === 1);
    const isStreakGift = Boolean(data.giftType === 1 || (data.repeatCount && data.repeatCount > 1) || !repeatEnd);

    if (!giftName || giftName === 'Gift') {
      if (diamondCount === 1) giftName = 'Rose';
      else if (diamondCount === 30) giftName = 'Doughnut';
      else if (diamondCount === 100) giftName = 'Confetti';
      else if (diamondCount === 299) giftName = 'Corgi';
      else if (diamondCount === 500) giftName = 'Money Gun';
      else if (diamondCount === 1000) giftName = 'Galaxy';
      else if (diamondCount === 29999) giftName = 'Lion';
      else if (diamondCount === 44999) giftName = 'TikTok Universe';
      else giftName = `Gift (${diamondCount} coins)`;
    }

    // If it's a non-streak gift or streak is finalized:
    if (!isStreakGift || repeatEnd) {
      // Clear any pending debounce streak
      const streakKey = `${userId}_${giftId}`;
      if (pendingStreaks.has(streakKey)) {
        clearTimeout(pendingStreaks.get(streakKey)!.timer);
        pendingStreaks.delete(streakKey);
      }

      const totalCoins = diamondCount * (repeatCount || 1);
      dispatchGiftEvent({
        userId,
        nickname,
        profilePictureUrl,
        giftName,
        giftId: String(giftId),
        diamondCount,
        repeatCount,
        coins: totalCoins,
        timestamp: Date.now()
      });
      return;
    }

    // For in-progress streak gifts: wait for the final streak update with a fallback debounce (1200ms)
    // in case TikTok's WebSocket drops the final repeatEnd packet
    const streakKey = `${userId}_${giftId}`;
    if (pendingStreaks.has(streakKey)) {
      clearTimeout(pendingStreaks.get(streakKey)!.timer);
    }

    const timer = setTimeout(() => {
      const pending = pendingStreaks.get(streakKey);
      if (pending) {
        pendingStreaks.delete(streakKey);
        const pData = pending.lastData;
        const totalCoins = Number(pData.diamondCount || 1) * Number(pData.repeatCount || 1);
        dispatchGiftEvent({
          userId,
          nickname,
          profilePictureUrl,
          giftName,
          giftId: String(giftId),
          diamondCount: Number(pData.diamondCount || 1),
          repeatCount: Number(pData.repeatCount || 1),
          coins: totalCoins,
          timestamp: Date.now()
        });
      }
    }, 1200);

    pendingStreaks.set(streakKey, {
      timer,
      lastData: { diamondCount, repeatCount }
    });

  } catch (err) {
    console.error('[TikTok] Error handling gift event:', err);
  }
}

function dispatchGiftEvent(giftData: any) {
  console.log(`[Gift] ${giftData.nickname} sent ${giftData.repeatCount}x ${giftData.giftName} (${giftData.coins} coins)`);
  broadcast({
    type: 'GIFT_EVENT',
    data: giftData
  });
}

function handleIncomingLike(data: any) {
  try {
    const likeCount = Number(data.likeCount || data.count || 1);
    const totalLikes = Number(data.totalLikeCount || 0);
    const nickname = data.nickname || data.user?.nickname || data.user?.uniqueId || 'Viewer';
    dispatchLikeEvent({
      likeCount,
      totalLikes,
      nickname,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[TikTok] Error handling like event:', err);
  }
}

function dispatchLikeEvent(likeData: any) {
  broadcast({
    type: 'LIKE_EVENT',
    data: likeData
  });
}

// HTTP API Endpoints
app.get('/api/config', (_req, res) => {
  res.json({
    config: currentConfig,
    status: connectionStatus,
    username: currentTikTokUsername,
    error: lastError
  });
});

app.post('/api/config', (req, res) => {
  try {
    currentConfig = { ...currentConfig, ...req.body };
    saveConfig(currentConfig);
    broadcast({
      type: 'CONFIG_UPDATED',
      config: currentConfig
    });
    res.json({ success: true, config: currentConfig });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/connect', (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  currentConfig.tiktokUsername = username;
  saveConfig(currentConfig);
  startTikTok(username);
  res.json({ success: true, status: 'connecting', username });
});

app.post('/api/disconnect', (_req, res) => {
  stopTikTok();
  res.json({ success: true, status: 'disconnected' });
});

app.post('/api/test-gift', (req, res) => {
  const gift = {
    userId: req.body.userId || `user_${Math.floor(Math.random() * 9000 + 1000)}`,
    nickname: req.body.nickname || 'TestGifter',
    profilePictureUrl: req.body.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(req.body.nickname || 'Tester')}`,
    giftName: req.body.giftName || 'Rose',
    giftId: req.body.giftId || 'test_rose',
    diamondCount: Number(req.body.diamondCount || req.body.coins || 1),
    repeatCount: Number(req.body.repeatCount || 1),
    coins: Number(req.body.coins || (Number(req.body.diamondCount || 1) * Number(req.body.repeatCount || 1))),
    timestamp: Date.now()
  };

  dispatchGiftEvent(gift);
  res.json({ success: true, gift });
});

app.post('/api/test-like', (req, res) => {
  const likeData = {
    likeCount: Number(req.body.likeCount || 100),
    totalLikes: Number(req.body.totalLikes || 1000),
    nickname: req.body.nickname || 'HeartGiver',
    timestamp: Date.now()
  };
  dispatchLikeEvent(likeData);
  res.json({ success: true, like: likeData });
});

// WebSocket Server Handlers
wss.on('connection', (ws) => {
  // Send initial state upon connection
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    config: currentConfig,
    tiktokStatus: {
      status: connectionStatus,
      username: currentTikTokUsername,
      error: lastError
    }
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());
      if (parsed.type === 'SIMULATE_GIFT') {
        dispatchGiftEvent(parsed.payload);
      } else if (parsed.type === 'SIMULATE_LIKE') {
        dispatchLikeEvent(parsed.payload);
      } else if (parsed.type === 'CONNECT_TIKTOK') {
        currentConfig.tiktokUsername = parsed.username;
        saveConfig(currentConfig);
        startTikTok(parsed.username);
      } else if (parsed.type === 'DISCONNECT_TIKTOK') {
        stopTikTok();
      } else if (parsed.type === 'UPDATE_CONFIG') {
        currentConfig = { ...currentConfig, ...parsed.config };
        saveConfig(currentConfig);
        broadcast({
          type: 'CONFIG_UPDATED',
          config: currentConfig
        });
      } else if (parsed.type === 'GAME_STATE_SYNC') {
        // Broadcast sync to other browser windows (e.g. OBS window receiving state from Control Panel)
        broadcast({
          type: 'SYNCED_GAME_STATE',
          state: parsed.state
        });
      }
    } catch (e) {
      console.error('[WS] Error processing message:', e);
    }
  });
});

// Auto-start TikTok if username was configured
if (currentConfig.tiktokUsername) {
  console.log(`[TikTok] Auto-starting connection for @${currentConfig.tiktokUsername}...`);
  startTikTok(currentConfig.tiktokUsername);
}

// Vite middleware integration for full-stack dev
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[Server] King of the Hill server running at http://localhost:${port}`);
    console.log(`[Server] OBS Browser Source: http://localhost:${port}/?mode=overlay`);
    console.log(`[Server] Control / Test Panel: http://localhost:${port}/`);
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
});
