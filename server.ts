import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  RoomIdRouteConfig,
  IsLiveRouteConfig
} from 'tiktok-live-connector';

// Ensure Room ID & Live checks use TikTok's free unsigned endpoints instead of Euler Stream quota
RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;

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
  likesPerHp: 100
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed.likesPerHp === 1000) {
        parsed.likesPerHp = 100;
      }
      return { ...defaultConfig, ...parsed };
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

// Global broadcast to connected WebSocket overlays/controls (optionally excluding sender)
function broadcast(message: Record<string, unknown>, excludeClient?: WebSocket) {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
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

// Streak deduplication cache (to strictly obey Rule 7: no double counting or duplicate gifts)
const pendingStreaks = new Map<string, { timer: NodeJS.Timeout; lastData: any }>();
const completedStreaks = new Map<string, { repeatCount: number; timestamp: number }>();
const processedMsgIds = new Set<string>();

// Gift Coin Value Catalog (by Gift ID and by lowercase Gift Name)
interface GiftCatalogEntry {
  id: string;
  name: string;
  diamondCount: number;
  combo: boolean;
  type: number;
  image?: string;
}

const giftCatalogById = new Map<string, GiftCatalogEntry>();
const giftCatalogByName = new Map<string, GiftCatalogEntry>();

// Seed built-in popular gifts & load full 723-gift catalog from src/data/tiktokGiftCatalog.json
function initializeGiftCatalog() {
  const builtinFallback: Array<{ id: string; name: string; diamondCount: number; combo?: boolean; type?: number; image?: string }> = [
    { id: '5655', name: 'Rose', diamondCount: 1, combo: true, type: 1 },
    { id: '6064', name: 'GG', diamondCount: 1, combo: true, type: 1 },
    { id: '7934', name: 'Heart Me', diamondCount: 1, combo: false, type: 4 },
    { id: '5827', name: 'Ice Cream Cone', diamondCount: 1, combo: true, type: 1 },
    { id: '5487', name: 'Finger Heart', diamondCount: 5, combo: true, type: 1 },
    { id: '8913', name: 'Rosa', diamondCount: 10, combo: true, type: 1 },
    { id: '5658', name: 'Perfume', diamondCount: 20, combo: true, type: 1 },
    { id: '5879', name: 'Doughnut', diamondCount: 30, combo: true, type: 1 },
    { id: '6104', name: 'Cap', diamondCount: 99, combo: true, type: 1 },
    { id: '5660', name: 'Hand Hearts', diamondCount: 100, combo: true, type: 1 },
    { id: '6267', name: 'Corgi', diamondCount: 299, combo: true, type: 1 },
    { id: '7168', name: 'Money Gun', diamondCount: 500, combo: true, type: 1 },
    { id: '11046', name: 'Galaxy', diamondCount: 1000, combo: true, type: 1 },
    { id: '6369', name: 'Lion', diamondCount: 29999, combo: false, type: 2 },
    { id: '9101', name: 'TikTok Universe', diamondCount: 44999, combo: false, type: 2 }
  ];

  for (const item of builtinFallback) {
    const entry: GiftCatalogEntry = {
      id: String(item.id),
      name: item.name,
      diamondCount: item.diamondCount,
      combo: Boolean(item.combo ?? true),
      type: Number(item.type ?? 1),
      image: item.image || ''
    };
    giftCatalogById.set(entry.id, entry);
    giftCatalogByName.set(entry.name.toLowerCase(), entry);
  }

  try {
    const catalogPath = path.join(__dirname, 'src', 'data', 'tiktokGiftCatalog.json');
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const g of list) {
          const entry: GiftCatalogEntry = {
            id: String(g.id),
            name: String(g.name || 'Gift'),
            diamondCount: Math.max(1, Number(g.diamondCount || g.diamond_count || 1)),
            combo: Boolean(g.combo),
            type: Number(g.type || 0),
            image: g.image?.url_list?.[0] || g.image?.urlList?.[0] || g.icon?.url_list?.[0] || g.icon?.urlList?.[0] || (typeof g.image === 'string' ? g.image : '')
          };
          giftCatalogById.set(entry.id, entry);
          if (entry.name) {
            giftCatalogByName.set(entry.name.trim().toLowerCase(), entry);
          }
        }
        console.log(`[GiftCatalog] Initialized ${giftCatalogById.size} TikTok gifts with exact coin values`);
      }
    }
  } catch (err) {
    console.warn('[GiftCatalog] Failed to load tiktokGiftCatalog.json:', err);
  }
}

initializeGiftCatalog();

async function refreshRoomGiftCatalog(conn: any, roomId?: string) {
  try {
    const targetRoomId = roomId && roomId !== 'active_room' ? String(roomId) : '7300000000000000000';
    const res = await conn.webClient.getJsonObjectFromWebcastApi(
      'gift/list/',
      {
        ...conn.webClient.clientParams,
        room_id: targetRoomId
      },
      false // Unsigned request (100% free, avoids Euler Business plan requirement)
    );
    const gifts = res?.data?.gifts;
    if (Array.isArray(gifts)) {
      for (const g of gifts) {
        const entry: GiftCatalogEntry = {
          id: String(g.id),
          name: String(g.name || 'Gift'),
          diamondCount: Math.max(1, Number(g.diamond_count || g.diamondCount || 1)),
          combo: Boolean(g.combo),
          type: Number(g.type || 0),
          image: g.image?.url_list?.[0] || g.image?.urlList?.[0] || g.icon?.url_list?.[0] || g.icon?.urlList?.[0] || (typeof g.image === 'string' ? g.image : '')
        };
        giftCatalogById.set(entry.id, entry);
        if (entry.name) {
          giftCatalogByName.set(entry.name.trim().toLowerCase(), entry);
        }
      }
      console.log(`[GiftCatalog] Synced ${gifts.length} room gifts (Total catalog size: ${giftCatalogById.size})`);
    }
  } catch (err: any) {
    console.warn('[GiftCatalog] Room gift sync warning:', err?.message || err);
  }
}

function isValidId(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  const str = String(val).trim();
  return str !== '' && str !== '0' && str !== 'undefined' && str !== 'null' && str !== 'anonymous';
}

function extractTikTokUser(data: any) {
  const idCandidates = [
    data.userId,
    data.user?.idStr,
    data.user?.id,
    data.user?.displayId,
    data.user?.uniqueId,
    data.uniqueId,
    data.user?.secUid,
    data.secUid
  ];

  const validRawId = idCandidates.find(isValidId);

  const uniqueIdCandidate = [
    data.uniqueId,
    data.user?.displayId,
    data.user?.uniqueId
  ].find(isValidId);

  const rawNickname = [
    data.nickname,
    data.user?.nickname,
    uniqueIdCandidate
  ].find((n) => typeof n === 'string' && n.trim() !== '' && n.trim() !== '0');

  const nickname = rawNickname ? String(rawNickname).trim() : 'Mystery Gifter';

  const userId = validRawId
    ? String(validRawId).trim()
    : rawNickname
    ? `nick_${String(rawNickname).trim().toLowerCase()}`
    : `anon_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const profilePictureUrl =
    data.profilePictureUrl ||
    data.user?.avatarThumb?.urlList?.[0] ||
    data.user?.avatarMedium?.urlList?.[0] ||
    data.user?.avatarLarge?.urlList?.[0] ||
    data.user?.profilePictureUrls?.[0] ||
    data.userDetails?.profilePictureUrls?.[0] ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`;

  return {
    userId,
    uniqueId: uniqueIdCandidate ? String(uniqueIdCandidate).trim() : '',
    nickname,
    profilePictureUrl
  };
}

let rateLimitedUntil = 0;

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

async function startTikTok(username: string) {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (tiktokConnection) {
    try {
      tiktokConnection.disconnect();
    } catch (e) {
      // ignore
    }
    tiktokConnection = null;
  }

  if (!username || !username.trim()) return;

  const cleanUsername = username.trim().replace(/^@/, '');
  currentTikTokUsername = cleanUsername;

  // If currently in sign-server rate-limit cooldown, wait until cooldown expires before making new sign requests
  const now = Date.now();
  if (now < rateLimitedUntil) {
    const waitMs = rateLimitedUntil - now + 2000;
    const minsLeft = Math.max(1, Math.ceil(waitMs / 60000));
    connectionStatus = 'disconnected';
    lastError = `TikTok sign server cooldown active (~${minsLeft}m left). Auto-reconnecting when ready.`;
    broadcast({
      type: 'TIKTOK_STATUS',
      status: connectionStatus,
      username: cleanUsername,
      error: lastError
    });
    scheduleReconnect(waitMs);
    return;
  }

  connectionStatus = 'connecting';
  lastError = null;

  broadcast({
    type: 'TIKTOK_STATUS',
    status: connectionStatus,
    username: cleanUsername,
    error: null
  });

  try {
    const conn = new TikTokLiveConnection(cleanUsername, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      fetchRoomInfoOnConnect: true
    });
    tiktokConnection = conn;

    // Step 1: Check room ID and live status via TikTok's free unsigned endpoints first
    // so we NEVER consume Euler Stream rate-limit quota if the streamer is offline!
    let roomId = '';
    try {
      roomId = await conn.fetchRoomId();
      const roomInfo = await conn.fetchRoomInfo(roomId);
      const roomStatus = roomInfo?.data?.status;
      if (roomStatus === 4) {
        console.log(`[TikTok] @${cleanUsername} is currently offline (room status 4). Waiting 30s before next check.`);
        connectionStatus = 'disconnected';
        lastError = `@${cleanUsername} is currently offline on TikTok LIVE. Waiting for stream to start...`;
        broadcast({
          type: 'TIKTOK_STATUS',
          status: 'disconnected',
          username: cleanUsername,
          error: lastError
        });
        scheduleReconnect(30000);
        return;
      }
    } catch (preCheckErr: any) {
      const preMsg = preCheckErr?.message || String(preCheckErr);
      if (preMsg.includes("isn't online") || preMsg.includes('Failed to retrieve Room ID')) {
        console.log(`[TikTok] @${cleanUsername} is not live right now. Will re-check in 30s.`);
        connectionStatus = 'disconnected';
        lastError = `@${cleanUsername} is not currently live on TikTok. Waiting for stream to start...`;
        broadcast({
          type: 'TIKTOK_STATUS',
          status: 'disconnected',
          username: cleanUsername,
          error: lastError
        });
        scheduleReconnect(30000);
        return;
      }
    }

    conn.on(ControlEvent.DISCONNECTED, () => {
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
      scheduleReconnect(15000);
    });

    conn.on(WebcastEvent.STREAM_END, () => {
      console.log(`[TikTok] Live stream ended for @${cleanUsername}`);
      connectionStatus = 'disconnected';
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'ended',
        username: cleanUsername,
        error: 'Stream has ended'
      });
    });

    conn.on(ControlEvent.ERROR, (err: any) => {
      const retryAfter = Number(err?.retryAfter || err?.exception?.retryAfter || 0);
      if (retryAfter > 0 || err?.exception?.name === 'SignatureRateLimitError') {
        // Handled cleanly by connect().catch() below without duplicate console.error spam
        return;
      }
      const errorMsg = err?.message || err?.info || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      if (
        errorMsg.includes('eulerstream') ||
        errorMsg.includes('Failed to fetch room gifts') ||
        errorMsg.includes('Rate Limited') ||
        errorMsg.includes('Error while connecting')
      ) {
        return;
      }
      console.warn('[TikTok] Connector notice:', errorMsg);
    });

    // Handle Gift events with strict streak protection (Rule 7)
    conn.on(WebcastEvent.GIFT, (data: any) => {
      handleIncomingGift(data);
    });

    // Handle Like events (Rule: 100 heart likes = -1 HP from challengers, +1 HP from current defender)
    conn.on(WebcastEvent.LIKE, (data: any) => {
      handleIncomingLike(data);
    });

    // Step 2: Connect to the active live stream WebSocket
    conn.connect(roomId || undefined).then((state: any) => {
      connectionStatus = 'connected';
      lastError = null;
      reconnectAttempts = 0;
      const connectedRoomId = state?.roomId || state?.roomInfo?.roomId || roomId || 'active_room';
      console.log(`[TikTok] Successfully connected to room ID: ${connectedRoomId} for user @${cleanUsername}`);
      refreshRoomGiftCatalog(conn, String(connectedRoomId));
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'connected',
        username: cleanUsername,
        roomId: connectedRoomId,
        error: null
      });
    }).catch((err: any) => {
      const retryAfterMs = Number(err?.retryAfter || err?.exception?.retryAfter || 0);
      const rawMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));

      if (retryAfterMs > 0 || err?.name === 'SignatureRateLimitError' || rawMsg.includes('Rate Limited')) {
        const cooldownMs = Math.max(retryAfterMs || 300000, 60000);
        rateLimitedUntil = Date.now() + cooldownMs;
        const mins = Math.max(1, Math.ceil(cooldownMs / 60000));
        const friendlyMsg = `TikTok sign server rate limit reached. Cooldown ~${mins} min(s) before auto-reconnect.`;
        console.log(`[TikTok] Rate limit cooldown for @${cleanUsername}: waiting ${ Math.round(cooldownMs / 1000) }s before next attempt.`);
        connectionStatus = 'disconnected';
        lastError = friendlyMsg;
        broadcast({
          type: 'TIKTOK_STATUS',
          status: 'disconnected',
          username: cleanUsername,
          error: friendlyMsg
        });
        scheduleReconnect(cooldownMs + 2000);
        return;
      }

      if (rawMsg.includes("isn't online") || err?.name === 'UserOfflineError') {
        console.log(`[TikTok] @${cleanUsername} is currently offline.`);
        connectionStatus = 'disconnected';
        lastError = `@${cleanUsername} is currently offline on TikTok LIVE.`;
        broadcast({
          type: 'TIKTOK_STATUS',
          status: 'disconnected',
          username: cleanUsername,
          error: lastError
        });
        scheduleReconnect(30000);
        return;
      }

      console.warn(`[TikTok] Connection notice for @${cleanUsername}:`, rawMsg);
      connectionStatus = 'error';
      lastError = rawMsg;
      broadcast({
        type: 'TIKTOK_STATUS',
        status: 'error',
        username: cleanUsername,
        error: lastError
      });
      scheduleReconnect();
    });

  } catch (err: any) {
    console.warn('[TikTok] Initialization notice:', err?.message || err);
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

function scheduleReconnect(customDelayMs?: number) {
  if (reconnectTimer || !currentTikTokUsername) return;
  if (!customDelayMs && reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[TikTok] Max reconnect attempts reached. Waiting for user action.');
    return;
  }
  if (!customDelayMs) {
    reconnectAttempts++;
  }
  const delay = customDelayMs ?? Math.min(10000 * Math.pow(1.5, reconnectAttempts - 1), 60000);
  console.log(`[TikTok] Scheduling next check in ${Math.round(delay / 1000)}s...`);
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
    const msgId = data.common?.msgId || data.logId || data.orderId;
    if (isValidId(msgId)) {
      const msgKey = String(msgId);
      if (processedMsgIds.has(msgKey)) {
        return;
      }
      processedMsgIds.add(msgKey);
      if (processedMsgIds.size > 500) {
        const firstKey = processedMsgIds.values().next().value;
        if (firstKey) processedMsgIds.delete(firstKey);
      }
    }

    const { userId, nickname, profilePictureUrl } = extractTikTokUser(data);

    const rawGiftId = [data.giftId, data.gift?.id, data.extendedGiftInfo?.id].find(isValidId);
    const giftId = rawGiftId ? String(rawGiftId).trim() : 'gift';

    const catalogById = giftCatalogById.get(giftId);

    const rawNameCandidates = [
      data.giftName,
      data.gift?.name,
      data.extendedGiftInfo?.name,
      data.giftDetails?.giftName,
      catalogById?.name,
      data.gift?.describe
    ];
    let giftName = rawNameCandidates.find(
      (n) => typeof n === 'string' && n.trim() !== '' && n.trim() !== 'Gift'
    );

    const catalogByName = giftName
      ? giftCatalogByName.get(String(giftName).trim().toLowerCase())
      : undefined;

    if (!giftName && catalogByName?.name) {
      giftName = catalogByName.name;
    }

    const repeatCount = Math.max(
      1,
      Number(data.repeatCount || data.comboCount || data.repeat_count || 1)
    );

    const fanTicketUnitCoins =
      data.fanTicketCount && Number(data.fanTicketCount) > 0
        ? Math.max(1, Math.round(Number(data.fanTicketCount) / repeatCount))
        : 0;

    const diamondCandidates = [
      Number(catalogById?.diamondCount || 0),
      Number(catalogByName?.diamondCount || 0),
      Number(data.diamondCount || 0),
      Number(data.gift?.diamondCount || 0),
      Number(data.gift?.diamond_count || 0),
      Number(data.extendedGiftInfo?.diamond_count || 0),
      Number(data.extendedGiftInfo?.diamondCount || 0),
      Number(data.giftDetails?.diamondCount || 0),
      Number(data.diamonds || 0),
      fanTicketUnitCoins
    ].filter((n) => Number.isFinite(n) && n > 0);

    // Prefer non-trivial (> 1) value if a fallback field defaulted to 1 while catalog has real coin cost
    const nonTrivialCoins = diamondCandidates.find((n) => n > 1);
    const diamondCount = nonTrivialCoins || diamondCandidates[0] || 1;

    const repeatEnd = Boolean(
      data.repeatEnd === 1 ||
      data.repeatEnd === true ||
      data.repeat_end === 1 ||
      data.gift?.repeat_end === 1
    );

    const isStreakGift = Boolean(
      data.gift?.type === 1 ||
      data.gift?.combo === true ||
      data.giftType === 1 ||
      data.extendedGiftInfo?.type === 1 ||
      catalogById?.type === 1 ||
      catalogById?.combo === true ||
      catalogByName?.type === 1 ||
      catalogByName?.combo === true ||
      (data.repeatEnd !== undefined && !repeatEnd)
    );

    if (!giftName || giftName === 'Gift') {
      if (catalogById?.name) giftName = catalogById.name;
      else if (diamondCount === 1) giftName = 'Rose';
      else if (diamondCount === 5) giftName = 'Finger Heart';
      else if (diamondCount === 10) giftName = 'Rosa';
      else if (diamondCount === 20) giftName = 'Perfume';
      else if (diamondCount === 30) giftName = 'Doughnut';
      else if (diamondCount === 99) giftName = 'Cap';
      else if (diamondCount === 100) giftName = 'Hand Hearts';
      else if (diamondCount === 299) giftName = 'Corgi';
      else if (diamondCount === 500) giftName = 'Money Gun';
      else if (diamondCount === 1000) giftName = 'Galaxy';
      else if (diamondCount === 29999) giftName = 'Lion';
      else if (diamondCount === 44999) giftName = 'TikTok Universe';
      else giftName = `Gift (${diamondCount} coins)`;
    }

    const groupId = isValidId(data.groupId) ? String(data.groupId) : '';
    const streakKey = groupId ? `${userId}_${giftId}_${groupId}` : `${userId}_${giftId}`;

    // Prune old completed streaks (> 30s)
    const now = Date.now();
    for (const [k, v] of completedStreaks.entries()) {
      if (now - v.timestamp > 30000) {
        completedStreaks.delete(k);
      }
    }

    // Check if this exact streak was already finalized and dispatched
    const completed = completedStreaks.get(streakKey);
    if (completed && now - completed.timestamp < 15000 && repeatCount <= completed.repeatCount) {
      return;
    }

    // If it's a non-streak gift or the streak is officially finalized:
    if (!isStreakGift || repeatEnd) {
      if (pendingStreaks.has(streakKey)) {
        clearTimeout(pendingStreaks.get(streakKey)!.timer);
        pendingStreaks.delete(streakKey);
      }

      completedStreaks.set(streakKey, { repeatCount, timestamp: now });

      const giftPictureUrl =
        data.giftPictureUrl ||
        data.gift?.image?.urlList?.[0] ||
        data.gift?.icon?.urlList?.[0] ||
        data.extendedGiftInfo?.image?.urlList?.[0] ||
        data.giftDetails?.giftImage?.urlList?.[0] ||
        data.gift?.image?.url_list?.[0] ||
        data.gift?.icon?.url_list?.[0] ||
        catalogById?.image ||
        '';

      const totalCoins = diamondCount * repeatCount;
      dispatchGiftEvent({
        eventId: `gift_${streakKey}_${repeatCount}_${now}`,
        streakKey,
        userId,
        nickname,
        profilePictureUrl,
        giftName,
        giftPictureUrl,
        giftId: String(giftId),
        diamondCount,
        repeatCount,
        coins: totalCoins,
        timestamp: now
      });
      return;
    }

    // For in-progress streak gifts (repeatEnd === 0):
    // Wait for TikTok's combo ring to finish (up to 4500ms after last tap) so we only count once!
    if (pendingStreaks.has(streakKey)) {
      clearTimeout(pendingStreaks.get(streakKey)!.timer);
    }

    const timer = setTimeout(() => {
      const pending = pendingStreaks.get(streakKey);
      if (pending) {
        pendingStreaks.delete(streakKey);
        const pData = pending.lastData;
        const finalRepeat = Math.max(1, Number(pData.repeatCount || 1));
        const finalDiamond = Math.max(1, Number(pData.diamondCount || 1));

        // Double check it wasn't already dispatched by repeatEnd
        const alreadyDone = completedStreaks.get(streakKey);
        if (alreadyDone && Date.now() - alreadyDone.timestamp < 15000 && finalRepeat <= alreadyDone.repeatCount) {
          return;
        }

        completedStreaks.set(streakKey, { repeatCount: finalRepeat, timestamp: Date.now() });

        const totalCoins = finalDiamond * finalRepeat;
        const giftPictureUrl =
          pData.giftPictureUrl ||
          pData.gift?.image?.urlList?.[0] ||
          pData.gift?.icon?.urlList?.[0] ||
          pData.extendedGiftInfo?.image?.urlList?.[0] ||
          pData.giftDetails?.giftImage?.urlList?.[0] ||
          catalogById?.image ||
          '';

        dispatchGiftEvent({
          eventId: `gift_${streakKey}_${finalRepeat}_${Date.now()}`,
          streakKey,
          userId,
          nickname,
          profilePictureUrl,
          giftName,
          giftPictureUrl,
          giftId: String(giftId),
          diamondCount: finalDiamond,
          repeatCount: finalRepeat,
          coins: totalCoins,
          timestamp: Date.now()
        });
      }
    }, 4500);

    pendingStreaks.set(streakKey, {
      timer,
      lastData: { diamondCount, repeatCount }
    });

  } catch (err) {
    console.error('[TikTok] Error handling gift event:', err);
  }
}

function dispatchGiftEvent(giftData: any) {
  let giftPictureUrl = giftData.giftPictureUrl || '';
  if (!giftPictureUrl) {
    const nameKey = String(giftData.giftName || '').trim().toLowerCase();
    const catalogEntry = giftCatalogByName.get(nameKey) || (giftData.giftId ? giftCatalogById.get(String(giftData.giftId)) : undefined);
    if (catalogEntry?.image) {
      giftPictureUrl = catalogEntry.image;
    }
  }

  const payload = {
    ...giftData,
    giftPictureUrl,
    eventId: giftData.eventId || `gift_${giftData.userId || 'user'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  };
  console.log(`[Gift] ${payload.nickname} (${payload.userId}) sent ${payload.repeatCount}x ${payload.giftName} (${payload.coins} coins)`);
  broadcast({
    type: 'GIFT_EVENT',
    data: payload
  });
}

function handleIncomingLike(data: any) {
  try {
    const msgId = data.common?.msgId;
    if (isValidId(msgId)) {
      const msgKey = `like_${msgId}`;
      if (processedMsgIds.has(msgKey)) {
        return;
      }
      processedMsgIds.add(msgKey);
    }

    const { userId, nickname, profilePictureUrl } = extractTikTokUser(data);
    const likeCount = Math.max(1, Number(data.likeCount || data.count || 1));
    const totalLikes = Number(data.totalLikeCount || data.total || 0);

    dispatchLikeEvent({
      eventId: `like_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      nickname,
      profilePictureUrl,
      likeCount,
      totalLikes,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[TikTok] Error handling like event:', err);
  }
}

function dispatchLikeEvent(likeData: any) {
  const payload = {
    ...likeData,
    eventId: likeData.eventId || `like_${likeData.userId || 'user'}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
  };
  broadcast({
    type: 'LIKE_EVENT',
    data: payload
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
    eventId: `test_gift_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
  const nickname = req.body.nickname || 'HeartChallenger';
  const likeData = {
    eventId: `test_like_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: req.body.userId || `liker_${nickname.toLowerCase()}`,
    nickname,
    profilePictureUrl: req.body.profilePictureUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`,
    likeCount: Number(req.body.likeCount || 100),
    totalLikes: Number(req.body.totalLikes || 100),
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
        // Broadcast sync ONLY to other browser windows (e.g. OBS window receiving state from Control Panel)
        broadcast(
          {
            type: 'SYNCED_GAME_STATE',
            state: parsed.state
          },
          ws
        );
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
