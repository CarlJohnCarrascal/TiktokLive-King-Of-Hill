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
 *    Any gift from a different viewer deals damage equal to its coin value.
 * 4. Knockout & Takeover:
 *    When HP <= 0, the current King is knocked out.
 *    The attacker takes the stage, and leftover damage becomes their starting HP!
 *    (Zero wasted coins). If leftover is 0, a safe minimum HP is granted.
 * 5. Heal (King's Reinforcements):
 *    If the reigning King sends another gift, it heals them up to MAX_HP.
 * 6. Decay (Optional):
 *    Slowly drains HP over time to keep the stream dynamic when chat is quiet.
 * 7. Anti-Streak Double Counting:
 *    Gifts are processed on final streak completion to ensure 100% fair coin tallies.
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
  likesPerHp: number; // Every 1000 likes = +1 HP (configurable)
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
  totalDamageTaken: number;
  totalHealed: number;
  likesGainedHp: number;
  crownTier: 'bronze' | 'silver' | 'gold' | 'diamond';
}

export interface AttackerRecord {
  id: string;
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
  lastAttackers: AttackerRecord[];
  leaderboard: {
    mostKnockouts: LeaderboardStats[];
    longestReigns: LeaderboardStats[];
  };
  totalBattles: number;
  totalGiftsReceived: number;
  totalCoinsContributed: number;
  likesPool: number; // accumulated likes toward next HP (0 to 999)
  totalRoomLikes: number; // lifetime room heart likes
  lastEventTimestamp: number;
}

export type CombatEventType = 'FIRST_KING' | 'HEAL' | 'HIT' | 'TAKEOVER';

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
  lastAttackers: [],
  leaderboard: {
    mostKnockouts: [],
    longestReigns: []
  },
  totalBattles: 0,
  totalGiftsReceived: 0,
  totalCoinsContributed: 0,
  likesPool: 0,
  totalRoomLikes: 0,
  lastEventTimestamp: Date.now()
};

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
 * =========================================================================
 * CORE COMBAT LOGIC
 * =========================================================================
 */
export function processGiftAction(
  currentState: GameState,
  gift: {
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
  // 1. Calculate HP value based on coins and multiplier
  const multiplier = Math.max(0.1, config.hpMultiplier || 1);
  const hpValue = Math.max(1, Math.round(gift.coins * multiplier));
  const maxHp = Math.max(100, config.maxHp || 50000);
  const minStartingHp = Math.max(1, config.minStartingHp || 10);

  const updatedTotalGifts = currentState.totalGiftsReceived + 1;
  const updatedTotalCoins = currentState.totalCoinsContributed + gift.coins;

  // RULE 2: If nobody is on stage, the first gifter becomes the King!
  if (!currentState.currentKing) {
    const startingHp = Math.min(Math.max(hpValue, minStartingHp), maxHp);
    const newKing: King = {
      userId: gift.userId,
      nickname: gift.nickname,
      profilePictureUrl: gift.profilePictureUrl,
      currentHp: startingHp,
      maxHp: startingHp,
      startingHp,
      reignStartedAt: Date.now(),
      knockouts: 0,
      totalDamageTaken: 0,
      totalHealed: 0,
      likesGainedHp: 0,
      crownTier: 'bronze'
    };

    const attackerRecord: AttackerRecord = {
      id: `attack_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      timestamp: Date.now()
    };

    const nextState: GameState = {
      ...currentState,
      currentKing: newKing,
      lastAttackers: [attackerRecord, ...currentState.lastAttackers.slice(0, 4)],
      totalBattles: currentState.totalBattles + 1,
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      lastEventTimestamp: Date.now()
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

  const currentKing = { ...currentState.currentKing };

  // RULE 5: ONLY if the reigning King THEMSELVES sends another gift, it HEALS them!
  // Any other challenger's gift MUST ATTACK and subtract HP (deal damage).
  const isKingSendingGift = Boolean(
    gift.userId &&
    currentKing.userId &&
    gift.userId !== 'anonymous' &&
    currentKing.userId !== 'anonymous' &&
    (gift.userId === currentKing.userId ||
     (gift.nickname && currentKing.nickname && gift.nickname.trim().toLowerCase() === currentKing.nickname.trim().toLowerCase()))
  );

  if (isKingSendingGift) {
    const oldHp = currentKing.currentHp;
    const newHp = Math.min(maxHp, oldHp + hpValue);
    const actualHealed = newHp - oldHp;

    currentKing.currentHp = newHp;
    currentKing.maxHp = Math.max(currentKing.maxHp, newHp);
    currentKing.totalHealed += actualHealed;

    const attackerRecord: AttackerRecord = {
      id: `heal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      timestamp: Date.now()
    };

    const nextState: GameState = {
      ...currentState,
      currentKing,
      lastAttackers: [attackerRecord, ...currentState.lastAttackers.slice(0, 4)],
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      lastEventTimestamp: Date.now()
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

  // RULE 3 & 4: Different user sends a gift (ATTACK)
  const damageDealt = hpValue;
  const remainingHp = currentKing.currentHp - damageDealt;

  // Case A: King survives the attack!
  if (remainingHp > 0) {
    currentKing.currentHp = remainingHp;
    currentKing.totalDamageTaken += damageDealt;

    const attackerRecord: AttackerRecord = {
      id: `hit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
      timestamp: Date.now()
    };

    const nextState: GameState = {
      ...currentState,
      currentKing,
      lastAttackers: [attackerRecord, ...currentState.lastAttackers.slice(0, 4)],
      totalGiftsReceived: updatedTotalGifts,
      totalCoinsContributed: updatedTotalCoins,
      lastEventTimestamp: Date.now()
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

  // Defeated King stats finalized
  const reignDurationSeconds = Math.max(1, Math.round((Date.now() - currentKing.reignStartedAt) / 1000));
  const defeatedKing: King = {
    ...currentKing,
    currentHp: 0
  };

  // Update Leaderboards with defeated king's reign
  const updatedLeaderboards = updateLeaderboards(
    currentState.leaderboard,
    defeatedKing,
    reignDurationSeconds
  );

  // New King takes the stage!
  const newKing: King = {
    userId: gift.userId,
    nickname: gift.nickname,
    profilePictureUrl: gift.profilePictureUrl,
    currentHp: startingHp,
    maxHp: startingHp,
    startingHp,
    reignStartedAt: Date.now(),
    knockouts: 0,
    totalDamageTaken: 0,
    totalHealed: 0,
    likesGainedHp: 0,
    crownTier: 'bronze'
  };

  const attackerRecord: AttackerRecord = {
    id: `ko_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
    timestamp: Date.now()
  };

  const nextState: GameState = {
    ...currentState,
    currentKing: newKing,
    lastAttackers: [attackerRecord, ...currentState.lastAttackers.slice(0, 4)],
    leaderboard: updatedLeaderboards,
    totalBattles: currentState.totalBattles + 1,
    totalGiftsReceived: updatedTotalGifts,
    totalCoinsContributed: updatedTotalCoins,
    lastEventTimestamp: Date.now()
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
    mostKnockouts: knockoutsList.slice(0, 5),
    longestReigns: reignsList.slice(0, 5)
  };
}

/**
 * =========================================================================
 * RULE: Every 1,000 heart likes is equivalent to +1 HP for the reigning King!
 * =========================================================================
 */
export function processLikeAction(
  currentState: GameState,
  likeCount: number,
  config: GameConfig,
  senderName?: string
): {
  nextState: GameState;
  hpGained: number;
  newTotalLikes: number;
  currentPool: number;
} {
  const addedLikes = Math.max(1, likeCount || 1);
  const likesRequired = Math.max(1, config.likesPerHp || 1000);
  const updatedTotalLikes = (currentState.totalRoomLikes || 0) + addedLikes;
  const totalPool = (currentState.likesPool || 0) + addedLikes;

  const hpGained = Math.floor(totalPool / likesRequired);
  const remainingPool = totalPool % likesRequired;

  if (hpGained > 0 && currentState.currentKing) {
    const king = { ...currentState.currentKing };
    const maxHp = Math.max(100, config.maxHp || 50000);
    const oldHp = king.currentHp;
    const newHp = Math.min(maxHp, oldHp + hpGained);
    const actualGained = newHp - oldHp;

    king.currentHp = newHp;
    king.maxHp = Math.max(king.maxHp, newHp);
    king.likesGainedHp = (king.likesGainedHp || 0) + actualGained;

    return {
      nextState: {
        ...currentState,
        currentKing: king,
        likesPool: remainingPool,
        totalRoomLikes: updatedTotalLikes,
        lastEventTimestamp: Date.now()
      },
      hpGained: actualGained,
      newTotalLikes: updatedTotalLikes,
      currentPool: remainingPool
    };
  }

  return {
    nextState: {
      ...currentState,
      likesPool: remainingPool,
      totalRoomLikes: updatedTotalLikes
    },
    hpGained: 0,
    newTotalLikes: updatedTotalLikes,
    currentPool: remainingPool
  };
}
