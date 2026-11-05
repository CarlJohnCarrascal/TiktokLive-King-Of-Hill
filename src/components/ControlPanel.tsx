import React, { useState } from 'react';
import { GameState, GameConfig, King } from '../game/rules';
import { POPULAR_TIKTOK_GIFTS, BOT_NAMES } from '../data/giftPresets';
import { soundManager } from '../utils/audio';
import {
  Play,
  Square,
  Radio,
  Settings,
  Flame,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  Swords,
  Heart,
  Crown,
  Sparkles,
  ExternalLink,
  Sliders,
  Tv,
  Smartphone,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

interface ControlPanelProps {
  gameState: GameState;
  config: GameConfig;
  tiktokStatus: {
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'ended';
    username: string;
    error: string | null;
  };
  onSimulateGift: (giftData: {
    userId?: string;
    nickname: string;
    profilePictureUrl?: string;
    giftName: string;
    diamondCount: number;
    repeatCount: number;
    coins: number;
  }) => void;
  onUpdateConfig: (newConfig: Partial<GameConfig>) => void;
  onConnectTikTok: (username: string) => void;
  onDisconnectTikTok: () => void;
  onResetGame: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  gameState,
  config,
  tiktokStatus,
  onSimulateGift,
  onUpdateConfig,
  onConnectTikTok,
  onDisconnectTikTok,
  onResetGame
}) => {
  const [activeTab, setActiveTab] = useState<'testing' | 'tiktok' | 'settings' | 'obs'>('testing');
  const [tiktokInput, setTiktokInput] = useState(config.tiktokUsername || '');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Custom Gift Simulator State
  const [customName, setCustomName] = useState('GifterStrike');
  const [customGiftName, setCustomGiftName] = useState('Rose');
  const [customCoins, setCustomCoins] = useState(100);
  const [customStreak, setCustomStreak] = useState(1);
  const [targetType, setTargetType] = useState<'random' | 'king'>('random');

  // Trigger quick preset gift
  const handleQuickGift = (gift: typeof POPULAR_TIKTOK_GIFTS[0], asKing = false) => {
    let gifterName: string;
    let gifterId: string;
    let avatarUrl: string;

    if (asKing && gameState.currentKing) {
      gifterName = gameState.currentKing.nickname;
      gifterId = gameState.currentKing.userId;
      avatarUrl = gameState.currentKing.profilePictureUrl;
    } else {
      const randomBot = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      gifterName = `${randomBot}_${Math.floor(Math.random() * 90 + 10)}`;
      gifterId = `bot_${gifterName.toLowerCase()}`;
      avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(gifterName)}`;
    }

    onSimulateGift({
      userId: gifterId,
      nickname: gifterName,
      profilePictureUrl: avatarUrl,
      giftName: gift.name,
      diamondCount: gift.coins,
      repeatCount: 1,
      coins: gift.coins
    });
  };

  // Trigger custom gift
  const handleCustomGift = (e: React.FormEvent) => {
    e.preventDefault();
    let gifterName = customName.trim() || 'HeroGifter';
    let gifterId = `custom_${gifterName.toLowerCase()}`;
    let avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(gifterName)}`;

    if (targetType === 'king' && gameState.currentKing) {
      gifterName = gameState.currentKing.nickname;
      gifterId = gameState.currentKing.userId;
      avatarUrl = gameState.currentKing.profilePictureUrl;
    }

    const totalCoins = Math.max(1, Number(customCoins) || 1) * Math.max(1, Number(customStreak) || 1);

    onSimulateGift({
      userId: gifterId,
      nickname: gifterName,
      profilePictureUrl: avatarUrl,
      giftName: customGiftName.trim() || 'Custom Gift',
      diamondCount: Number(customCoins) || 1,
      repeatCount: Number(customStreak) || 1,
      coins: totalCoins
    });
  };

  // Lethal KO test: hits with exact King's current HP + 50 to test takeover and leftover HP transfer
  const handleLethalKO = () => {
    if (!gameState.currentKing) {
      handleQuickGift(POPULAR_TIKTOK_GIFTS[4]); // money gun to spawn king
      return;
    }
    const lethalCoins = gameState.currentKing.currentHp + 50;
    const attackerName = `Challenger_${Math.floor(Math.random() * 900 + 100)}`;
    onSimulateGift({
      userId: `lethal_${attackerName}`,
      nickname: attackerName,
      profilePictureUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(attackerName)}`,
      giftName: 'Lethal Strike',
      diamondCount: lethalCoins,
      repeatCount: 1,
      coins: lethalCoins
    });
  };

  const obsOverlayUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?mode=overlay`
    : 'http://localhost:3000/?mode=overlay';

  const copyObsUrl = () => {
    navigator.clipboard.writeText(obsOverlayUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto rounded-3xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-4 md:p-6 text-white backdrop-blur-xl">
      
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Crown className="w-6 h-6 text-slate-950 font-black" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-fighting tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-400">
              KING OF THE HILL • STREAMER STUDIO
            </h1>
            <p className="text-xs text-slate-400">
              Real-time gift battle controller & OBS browser source manager
            </p>
          </div>
        </div>

        {/* Live TikTok status pill */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
            tiktokStatus.status === 'connected'
              ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
              : tiktokStatus.status === 'connecting'
              ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}>
            <span className={`w-2.5 h-2.5 rounded-full ${
              tiktokStatus.status === 'connected' ? 'bg-emerald-400 animate-ping' :
              tiktokStatus.status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
            }`} />
            <span>
              {tiktokStatus.status === 'connected' ? `LIVE: @${tiktokStatus.username}` :
               tiktokStatus.status === 'connecting' ? 'Connecting...' : 'Connector Idle'}
            </span>
          </div>

          {/* Quick Sound Mute Toggle */}
          <button
            onClick={() => {
              const next = !config.soundEnabled;
              onUpdateConfig({ soundEnabled: next });
              soundManager.setMuted(!next);
            }}
            className={`p-2 rounded-xl border transition-all ${
              config.soundEnabled
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
                : 'bg-amber-950/40 border-amber-600/50 text-amber-400'
            }`}
            title={config.soundEnabled ? 'Mute Sounds' : 'Unmute Sounds'}
          >
            {config.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-5 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('testing')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-fighting uppercase tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'testing'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>Test Mode Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab('tiktok')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-fighting uppercase tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'tiktok'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Live TikTok Connector</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-fighting uppercase tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'settings'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Game Rules & HP Config</span>
        </button>

        <button
          onClick={() => setActiveTab('obs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-fighting uppercase tracking-wider transition-all whitespace-nowrap ${
            activeTab === 'obs'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
              : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>OBS / Studio Setup</span>
        </button>
      </div>

      {/* TAB 1: TEST MODE SIMULATOR */}
      {activeTab === 'testing' && (
        <div className="space-y-6">
          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-slate-300 font-medium">
              Stage Status:{' '}
              {gameState.currentKing ? (
                <span className="text-amber-400 font-bold">
                  👑 {gameState.currentKing.nickname} ({gameState.currentKing.currentHp.toLocaleString()} HP)
                </span>
              ) : (
                <span className="text-slate-400 italic">No King (Throne is Empty)</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleLethalKO}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600/30 hover:bg-red-600/50 border border-red-500/60 text-red-300 hover:text-white text-xs font-fighting uppercase tracking-wider transition-all"
                title="Attacks with exact current HP + 50 to test takeover and leftover HP transfer"
              >
                <Flame className="w-3.5 h-3.5 text-red-400" />
                <span>Simulate Lethal KO</span>
              </button>

              {gameState.currentKing && (
                <button
                  onClick={() => handleQuickGift(POPULAR_TIKTOK_GIFTS[2], true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/60 text-emerald-300 hover:text-white text-xs font-fighting uppercase tracking-wider transition-all"
                  title="Simulates current King sending a gift to heal"
                >
                  <Heart className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                  <span>Heal King (+100 HP)</span>
                </button>
              )}

              <button
                onClick={onResetGame}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Throne</span>
              </button>
            </div>
          </div>

          {/* Quick Gift Presets Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider">
                1-Click Quick Gift Attacks (Simulated Viewers)
              </h3>
              <span className="text-[11px] text-slate-400">Click any gift to attack the King</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {POPULAR_TIKTOK_GIFTS.map((gift) => (
                <button
                  key={gift.id}
                  onClick={() => handleQuickGift(gift, false)}
                  className="group relative flex flex-col items-center p-3 rounded-2xl bg-slate-950/70 hover:bg-slate-800/90 border border-slate-800 hover:border-amber-400/60 transition-all text-center hover:scale-[1.03] active:scale-[0.98] shadow-sm hover:shadow-lg"
                >
                  <span className="text-2xl mb-1 group-hover:scale-110 transition-transform">
                    {gift.emoji}
                  </span>
                  <span className="text-xs font-bold text-white group-hover:text-amber-300 truncate w-full">
                    {gift.name}
                  </span>
                  <span className="text-[11px] font-fighting text-amber-400 mt-0.5">
                    {gift.coins.toLocaleString()} {gift.coins === 1 ? 'Coin' : 'Coins'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Test Gift Generator */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider mb-3">
              Custom Gift & Multi-Streak Generator
            </h3>
            
            <form onSubmit={handleCustomGift} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Gifter Nickname</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  placeholder="e.g. SpeedGifter"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Gift Name</label>
                <input
                  type="text"
                  value={customGiftName}
                  onChange={(e) => setCustomGiftName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                  placeholder="e.g. Galaxy Hammer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Coins Per Gift</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={customCoins}
                  onChange={(e) => setCustomCoins(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Repeat Streak ({customStreak}x)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={customStreak}
                  onChange={(e) => setCustomStreak(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex flex-col justify-end">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-fighting text-xs tracking-wider uppercase shadow-md transition-all active:scale-95"
                >
                  Send Attack ({(customCoins * customStreak).toLocaleString()} HP)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: LIVE TIKTOK CONNECTOR */}
      {activeTab === 'tiktok' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
            <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider mb-2">
              Connect to TikTok LIVE Stream
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Enter any currently LIVE TikTok creator's username to listen for real gift events in real-time.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">@</span>
                <input
                  type="text"
                  value={tiktokInput}
                  onChange={(e) => setTiktokInput(e.target.value.replace(/^@/, ''))}
                  placeholder="tiktok_username"
                  className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              {tiktokStatus.status === 'connected' ? (
                <button
                  onClick={onDisconnectTikTok}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-fighting text-xs uppercase tracking-wider transition-all"
                >
                  <Square className="w-4 h-4" />
                  <span>Disconnect LIVE</span>
                </button>
              ) : (
                <button
                  onClick={() => onConnectTikTok(tiktokInput)}
                  disabled={!tiktokInput.trim() || tiktokStatus.status === 'connecting'}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-fighting text-xs uppercase tracking-wider shadow-md transition-all"
                >
                  {tiktokStatus.status === 'connecting' ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-slate-950 fill-slate-950" />
                      <span>Connect LIVE</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Error Message */}
            {tiktokStatus.error && (
              <div className="flex items-start gap-2 mt-4 p-3 rounded-xl bg-red-950/40 border border-red-500/50 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <div>
                  <strong>Connection Alert:</strong> {tiktokStatus.error}
                  <p className="text-[11px] text-red-400/80 mt-1">
                    Make sure the user is currently streaming LIVE on TikTok and the username is spelled correctly. Auto-reconnect is active in the background.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Architecture & Anti-Streak Deduplication Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs space-y-2">
              <h4 className="font-fighting text-amber-300 uppercase">Streak Protection (Rule 7)</h4>
              <p className="text-slate-300 leading-relaxed">
                TikTok repeats (e.g. 10x roses) send progressive streak ticks. Our server uses a streak deduplication engine so gifts are counted <strong>only once per final streak value</strong>. Viewers receive exact, un-inflated coin damage.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800 text-xs space-y-2">
              <h4 className="font-fighting text-amber-300 uppercase">Auto-Reconnect Built-in</h4>
              <p className="text-slate-300 leading-relaxed">
                If the streamer's mobile connection fluctuates, the backend automatically attempts reconnection with exponential backoff up to 10 times without resetting your current King.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GAME RULES & HP CONFIG */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* HP Multiplier & Caps */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
              <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider">
                HP Multiplier & Limits
              </h3>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">HP Multiplier (1 Coin = X HP):</span>
                  <span className="font-fighting text-amber-400">{config.hpMultiplier}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="10"
                  step="0.1"
                  value={config.hpMultiplier}
                  onChange={(e) => onUpdateConfig({ hpMultiplier: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Default: 1.0 (1 Rose = 1 HP, 1 Lion = 29,999 HP).
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">MAX HP Cap:</span>
                  <span className="font-fighting text-amber-400">{config.maxHp.toLocaleString()} HP</span>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="100000"
                  step="5000"
                  value={config.maxHp}
                  onChange={(e) => onUpdateConfig({ maxHp: parseInt(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Limits the maximum health a King can reach through heals.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Min Starting HP on KO:</span>
                  <span className="font-fighting text-amber-400">{config.minStartingHp} HP</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  step="1"
                  value={config.minStartingHp}
                  onChange={(e) => onUpdateConfig({ minStartingHp: parseInt(e.target.value) })}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Guarantees the new King starts with at least this much HP if leftover damage was 0.
                </p>
              </div>
            </div>

            {/* HP Decay & Audio Settings */}
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
              <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider">
                Decay (Rule 6) & Audio FX
              </h3>

              {/* Decay Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-700/80">
                <div>
                  <span className="text-xs font-semibold text-white block">Slow HP Decay Over Time</span>
                  <span className="text-[11px] text-slate-400">
                    Gradually drains HP when chat is quiet (stops at 1 HP)
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.enableDecay}
                    onChange={(e) => onUpdateConfig({ enableDecay: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {config.enableDecay && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">Decay Loss per Tick:</span>
                      <span className="font-fighting text-amber-400">-{config.decayAmount} HP</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="50"
                      value={config.decayAmount}
                      onChange={(e) => onUpdateConfig({ decayAmount: parseInt(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">Tick Interval:</span>
                      <span className="font-fighting text-amber-400">Every {config.decayIntervalSeconds}s</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={config.decayIntervalSeconds}
                      onChange={(e) => onUpdateConfig({ decayIntervalSeconds: parseInt(e.target.value) })}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              )}

              {/* Sound Controls */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Sound FX Volume:</span>
                  <span className="font-fighting text-amber-400">
                    {Math.round(config.soundVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={config.soundVolume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    onUpdateConfig({ soundVolume: vol });
                    soundManager.setVolume(vol);
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                
                {/* Audio test buttons */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => soundManager.playHit()}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white"
                  >
                    Test Hit
                  </button>
                  <button
                    onClick={() => soundManager.playHeal()}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white"
                  >
                    Test Heal
                  </button>
                  <button
                    onClick={() => soundManager.playKo()}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white"
                  >
                    Test KO Gong
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* TAB 4: OBS / TIKTOK LIVE STUDIO SETUP */}
      {activeTab === 'obs' && (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-4">
            <h3 className="text-xs font-fighting text-amber-300 uppercase tracking-wider">
              Add Browser Source in OBS or TikTok LIVE Studio
            </h3>

            {/* Overlay URL Copy Box */}
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                readOnly
                value={obsOverlayUrl}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-amber-300 focus:outline-none select-all"
              />
              <button
                onClick={copyObsUrl}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-fighting text-xs uppercase tracking-wider transition-all shadow-md shrink-0"
              >
                {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUrl ? 'Copied URL!' : 'Copy Overlay URL'}</span>
              </button>
            </div>

            {/* OBS Recommended Settings Guide */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center gap-2 font-fighting text-amber-300">
                  <Tv className="w-4 h-4" />
                  <span>LANDSCAPE SETUP (1920 x 1080)</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>In OBS, click <strong>+ Add Source &gt; Browser</strong></li>
                  <li>URL: paste the copied URL above</li>
                  <li>Width: <strong>1920</strong>, Height: <strong>1080</strong></li>
                  <li>Check: <strong>"Shutdown source when not visible"</strong></li>
                  <li>Background is 100% transparent automatically!</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-2">
                <div className="flex items-center gap-2 font-fighting text-amber-300">
                  <Smartphone className="w-4 h-4" />
                  <span>PORTRAIT SETUP (1080 x 1920)</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>Set Orientation to Portrait below</li>
                  <li>URL: <code>{obsOverlayUrl}&orientation=portrait</code></li>
                  <li>Width: <strong>1080</strong>, Height: <strong>1920</strong></li>
                  <li>Check: <strong>"Control audio via OBS"</strong> (optional)</li>
                </ul>
              </div>
            </div>

            {/* Layout Orientation & Theme switcher */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-300">Overlay Layout:</span>
                <div className="flex rounded-lg bg-slate-900 p-1 border border-slate-800">
                  <button
                    onClick={() => onUpdateConfig({ orientation: 'landscape' })}
                    className={`px-3 py-1 rounded text-xs font-semibold ${
                      config.orientation === 'landscape'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1920x1080 Landscape
                  </button>
                  <button
                    onClick={() => onUpdateConfig({ orientation: 'portrait' })}
                    className={`px-3 py-1 rounded text-xs font-semibold ${
                      config.orientation === 'portrait'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1080x1920 Portrait
                  </button>
                </div>
              </div>

              {/* Open Clean OBS Source in New Window */}
              <a
                href="/?mode=overlay"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold"
              >
                <span>Preview Clean Overlay in New Window</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
