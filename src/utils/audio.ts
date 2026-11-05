/**
 * Audio System for King of the Hill OBS Overlay
 * Features zero-dependency synthetic Web Audio API sounds for hits, heals, and KOs,
 * with hook points for custom audio file URLs and master mute/volume controls.
 */

class SoundController {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.8;
  private customAudioCache: Map<string, HTMLAudioElement> = new Map();

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Sound 1: Punchy Arcade Hit Sound
   */
  public playHit(customUrl?: string) {
    if (this.isMuted || this.volume <= 0) return;

    if (customUrl) {
      this.playCustomAudio(customUrl);
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Dual oscillator punch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      // Fast downward pitch sweep (arcade punch punchy impact)
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);

      gain.gain.setValueAtTime(this.volume * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);

      // Noise burst for impact crunch
      this.playNoiseImpact(now, 0.08, 0.4);
    } catch (e) {
      console.warn('[Audio] Hit sound error:', e);
    }
  }

  /**
   * Sound 2: Heavenly / Uplifting Heal Shimmer Sound
   */
  public playHeal(customUrl?: string) {
    if (this.isMuted || this.volume <= 0) return;

    if (customUrl) {
      this.playCustomAudio(customUrl);
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.06);

        const startTime = now + index * 0.06;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(this.volume * 0.6, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.46);
      });
    } catch (e) {
      console.warn('[Audio] Heal sound error:', e);
    }
  }

  /**
   * Sound 3: Dramatic KO Arena Gong & Horn
   */
  public playKo(customUrl?: string) {
    if (this.isMuted || this.volume <= 0) return;

    if (customUrl) {
      this.playCustomAudio(customUrl);
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Deep gong bass impact
      const oscBass = ctx.createOscillator();
      const gainBass = ctx.createGain();
      oscBass.type = 'sawtooth';
      oscBass.frequency.setValueAtTime(140, now);
      oscBass.frequency.exponentialRampToValueAtTime(35, now + 0.7);

      gainBass.gain.setValueAtTime(this.volume * 1.0, now);
      gainBass.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      oscBass.connect(gainBass);
      gainBass.connect(ctx.destination);
      oscBass.start(now);
      oscBass.stop(now + 0.85);

      // Arena dramatic brass interval
      const fanfareTones = [220, 293.66, 440, 587.33];
      fanfareTones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        const start = now + 0.12 + idx * 0.08;
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(this.volume * 0.7, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.72);
      });
    } catch (e) {
      console.warn('[Audio] KO sound error:', e);
    }
  }

  /**
   * Noise impact generator for fighting game hit punch
   */
  private playNoiseImpact(startTime: number, duration: number, noiseVol: number) {
    if (!this.audioCtx) return;
    const bufferSize = this.audioCtx.sampleRate * duration;
    const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, startTime);
    filter.frequency.exponentialRampToValueAtTime(100, startTime + duration);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(this.volume * noiseVol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  /**
   * Sound 4: Rocket Launch Whoosh Sound
   * Rapid whooshing air-rush / thruster ignition sound when the rocket launches from the bottom
   */
  public playWoosh(customUrl?: string) {
    if (this.isMuted || this.volume <= 0) return;

    if (customUrl) {
      this.playCustomAudio(customUrl);
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 0.42;

      // Filtered rushing wind noise
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.setValueAtTime(2.2, now);
      // Frequency ramps up smoothly from 260Hz to 1600Hz as rocket accelerates
      bandpass.frequency.setValueAtTime(260, now);
      bandpass.frequency.exponentialRampToValueAtTime(1700, now + 0.2);
      bandpass.frequency.exponentialRampToValueAtTime(500, now + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.001, now);
      noiseGain.gain.linearRampToValueAtTime(this.volume * 0.7, now + 0.1);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(bandpass);
      bandpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + duration);

      // Sub-harmonic pitch sweep for thruster momentum
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(420, now + 0.22);
      osc.frequency.exponentialRampToValueAtTime(160, now + duration);

      oscGain.gain.setValueAtTime(0.001, now);
      oscGain.gain.linearRampToValueAtTime(this.volume * 0.35, now + 0.08);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      console.warn('[Audio] Woosh sound error:', e);
    }
  }

  /**
   * Sound 5: Heavy Impact Thud Sound
   * Deep, solid physical impact when the rocket hits the defender profile
   */
  public playThud(customUrl?: string) {
    if (this.isMuted || this.volume <= 0) return;

    if (customUrl) {
      this.playCustomAudio(customUrl);
      return;
    }

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const duration = 0.32;

      // Heavy sub-bass pitch drop (170Hz -> 36Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(170, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + duration);

      gain.gain.setValueAtTime(this.volume * 0.95, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration);

      // Low-frequency impact crunch
      const bufferSize = Math.floor(ctx.sampleRate * 0.14);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(450, now);
      lowpass.frequency.exponentialRampToValueAtTime(50, now + 0.14);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(this.volume * 0.65, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      noise.connect(lowpass);
      lowpass.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.14);
    } catch (e) {
      console.warn('[Audio] Thud sound error:', e);
    }
  }

  /**
   * Hook point for custom audio URLs (e.g. user provided MP3 or WAV)
   */
  private playCustomAudio(url: string) {
    try {
      let audio = this.customAudioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        this.customAudioCache.set(url, audio);
      }
      audio.volume = this.volume;
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('[Audio] Custom audio playback failed:', err);
      });
    } catch (err) {
      console.warn('[Audio] Error playing custom audio:', err);
    }
  }
}

export const soundManager = new SoundController();
