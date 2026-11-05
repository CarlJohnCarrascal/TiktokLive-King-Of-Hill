/**
 * =========================================================================
 * 👑 KING OF THE HILL - HP RULES & GAME LOGIC ENGINE
 * =========================================================================
 *
 * Welcome streamer / developer!
 * All King of the Hill game mechanics, combat math, and stage rules are
 * defined right here in this clearly labeled file.
 *
 * CORE RULES OVERVIEW:
 * 1. HP Value:
 *    Calculated from gift coins * hpMultiplier (e.g., 1 Rose = 1 coin = 1 HP).
 * 2. Stage Empty:
 *    First gifter claims the crown immediately with starting HP = their gift value.
 * 3. Attack (Challengers):
 *    - Any gift from a different viewer deals damage equal to its coin value.
 *    - Every 100 heart likes from other viewers decreases the Defender's HP by 1 (-1 HP).
 * 4. Knockout & Takeover:
 *    When HP <= 0, the current Defender is knocked out.
 *    The attacker takes the stage, and leftover damage becomes their starting HP!
 *    (Zero wasted coins). If leftover is 0, a safe minimum HP is granted.
 * 5. Heal (Current Defender Only):
 *    ONLY if the current Defender sends a gift OR sends 100 heart likes will it
 *    increase (heal) her own HP (capped at MAX_HP).
 * 6. Decay (Optional):
 *    Slowly drains HP over time to keep the stream dynamic when chat is quiet.
 * 7. Anti-Streak Double Counting & Gift Deduplication:
 *    Gifts are processed on final streak completion and deduplicated by eventId/streakKey
 *    so the Last 5 Gifts list never duplicates a single gift.
 */

export interface GameConfig {
  tiktokUsername: string;
  hpMultiplier: number;
  maxHp: number;
  minStartingHp: number;
  enableDecay: boolean;
  decayAmount: number;
  decayIntervalSeconds: number;
  soundEnabled: boolean;
  soundVolume: number;
  theme: string;
  orientation: 'landscape' | 'portrait';
  likesPerHp: number; // Default 100: every 100 heart likes = -1 HP (attackers) or +1 HP (current defender)
}

export interface King {
  userId: string;
  nickname: string;
  profilePictureUrl: string;
  currentHp: number;
  maxHp: number;
  startingHp: number;
  reignStartedAt: number;
  knockouts: number;
  winStreak: number;
  totalDamageTaken: number;
  totalHealed: number;
  likesGainedHp: number;
  crownTier: 'bronze' | 'silver' | 'gold' | 'diamond';
}

export interface AttackerRecord {
  id: string;
  eventId?: string;
  streakKey?: string;
  userId: string;
  nickname: string;
  profilePictureUrl: string;
  giftName: string;
  diamondCount: number;
  repeatCount: number;
  coins: number;
  hpEffect: number;
  isHeal: boolean;
  isKo: boolean;
  timestamp: number;
}

export interface LeaderboardStats {
  userId: string;
  nickname: string;
  profilePictureUrl: string;
  knockouts: number;
  longestReignSeconds: number;
  totalCoins: number;
}

export interface GameState {
  currentKing: King | null;
  currentWinStreak: number;
  userWinStreaks: Record<string, number>;
  lastAttackers: AttackerRecord[];
  leaderboard: {
    mostKnockouts: LeaderboardStats[];
    longestReigns: LeaderboardStats[];
  };
  totalBattles: number;
  totalGiftsReceived: number;
  totalCoinsContributed: number;
  likesPool: number; // Challenger likes accumulated toward next -1 HP attack (0 to 99)
  defenderLikesPool: number; // Current Defender's own likes accumulated toward next +1 HP heal (0 to 99)
  totalRoomLikes: number; // Lifetime room heart likes
  processedEventIds: string[]; // Recent processed eventIds to prevent duplicate gifts/likes
  lastEventTimestamp: number;
}

export type CombatEventType = 'FIRST_KING' | 'HEAL' | 'HIT' | 'TAKEOVER' | 'DUPLICATE';

export interface CombatResult {
  eventType: CombatEventType;
  damageDealt: number;
  healedAmount: number;
  leftoverHp: number;
  defeatedKing: King | null;
  newKing: King | null;
  gift: {
    userId: string;
    nickname: string;
    profilePictureUrl: string;
    giftName: string;
    coins: number;
    repeatCount: number;
  };
}

export const initialGameState: GameState = {
  currentKing: null,
  currentWinStreak: 0,
  userWinStreaks: {},
  lastAttackers: [],
  leaderboard: {
    mostKnockouts: [],
    longestReigns: []
  },
  totalBattles: 0,
  totalGiftsReceived: 0,
  totalCoinsContributed: 0,
  likesPool: 0,
  defenderLikesPool: 0,
  totalRoomLikes: 0,
  processedEventIds: [],
  lastEventTimestamp: Date.now()
};

const GENERIC_NAMES = new Set([
  'mystery gifter',
  'viewer',
  'anonymous',
  'testgifter',
  'heartgiver',
  'heartchallenger',
  ''
]);

/**
 * Strictly checks if an incoming Gift or Like belongs to the Current Defender (King).
 * Ignores protobuf default '0' IDs so other viewers are NEVER mistaken for the Defender.
 */
export function isSameUserAsKing(
  king: King | null,
  actor: { userId?: string; nickname?: string }
): boolean {
  if (!king) return false;

  const kingId = (king.userId || '').trim();
  const actorId = (actor.userId || '').trim();

  const isRealId = (id: string) =>
    id !== '' &&
    id !== '0' &&
    id !== 'anonymous' &&
    !id.startsWith('anon_') &&
    !id.startsWith('custom_') &&
    !id.startsWith('liker_');

  if (kingId && actorId && kingId !== '0' && actorId !== '0' && kingId === actorId) {
    return true;
  }

  // If both have distinct real TikTok user IDs, they are definitely different users
  if (isRealId(kingId) && isRealId(actorId) && kingId !== actorId) {
    return false;
  }

  // Fallback to nickname match only if nickname is specific (not generic placeholder)
  const kingNick = (king.nickname || '').trim().toLowerCase();
  const actorNick = (actor.nickname || '').trim().toLowerCase();

  if (kingNick && actorNick && !GENERIC_NAMES.has(kingNick) && !GENERIC_NAMES.has(actorNick)) {
    return kingNick === actorNick;
  }

  return false;
}

/**
 * Determine crown tier based on number of knockouts defended
 */
export function calculateCrownTier(knockouts: number): 'bronze' | 'silver' | 'gold' | 'diamond' {
  if (knockouts >= 15) return 'diamond';
  if (knockouts >= 8) return 'gold';
  if (knockouts >= 3) return 'silver';
  return 'bronze';
}

/**
 * Helper to insert an AttackerRecord into Last 5 Gifts without duplicates
 */
function upsertLastAttackers(
  currentList: AttackerRecord[],
  newRecord: AttackerRecord
): AttackerRecord[] {
  const now = newRecord.timestamp || Date.now();
  const filtered = currentList.filter((item) => {
    if (newRecord.eventId && item.eventId && item.eventId === newRecord.eventId) {
      return false;
    }
    if (
      newRecord.streakKey &&
      item.streakKey &&
      item.streakKey === newRecord.streakKey &&
      now - item.timestamp < 15000
    ) {
      return false;
    }
    return true;
  });

  return [newRecord, ...filtered].slice(0, 25);
}

/**
 * =========================================================================
 * CORE COMBAT LOGIC (GIFTS)
 * =========================================================================
 */
export function processGiftAction(
  currentState: GameState,
  gift: {
    eventId?: string;
    streakKey?: string;
    userId: string;
    nickname: string;
    profilePictureUrl: string;
    giftName: string;
    diamondCount: number;
    repeatCount: number;
    coins: number;
  },
  config: GameConfig
): { nextState: GameState; result: CombatResult } {
  const now = Date.now();
  const prevProcessed = currentState.processedEventIds || [];

  // Deduplicate by eventId so the same gift is never processed more than once
  if (gift.eventId && prevProcessed.includes(gift.eventId)) {
    return {
      nextState: currentState,
      result: {
        eventType: 'DUPLICATE',
        damageDealt: 0,
        healedAmount: 0,
        leftoverHp: 0,
        defeatedKing: null,
        newKing: null,
        gift: {
          userId: gift.userId,
          nickname: gift.nickname,
          profilePictureUrl: gift.profilePictureUrl,
          giftName: gift.giftName,
          coins: gift.coins,
          repeatCount: gift.repeatCount
        }
      }
    };
  }

  // Also guard against duplicate streak packets arriving within 2 seconds for the exact same streakKey & repeatCount
  const latestAttacker = currentState.lastAttackers[0];
  if (
    latestAttacker &&
    gift.streakKey &&
    latestAttacker.streakKey === gift.streakKey &&
    latestAttacker.repeatCount === gift.repeatCount &&
    now - latestAttacker.timestamp < 10000
  ) {
    return {
      nextState: currentState,
      result: {
        eventType: 'DUPLICATE',
        damageDealt: 0,
        healedAmount: 0,
        leftoverHp: 0,
        defeatedKing: null,
        newKing: null,
        gift: {
          userId: gift.userId,
          nickname: gift.nickname,
          profilePictureUrl: gift.profilePictureUrl,
          giftName: gift.giftName,
          coins: gift.coins,
          repeatCount: gift.repeatCount
        }
      }
    };
  }

  const nextProcessedIds = gift.eventId
    ? [...prevProcessed.slice(-60), gift.eventId]
    : prevProcessed;

  // 1. Calculate HP value based on coins and multiplier
  const multiplier = Math.max(0.1, config.hpMultiplier || 1);
  const hpValue = Math.max(1, Math.round(gift.coins * multiplier));
  const maxHp = Math.max(100, config.maxHp || 50000);
  const minStartingHp = Math.max(1, config.minStartingHp || 10);

  const updatedTotalGifts = currentState.totalGiftsReceived + 1;
  const updatedTotalCoins = currentState.totalCoinsContributed + gift.coins;

  // RULE 2: If nobody is on stage, the first gifter becomes the Defender (King)!
  if (!currentState.currentKing) {
    const startingHp = Math.min(Math.max(hpValue, minStartingHp), maxHp);
    const existingStreak = (currentState.userWinStreaks || {})[gift.userId] || 0;
    const newKing: King = {
      userId: gift.userId,
      nickname: gift.nickname,
      profilePictureUrl: gift.profilePictureUrl,
      currentHp: startingHp,
      maxHp: startingHp,
      startingHp,
      reignStartedAt: now,
      knockouts: existingStreak,
      winStreak: existingStreak,
      totalDamageTaken: 0,
      totalHealed: 0,
      likesGainedHp: 0,
      crownTier: calculateCrownTier(existingStreak)
    };

    const attackerRecord: AttackerRecord = {
      id: `attack_${now}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: gift.eventId,
      streakKey: gift.streakKey,
      userId: gift.userId,
      nickname: gift.nickname,
      profilePictureUrl: gift.profilePictureUrl,
      giftName: gift.giftName,
      diamondCount: gift.diamondCount,
      repeatCount: gift.repeatCount,
      coins: gift.coins,
      hpEffect: startingHp,
      isHeal: false,
      isKo: false,
      timestamp: now
    };

    const nextState: GameState = {
      ...currentState,
      currentKing: newKing,
      currentWinStreak: existingStreak,
      lastAttackers: upsertLastAttackers(currentState.lastAttackers, attackerRecord),
      totalBattles: currentState.totalBattles + 1,
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      likesPool: 0,
      defenderLikesPool: 0,
      processedEventIds: nextProcessedIds,
      lastEventTimestamp: now
    };

    return {
      nextState,
      result: {
        eventType: 'FIRST_KING',
        damageDealt: 0,
        healedAmount: 0,
        leftoverHp: startingHp,
        defeatedKing: null,
        newKing,
        gift: {
          userId: gift.userId,
          nickname: gift.nickname,
          profilePictureUrl: gift.profilePictureUrl,
          giftName: gift.giftName,
          coins: gift.coins,
          repeatCount: gift.repeatCount
        }
      }
    };
  }

  const currentKing: King = {
    ...currentState.currentKing,
    winStreak: currentState.currentKing.winStreak ?? currentState.currentKing.knockouts ?? 0
  };

  // RULE 5: ONLY if the current Defender HERSELF sends another gift, it HEALS her!
  // Any other viewer's gift MUST ATTACK and subtract HP (deal damage).
  const isKingSendingGift = isSameUserAsKing(currentKing, gift);

  if (isKingSendingGift) {
    const oldHp = currentKing.currentHp;
    const newHp = Math.min(maxHp, oldHp + hpValue);
    const actualHealed = newHp - oldHp;

    currentKing.currentHp = newHp;
    currentKing.maxHp = Math.max(currentKing.maxHp, newHp);
    currentKing.totalHealed += actualHealed;

    const attackerRecord: AttackerRecord = {
      id: `heal_${now}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: gift.eventId,
      streakKey: gift.streakKey,
      userId: gift.userId,
      nickname: gift.nickname,
      profilePictureUrl: gift.profilePictureUrl,
      giftName: gift.giftName,
      diamondCount: gift.diamondCount,
      repeatCount: gift.repeatCount,
      coins: gift.coins,
      hpEffect: actualHealed,
      isHeal: true,
      isKo: false,
      timestamp: now
    };

    const nextState: GameState = {
      ...currentState,
      currentKing,
      currentWinStreak: currentKing.winStreak,
      lastAttackers: upsertLastAttackers(currentState.lastAttackers, attackerRecord),
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      processedEventIds: nextProcessedIds,
      lastEventTimestamp: now
    };

    return {
      nextState,
      result: {
        eventType: 'HEAL',
        damageDealt: 0,
        healedAmount: actualHealed,
        leftoverHp: 0,
        defeatedKing: null,
        newKing: currentKing,
        gift: {
          userId: gift.userId,
          nickname: gift.nickname,
          profilePictureUrl: gift.profilePictureUrl,
          giftName: gift.giftName,
          coins: gift.coins,
          repeatCount: gift.repeatCount
        }
      }
    };
  }

  // RULE 3 & 4: Different user sends a gift (ATTACK - decreases Defender's health)
  const damageDealt = hpValue;
  const remainingHp = currentKing.currentHp - damageDealt;

  // Case A: Defender survives and knocks back the challenger's attack!
  if (remainingHp > 0) {
    const updatedStreak = (currentKing.winStreak || 0) + 1;
    currentKing.currentHp = remainingHp;
    currentKing.totalDamageTaken += damageDealt;
    currentKing.knockouts = updatedStreak;
    currentKing.winStreak = updatedStreak;
    currentKing.crownTier = calculateCrownTier(updatedStreak);

    const updatedUserStreaks: Record<string, number> = {
      ...(currentState.userWinStreaks || {}),
      [currentKing.userId]: updatedStreak,
      [gift.userId]: 0
    };

    const attackerRecord: AttackerRecord = {
      id: `hit_${now}_${Math.random().toString(36).substring(2, 7)}`,
      eventId: gift.eventId,
      streakKey: gift.streakKey,
      userId: gift.userId,
      nickname: gift.nickname,
      profilePictureUrl: gift.profilePictureUrl,
      giftName: gift.giftName,
      diamondCount: gift.diamondCount,
      repeatCount: gift.repeatCount,
      coins: gift.coins,
      hpEffect: -damageDealt,
      isHeal: false,
      isKo: false,
      timestamp: now
    };

    const nextState: GameState = {
      ...currentState,
      currentKing,
      currentWinStreak: updatedStreak,
      userWinStreaks: updatedUserStreaks,
      lastAttackers: upsertLastAttackers(currentState.lastAttackers, attackerRecord),
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      processedEventIds: nextProcessedIds,
      lastEventTimestamp: now
    };

    return {
      nextState,
      result: {
        eventType: 'HIT',
        damageDealt,
        healedAmount: 0,
        leftoverHp: remainingHp,
        defeatedKing: null,
        newKing: null,
        gift: {
          userId: gift.userId,
          nickname: gift.nickname,
          profilePictureUrl: gift.profilePictureUrl,
          giftName: gift.giftName,
          coins: gift.coins,
          repeatCount: gift.repeatCount
        }
      }
    };
  }

  // Case B: KNOCKOUT & TAKEOVER! (remainingHp <= 0)
  // Leftover damage becomes the attacker's starting HP (no wasted gift value)
  const rawLeftover = Math.abs(remainingHp);
  const startingHp = Math.min(
    Math.max(rawLeftover > 0 ? rawLeftover : Math.max(1, Math.round(hpValue * 0.2)), minStartingHp),
    maxHp
  );

  // Defeated Defender stats finalized
  const reignDurationSeconds = Math.max(1, Math.round((now - currentKing.reignStartedAt) / 1000));
  const defeatedKing: King = {
    ...currentKing,
    currentHp: 0
  };

  // Update Leaderboards with defeated defender's reign
  const updatedLeaderboards = updateLeaderboards(
    currentState.leaderboard,
    defeatedKing,
    reignDurationSeconds
  );

  // Attacker scored a Knockout! Increment their consecutive KO streak and reset defeated King's streak
  const prevAttackerStreak = (currentState.userWinStreaks || {})[gift.userId] || 0;
  const newKingStreak = prevAttackerStreak + 1;
  const updatedUserStreaks: Record<string, number> = {
    ...(currentState.userWinStreaks || {}),
    [currentKing.userId]: 0,
    [gift.userId]: newKingStreak
  };

  // New Defender takes the stage!
  const newKing: King = {
    userId: gift.userId,
    nickname: gift.nickname,
    profilePictureUrl: gift.profilePictureUrl,
    currentHp: startingHp,
    maxHp: startingHp,
    startingHp,
    reignStartedAt: now,
    knockouts: newKingStreak,
    winStreak: newKingStreak,
    totalDamageTaken: 0,
    totalHealed: 0,
    likesGainedHp: 0,
    crownTier: calculateCrownTier(newKingStreak)
  };

  const attackerRecord: AttackerRecord = {
    id: `ko_${now}_${Math.random().toString(36).substring(2, 7)}`,
    eventId: gift.eventId,
    streakKey: gift.streakKey,
    userId: gift.userId,
    nickname: gift.nickname,
    profilePictureUrl: gift.profilePictureUrl,
    giftName: gift.giftName,
    diamondCount: gift.diamondCount,
    repeatCount: gift.repeatCount,
    coins: gift.coins,
    hpEffect: -damageDealt,
    isHeal: false,
    isKo: true,
    timestamp: now
  };

  const nextState: GameState = {
    ...currentState,
    currentKing: newKing,
    currentWinStreak: newKingStreak,
    userWinStreaks: updatedUserStreaks,
    lastAttackers: upsertLastAttackers(currentState.lastAttackers, attackerRecord),
    leaderboard: updatedLeaderboards,
    totalBattles: currentState.totalBattles + 1,
    totalGiftsReceived: updatedTotalGifts,
    totalCoinsContributed: updatedTotalCoins,
    likesPool: 0,
    defenderLikesPool: 0,
    processedEventIds: nextProcessedIds,
    lastEventTimestamp: now
  };

  return {
    nextState,
    result: {
      eventType: 'TAKEOVER',
      damageDealt,
      healedAmount: 0,
      leftoverHp: startingHp,
      defeatedKing,
      newKing,
      gift: {
        userId: gift.userId,
        nickname: gift.nickname,
        profilePictureUrl: gift.profilePictureUrl,
        giftName: gift.giftName,
        coins: gift.coins,
        repeatCount: gift.repeatCount
      }
    }
  };
}

/**
 * RULE 6: Slow HP decay over time (configurable, off by default)
 */
export function applyDecayTick(
  currentState: GameState,
  config: GameConfig
): { nextState: GameState; decayedAmount: number } {
  if (!config.enableDecay || !currentState.currentKing) {
    return { nextState: currentState, decayedAmount: 0 };
  }

  const king = { ...currentState.currentKing };
  // Preserve at least 1 HP so viewers have the thrill of landing the final hit!
  if (king.currentHp <= 1) {
    return { nextState: currentState, decayedAmount: 0 };
  }

  const decay = Math.max(1, config.decayAmount || 5);
  const newHp = Math.max(1, king.currentHp - decay);
  const actualLoss = king.currentHp - newHp;

  king.currentHp = newHp;

  return {
    nextState: {
      ...currentState,
      currentKing: king
    },
    decayedAmount: actualLoss
  };
}

/**
 * Leaderboard updates for knockouts and longest reign
 */
function updateLeaderboards(
  leaderboard: GameState['leaderboard'],
  defeatedKing: King,
  reignSeconds: number
): GameState['leaderboard'] {
  // Update Knockouts list
  const knockoutsList = [...leaderboard.mostKnockouts];
  const existingKoIndex = knockoutsList.findIndex(e => e.userId === defeatedKing.userId);

  if (existingKoIndex >= 0) {
    knockoutsList[existingKoIndex] = {
      ...knockoutsList[existingKoIndex],
      knockouts: Math.max(knockoutsList[existingKoIndex].knockouts, defeatedKing.knockouts),
      longestReignSeconds: Math.max(knockoutsList[existingKoIndex].longestReignSeconds, reignSeconds),
      nickname: defeatedKing.nickname,
      profilePictureUrl: defeatedKing.profilePictureUrl
    };
  } else if (defeatedKing.knockouts > 0) {
    knockoutsList.push({
      userId: defeatedKing.userId,
      nickname: defeatedKing.nickname,
      profilePictureUrl: defeatedKing.profilePictureUrl,
      knockouts: defeatedKing.knockouts,
      longestReignSeconds: reignSeconds,
      totalCoins: 0
    });
  }

  knockoutsList.sort((a, b) => b.knockouts - a.knockouts);

  // Update Longest Reigns list
  const reignsList = [...leaderboard.longestReigns];
  const existingReignIndex = reignsList.findIndex(e => e.userId === defeatedKing.userId);

  if (existingReignIndex >= 0) {
    reignsList[existingReignIndex] = {
      ...reignsList[existingReignIndex],
      longestReignSeconds: Math.max(reignsList[existingReignIndex].longestReignSeconds, reignSeconds),
      knockouts: Math.max(reignsList[existingReignIndex].knockouts, defeatedKing.knockouts),
      nickname: defeatedKing.nickname,
      profilePictureUrl: defeatedKing.profilePictureUrl
    };
  } else {
    reignsList.push({
      userId: defeatedKing.userId,
      nickname: defeatedKing.nickname,
      profilePictureUrl: defeatedKing.profilePictureUrl,
      longestReignSeconds: reignSeconds,
      knockouts: defeatedKing.knockouts,
      totalCoins: 0
    });
  }

  reignsList.sort((a, b) => b.longestReignSeconds - a.longestReignSeconds);

  return {
    mostKnockouts: knockoutsList.slice(0, 25),
    longestReigns: reignsList.slice(0, 25)
  };
}

/**
 * =========================================================================
 * HEART LIKES COMBAT LOGIC:
 * - Every 100 heart likes from OTHER viewers DECREASES the Defender's HP (-1 HP).
 * - ONLY the Current Defender's own 100 heart likes INCREASES her own HP (+1 HP).
 * =========================================================================
 */
export interface LikeActionResult {
  nextState: GameState;
  eventType: 'NONE' | 'LIKE_HIT' | 'LIKE_HEAL' | 'LIKE_TAKEOVER';
  hpDelta: number; // negative when decreasing defender HP, positive when healing defender
  damageDealt: number;
  healedAmount: number;
  defeatedKing: King | null;
  newKing: King | null;
  leftoverHp: number;
}

export function processLikeAction(
  currentState: GameState,
  likeData: {
    eventId?: string;
    userId?: string;
    nickname?: string;
    profilePictureUrl?: string;
    likeCount: number;
  },
  config: GameConfig
): LikeActionResult {
  const prevProcessed = currentState.processedEventIds || [];
  if (likeData.eventId && prevProcessed.includes(likeData.eventId)) {
    return {
      nextState: currentState,
      eventType: 'NONE',
      hpDelta: 0,
      damageDealt: 0,
      healedAmount: 0,
      defeatedKing: null,
      newKing: null,
      leftoverHp: 0
    };
  }

  const nextProcessedIds = likeData.eventId
    ? [...prevProcessed.slice(-60), likeData.eventId]
    : prevProcessed;

  const addedLikes = Math.max(1, Number(likeData.likeCount) || 1);
  const likesRequired = Math.max(1, config.likesPerHp || 100);
  const updatedTotalLikes = (currentState.totalRoomLikes || 0) + addedLikes;

  // If stage is empty, just record total likes
  if (!currentState.currentKing) {
    return {
      nextState: {
        ...currentState,
        totalRoomLikes: updatedTotalLikes,
        processedEventIds: nextProcessedIds
      },
      eventType: 'NONE',
      hpDelta: 0,
      damageDealt: 0,
      healedAmount: 0,
      defeatedKing: null,
      newKing: null,
      leftoverHp: 0
    };
  }

  const king = { ...currentState.currentKing };
  const maxHp = Math.max(100, config.maxHp || 50000);
  const minStartingHp = Math.max(1, config.minStartingHp || 10);

  // Check if the heart likes came from the Current Defender herself
  const isDefenderLiking = isSameUserAsKing(king, likeData);

  // CASE 1: Current Defender's own heart likes -> INCREASE (HEAL) her own HP (+1 HP per 100 likes)
  if (isDefenderLiking) {
    const totalDefenderPool = (currentState.defenderLikesPool || 0) + addedLikes;
    const hpToHeal = Math.floor(totalDefenderPool / likesRequired);
    const remainingDefenderPool = totalDefenderPool % likesRequired;

    if (hpToHeal > 0) {
      const oldHp = king.currentHp;
      const newHp = Math.min(maxHp, oldHp + hpToHeal);
      const actualHealed = newHp - oldHp;

      king.currentHp = newHp;
      king.maxHp = Math.max(king.maxHp, newHp);
      king.totalHealed += actualHealed;
      king.likesGainedHp = (king.likesGainedHp || 0) + actualHealed;

      return {
        nextState: {
          ...currentState,
          currentKing: king,
          defenderLikesPool: remainingDefenderPool,
          totalRoomLikes: updatedTotalLikes,
          processedEventIds: nextProcessedIds,
          lastEventTimestamp: Date.now()
        },
        eventType: 'LIKE_HEAL',
        hpDelta: actualHealed,
        damageDealt: 0,
        healedAmount: actualHealed,
        defeatedKing: null,
        newKing: king,
        leftoverHp: 0
      };
    }

    return {
      nextState: {
        ...currentState,
        defenderLikesPool: remainingDefenderPool,
        totalRoomLikes: updatedTotalLikes,
        processedEventIds: nextProcessedIds
      },
      eventType: 'NONE',
      hpDelta: 0,
      damageDealt: 0,
      healedAmount: 0,
      defeatedKing: null,
      newKing: null,
      leftoverHp: 0
    };
  }

  // CASE 2: Other viewers' (Challengers') heart likes -> DECREASE (ATTACK) Defender's HP (-1 HP per 100 likes)
  const totalAttackPool = (currentState.likesPool || 0) + addedLikes;
  const damageToDeal = Math.floor(totalAttackPool / likesRequired);
  const remainingAttackPool = totalAttackPool % likesRequired;

  if (damageToDeal > 0) {
    const remainingHp = king.currentHp - damageToDeal;

    // Defender survives the heart-like attack
    if (remainingHp > 0) {
      king.currentHp = remainingHp;
      king.totalDamageTaken += damageToDeal;

      return {
        nextState: {
          ...currentState,
          currentKing: king,
          likesPool: remainingAttackPool,
          totalRoomLikes: updatedTotalLikes,
          processedEventIds: nextProcessedIds,
          lastEventTimestamp: Date.now()
        },
        eventType: 'LIKE_HIT',
        hpDelta: -damageToDeal,
        damageDealt: damageToDeal,
        healedAmount: 0,
        defeatedKing: null,
        newKing: null,
        leftoverHp: remainingHp
      };
    }

    // Defender is knocked out by challenger's heart likes (remainingHp <= 0)
    const now = Date.now();
    const rawLeftover = Math.abs(remainingHp);
    const startingHp = Math.min(Math.max(rawLeftover > 0 ? rawLeftover : 1, minStartingHp), maxHp);

    const reignDurationSeconds = Math.max(1, Math.round((now - king.reignStartedAt) / 1000));
    const defeatedKing: King = {
      ...king,
      currentHp: 0
    };

    const updatedLeaderboards = updateLeaderboards(
      currentState.leaderboard,
      defeatedKing,
      reignDurationSeconds
    );

    const challengerName = likeData.nickname || 'Heart Challenger';
    const challengerId = likeData.userId || `liker_${challengerName.toLowerCase()}`;
    const challengerAvatar =
      likeData.profilePictureUrl ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(challengerName)}`;

    const prevAttackerStreak = (currentState.userWinStreaks || {})[challengerId] || 0;
    const newKingStreak = prevAttackerStreak + 1;
    const updatedUserStreaks: Record<string, number> = {
      ...(currentState.userWinStreaks || {}),
      [king.userId]: 0,
      [challengerId]: newKingStreak
    };

    const newKing: King = {
      userId: challengerId,
      nickname: challengerName,
      profilePictureUrl: challengerAvatar,
      currentHp: startingHp,
      maxHp: startingHp,
      startingHp,
      reignStartedAt: now,
      knockouts: newKingStreak,
      winStreak: newKingStreak,
      totalDamageTaken: 0,
      totalHealed: 0,
      likesGainedHp: 0,
      crownTier: calculateCrownTier(newKingStreak)
    };

    return {
      nextState: {
        ...currentState,
        currentKing: newKing,
        currentWinStreak: newKingStreak,
        userWinStreaks: updatedUserStreaks,
        leaderboard: updatedLeaderboards,
        totalBattles: currentState.totalBattles + 1,
        likesPool: 0,
        defenderLikesPool: 0,
        totalRoomLikes: updatedTotalLikes,
        processedEventIds: nextProcessedIds,
        lastEventTimestamp: now
      },
      eventType: 'LIKE_TAKEOVER',
      hpDelta: -damageToDeal,
      damageDealt: damageToDeal,
      healedAmount: 0,
      defeatedKing,
      newKing,
      leftoverHp: startingHp
    };
  }

  return {
    nextState: {
      ...currentState,
      likesPool: remainingAttackPool,
      totalRoomLikes: updatedTotalLikes,
      processedEventIds: nextProcessedIds
    },
    eventType: 'NONE',
    hpDelta: 0,
    damageDealt: 0,
    healedAmount: 0,
    defeatedKing: null,
    newKing: null,
    leftoverHp: 0
  };
}
