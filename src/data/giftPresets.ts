export interface GiftPreset {
  id: string;
  name: string;
  coins: number;
  emoji: string;
  iconBg: string;
  description: string;
}

export const POPULAR_TIKTOK_GIFTS: GiftPreset[] = [
  {
    id: 'rose',
    name: 'Rose',
    coins: 1,
    emoji: '🌹',
    iconBg: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    description: '1 coin quick poke'
  },
  {
    id: 'doughnut',
    name: 'Doughnut',
    coins: 30,
    emoji: '🍩',
    iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    description: '30 coins snack'
  },
  {
    id: 'confetti',
    name: 'Confetti',
    coins: 100,
    emoji: '🎊',
    iconBg: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40',
    description: '100 coins party'
  },
  {
    id: 'corgi',
    name: 'Corgi',
    coins: 299,
    emoji: '🐕',
    iconBg: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    description: '299 coins good boy'
  },
  {
    id: 'money_gun',
    name: 'Money Gun',
    coins: 500,
    emoji: '💸',
    iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    description: '500 coins cash blast'
  },
  {
    id: 'swan',
    name: 'Swan',
    coins: 699,
    emoji: '🦢',
    iconBg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    description: '699 coins elegance'
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    coins: 1000,
    emoji: '🌌',
    iconBg: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    description: '1,000 coins star power'
  },
  {
    id: 'sports_car',
    name: 'Sports Car',
    coins: 7000,
    emoji: '🏎️',
    iconBg: 'bg-red-500/20 text-red-400 border-red-500/40',
    description: '7,000 coins super hit'
  },
  {
    id: 'tiktok_shuttle',
    name: 'TikTok Shuttle',
    coins: 20000,
    emoji: '🚀',
    iconBg: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    description: '20,000 coins orbital KO'
  },
  {
    id: 'lion',
    name: 'Lion',
    coins: 29999,
    emoji: '🦁',
    iconBg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    description: '29,999 coins King maker'
  },
  {
    id: 'universe',
    name: 'TikTok Universe',
    coins: 44999,
    emoji: '🪐',
    iconBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
    description: '44,999 coins legendary strike'
  }
];

export const BOT_NAMES = [
  'NeonStriker', 'ShadowViper', 'QueenAria', 'GigaChad99',
  'TokyoDrifter', 'CyberSamurai', 'LunaGifter', 'PixelBoss',
  'GoldenFalcon', 'BlazeRider', 'MysticWolf', 'TitanSlayer'
];
