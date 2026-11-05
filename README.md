# 👑 TikTok LIVE "King of the Hill" Overlay for OBS & TikTok LIVE Studio

An arena-fighter styled browser-source web application for streamers on **TikTok LIVE**, **OBS Studio**, **Streamlabs**, and **TikTok LIVE Studio**. Viewers battle for the throne with gifts—when a challenger knocks out the reigning King's HP to 0, leftover damage becomes their starting HP, and they take the stage!

---

## 🎮 Concept & Game Rules

1. **HP Calculation**: `HP = Gift Coins * Multiplier` (Default: 1 Rose = 1 coin = 1 HP; 1 Lion = 29,999 coins = 29,999 HP).
2. **First King**: If nobody is on stage, the first viewer to gift immediately takes the throne with starting HP = their gift value.
3. **Challenger Attacks**: When any other viewer sends a gift, its coin value deals direct damage to the King's HP.
4. **Knockout & Takeover**: When HP reaches 0, the King is knocked out. The attacker takes the stage, and **all leftover damage becomes their starting HP** (zero wasted coins!). If leftover is 0, a safe minimum HP is granted.
5. **King's Reinforcements (Heal)**: If the reigning King sends another gift, it heals their HP (capped at `MAX_HP`).
6. **Decay (Optional)**: Slow HP drain over time (off by default) to keep the stream dynamic during quiet periods.
7. **Streak Protection**: TikTok repeats and streak counts are counted **only once per final streak value**, avoiding double-counting.

---

## 🚀 Quick Setup & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- [OBS Studio](https://obsproject.com/) or **TikTok LIVE Studio**

### Step 1: Install Dependencies
Open your terminal in the project folder and run:
```bash
npm install
```

### Step 2: Start the Server
```bash
npm run dev
```
You should see:
```text
[Server] King of the Hill server running at http://localhost:3000
[Server] OBS Browser Source: http://localhost:3000/?mode=overlay
[Server] Control / Test Panel: http://localhost:3000/
```

---

## 🎥 Adding to OBS Studio or TikTok LIVE Studio

1. In OBS, click **+** under the **Sources** dock and select **Browser**.
2. Name it `King of the Hill Overlay`.
3. Set the **URL**:
   - Landscape (Standard 16:9): `http://localhost:3000/?mode=overlay`
   - Portrait (TikTok Mobile 9:16): `http://localhost:3000/?mode=overlay&orientation=portrait`
4. Set the dimensions:
   - For Landscape streams: **Width: 1920**, **Height: 1080**
   - For Portrait streams: **Width: 1080**, **Height: 1920**
5. Check **"Shutdown source when not visible"** and **"Refresh browser when scene becomes active"**.
6. The background is **100% transparent** by default—it sits seamlessly over your webcam or gameplay!

---

## 🧪 Test Mode (Test Without Going LIVE)

You can test every mechanic, sound effect, and animation before going live:
1. Open `http://localhost:3000/` in your web browser.
2. Under the **Test Mode Simulator** tab:
   - Click any 1-click gift button (Rose, Doughnut, Confetti, Money Gun, Lion, Universe).
   - Click **"Simulate Lethal KO"** to test a one-shot attack with exact HP + 50 to see the KO banner, sound, and leftover HP carry-over.
   - Click **"Heal King"** to test the green heal animation and chime.
   - Use the **Custom Gift Generator** to enter custom names, coins, and multi-streak counts.
   - Click **"Reset Throne"** to evict the king and test the empty stage prompt.

---

## ⚙️ Configuration (`config.json`)

Settings can be edited directly in `config.json` or live through the **Streamer Studio** web UI:

```json
{
  "tiktokUsername": "your_tiktok_username",
  "hpMultiplier": 1,
  "maxHp": 50000,
  "minStartingHp": 10,
  "enableDecay": false,
  "decayAmount": 5,
  "decayIntervalSeconds": 3,
  "soundEnabled": true,
  "soundVolume": 0.8,
  "theme": "cyber-arena",
  "orientation": "landscape"
}
```

| Setting | Type | Description |
|---|---|---|
| `tiktokUsername` | String | Your TikTok handle (without or with `@`). Can be connected live in UI. |
| `hpMultiplier` | Number | Multiplier for gift coins to HP (e.g. `1` = 1 coin : 1 HP, `2` = double HP). |
| `maxHp` | Number | Maximum cap for health when the King heals (default `50000`). |
| `minStartingHp` | Number | Minimum HP a new King gets if leftover damage was 0 (default `10`). |
| `enableDecay` | Boolean | Enables gradual HP loss when inactive (`false` by default). |
| `decayAmount` | Number | Amount of HP lost per decay tick (e.g. `5`). |
| `decayIntervalSeconds` | Number | How often decay triggers in seconds (e.g. every `3` seconds). |
| `soundEnabled` | Boolean | Toggle audio SFX on/off. |
| `soundVolume` | Number | Audio volume slider (`0.0` to `1.0`). |
| `orientation` | String | `"landscape"` (1920x1080) or `"portrait"` (1080x1920). |

---

## 🔊 Sound Effects & Web Audio

- **Hit Sound**: Punchy retro arcade smack with noise crunch.
- **Heal Sound**: Uplifting four-note harmonic chime.
- **KO Gong**: Deep bass gong with arena brass fanfare.
- Generated purely via the **Web Audio API**—no missing audio files, 0ms latency, and works directly in OBS browser source without CORS issues.
- You can also plug in custom audio URLs in `src/utils/audio.ts` if desired.

---

## ⚠️ Known Limitations & Tips

1. **Unofficial TikTok LIVE API**:
   - `tiktok-live-connector` connects via TikTok's Webcast protocol. TikTok occasionally updates internal tokens or parameters, which may require updating the library (`npm update tiktok-live-connector`).
2. **Stream Must Be Live**:
   - You can only connect to accounts that are currently streaming live on TikTok. If you connect to an offline account, the connector will alert you and wait for auto-reconnect.
3. **Rate Limits & IP Blocks**:
   - Avoid creating rapid connection/disconnection loops to prevent TikTok from temporarily rate-limiting your IP address.
4. **OBS Audio Monitoring**:
   - If you cannot hear sound through OBS, ensure **"Control audio via OBS"** is checked in the browser source properties, and that the browser source volume slider in OBS Audio Mixer is unmuted and set to "Monitor and Output".

---

## 📁 Project Structure

```text
├── config.json                     # Streamer config file
├── index.html                      # HTML entry with fighter game typography
├── package.json                    # Dependencies & scripts
├── server.ts                       # Express + WebSocket + TikTok LIVE Connector
├── src/
│   ├── App.tsx                     # Main coordinator & view router
│   ├── components/
│   │   ├── ChampionCard.tsx        # Stage King, animated HP bar, reign timer
│   │   ├── ControlPanel.tsx        # Streamer Studio, gift simulator & config
│   │   ├── FloatingCombatText.tsx  # Floating damage/heal animated popups
│   │   ├── OverlayView.tsx         # Pure transparent OBS browser source view
│   │   ├── SidePanel.tsx           # Last 5 challengers & Hall of Fame
│   │   └── TakeoverBanner.tsx      # KO & New King takeover banner
│   ├── data/
│   │   └── giftPresets.ts          # Authentic TikTok gifts & coins data
│   ├── game/
│   │   └── rules.ts                # Clearly labeled HP rules & combat logic
│   └── utils/
│       └── audio.ts                # Web Audio sound synthesizer & mute controls
└── README.md                       # Complete documentation & setup guide
```
