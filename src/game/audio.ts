export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private nitroGain: GainNode | null = null;
  private rainGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.42, this.ctx.currentTime, 0.04);
    }
  }

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.42;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Engine Dual-Harmonic Synth
      const osc1 = ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc1.frequency.value = 55;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 110;

      const engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 260;
      engFilter.Q.value = 3.2;

      const engGain = ctx.createGain();
      engGain.gain.value = 0.0;

      osc1.connect(engFilter);
      osc2.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(master);

      osc1.start();
      osc2.start();
      this.engineOsc1 = osc1;
      this.engineOsc2 = osc2;
      this.engineFilter = engFilter;
      this.engineGain = engGain;

      // Procedural Noise Buffer for Tire Screech & Nitro
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const screechSrc = ctx.createBufferSource();
      screechSrc.buffer = noiseBuffer;
      screechSrc.loop = true;

      const screechFilter = ctx.createBiquadFilter();
      screechFilter.type = 'bandpass';
      screechFilter.frequency.value = 1350;
      screechFilter.Q.value = 6.5;

      const screechGain = ctx.createGain();
      screechGain.gain.value = 0;

      screechSrc.connect(screechFilter);
      screechFilter.connect(screechGain);
      screechGain.connect(master);
      screechSrc.start();
      this.screechFilter = screechFilter;
      this.screechGain = screechGain;

      // Nitro Whoosh
      const nitroSrc = ctx.createBufferSource();
      nitroSrc.buffer = noiseBuffer;
      nitroSrc.loop = true;

      const nitroFilter = ctx.createBiquadFilter();
      nitroFilter.type = 'bandpass';
      nitroFilter.frequency.value = 620;
      nitroFilter.Q.value = 1.4;

      const nitroGain = ctx.createGain();
      nitroGain.gain.value = 0;

      nitroSrc.connect(nitroFilter);
      nitroFilter.connect(nitroGain);
      nitroGain.connect(master);
      nitroSrc.start();
      this.nitroGain = nitroGain;

      // Ambient Rain Hiss
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = noiseBuffer;
      rainSrc.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'bandpass';
      rainFilter.frequency.value = 1850;
      rainFilter.Q.value = 0.65;

      const rainGain = ctx.createGain();
      rainGain.gain.value = 0;

      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);
      rainSrc.start();
      this.rainGain = rainGain;

      this.initialized = true;
    } catch {
      // AudioContext unavailable in restricted headless contexts
    }
  }

  public updateContinuous(params: {
    active: boolean;
    rpm: number;
    throttle: number;
    slipAngleDeg: number;
    speedKmh: number;
    isBoosting: boolean;
    rainIntensity?: number;
  }): void {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const rainAmt = (params.rainIntensity ?? 0) * 0.048;

    if (!params.active) {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.08);
      this.nitroGain?.gain.setTargetAtTime(0, now, 0.08);
      this.rainGain?.gain.setTargetAtTime(rainAmt * 0.45, now, 0.25);
      return;
    }

    const rpmNorm = Math.max(0, Math.min(1, (params.rpm - 800) / 7200));
    const baseFreq = 46 + rpmNorm * 145;
    this.engineOsc1?.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.engineOsc2?.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.03);
    this.engineFilter?.frequency.setTargetAtTime(220 + rpmNorm * 950 + params.throttle * 420, now, 0.04);
    this.engineGain?.gain.setTargetAtTime(0.08 + params.throttle * 0.09 + rpmNorm * 0.05, now, 0.04);

    // Tire Screech
    const absSlip = Math.abs(params.slipAngleDeg);
    const screechAmt =
      params.speedKmh > 30 && absSlip > 10
        ? Math.min(0.16, ((absSlip - 10) / 38) * 0.14 * Math.min(1, params.speedKmh / 90))
        : 0;
    this.screechGain?.gain.setTargetAtTime(screechAmt, now, 0.04);
    this.screechFilter?.frequency.setTargetAtTime(1150 + Math.min(600, absSlip * 12), now, 0.05);

    // Nitro Jet & Ambient Rain
    this.nitroGain?.gain.setTargetAtTime(params.isBoosting ? 0.16 : 0, now, 0.05);
    this.rainGain?.gain.setTargetAtTime(rainAmt, now, 0.25);
  }

  public playCountdownTone(isGo: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isGo ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.45 : 0.22));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isGo ? 0.46 : 0.24));
  }

  public playImpact(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    gain.gain.setValueAtTime(Math.min(0.38, 0.14 + intensity * 0.24), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  public playChime(type: 'drift' | 'lap' | 'finish'): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes =
      type === 'finish'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'lap'
          ? [587.33, 880]
          : [659.25, 987.77];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    });
  }

  public playTrophyChime(place: 1 | 2 | 3): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes =
      place === 1
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : place === 2
          ? [440, 554.37, 659.25, 880]
          : [392, 493.88, 587.33];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t0 = now + idx * 0.085;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.18, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + 0.45);
    });
  }

  private introGain: GainNode | null = null;
  private introPlaying = false;
  private introSessionId = 0;
  private introLoopTimer: number | null = null;

  public async tryPlayIntroMusic(): Promise<boolean> {
    if (this.introPlaying) return true;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return false;
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx.state !== 'running') return false;
    this.startIntroLoop();
    return true;
  }

  public stopIntroMusic(): void {
    this.introSessionId++;
    if (this.introLoopTimer !== null) {
      window.clearTimeout(this.introLoopTimer);
      this.introLoopTimer = null;
    }
    if (this.ctx && this.introGain) {
      const now = this.ctx.currentTime;
      const oldBus = this.introGain;
      this.introGain = null;
      try {
        oldBus.gain.cancelScheduledValues(now);
        oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), now);
        oldBus.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        window.setTimeout(() => {
          try {
            oldBus.disconnect();
          } catch {
            // already disconnected
          }
        }, 220);
      } catch {
        // ignore audio teardown errors
      }
    }
    this.introPlaying = false;
  }

  private startIntroLoop(): void {
    if (!this.ctx || !this.masterGain || this.introPlaying) return;
    this.introPlaying = true;
    const sessionId = ++this.introSessionId;

    const introBus = this.ctx.createGain();
    const tStart = this.ctx.currentTime + 0.03;
    introBus.gain.setValueAtTime(0.001, tStart);
    introBus.gain.linearRampToValueAtTime(0.55, tStart + 0.25);
    introBus.connect(this.masterGain);
    this.introGain = introBus;

    const LOOP_SEC = 6.4; // 4 bars x 1.6s (150 BPM)
    const scheduleLoopBar = (startTime: number) => {
      if (!this.ctx || sessionId !== this.introSessionId || !this.introGain) return;
      this.scheduleIntroBar(this.ctx, this.introGain, startTime);
      this.introLoopTimer = window.setTimeout(() => {
        if (!this.ctx || sessionId !== this.introSessionId || !this.introGain) return;
        const nextStart = Math.max(this.ctx.currentTime + 0.05, startTime + LOOP_SEC);
        scheduleLoopBar(nextStart);
      }, (LOOP_SEC - 0.12) * 1000);
    };

    scheduleLoopBar(tStart);
  }

  private scheduleIntroBar(ctx: AudioContext, bus: GainNode, now: number): void {
    // 1. Driving 8th-note Synthwave Bass Progression (Dm -> Bb -> C -> Am/Dm over 6.4s)
    const chords = [
      { bass: 73.42, pad: [146.83, 220.0], arp: [293.66, 440.0, 587.33, 698.46, 659.25, 587.33, 440.0, 587.33] },
      { bass: 58.27, pad: [116.54, 174.61], arp: [233.08, 349.23, 466.16, 587.33, 523.25, 466.16, 349.23, 466.16] },
      { bass: 65.41, pad: [130.81, 196.0], arp: [261.63, 392.0, 523.25, 659.25, 587.33, 523.25, 392.0, 523.25] },
      { bass: 55.0, pad: [110.0, 164.81], arp: [220.0, 329.63, 440.0, 587.33, 659.25, 698.46, 880.0, 659.25] },
    ];

    chords.forEach((ch, barIdx) => {
      const barStart = now + barIdx * 1.6;

      // Warm Pad Swell
      for (const pf of ch.pad) {
        const padOsc = ctx.createOscillator();
        const padFilt = ctx.createBiquadFilter();
        const padGain = ctx.createGain();
        padOsc.type = 'triangle';
        padOsc.frequency.setValueAtTime(pf, barStart);
        padFilt.type = 'lowpass';
        padFilt.frequency.setValueAtTime(900, barStart);
        padGain.gain.setValueAtTime(0.001, barStart);
        padGain.gain.linearRampToValueAtTime(0.065, barStart + 0.25);
        padGain.gain.setValueAtTime(0.065, barStart + 1.25);
        padGain.gain.exponentialRampToValueAtTime(0.001, barStart + 1.58);
        padOsc.connect(padFilt);
        padFilt.connect(padGain);
        padGain.connect(bus);
        padOsc.start(barStart);
        padOsc.stop(barStart + 1.6);
      }

      // Pumping 8th-Note Bass (8 pulses per bar = 0.2s apart)
      for (let step = 0; step < 8; step++) {
        const t = barStart + step * 0.2;
        const bOsc = ctx.createOscillator();
        const bFilt = ctx.createBiquadFilter();
        const bGain = ctx.createGain();
        bOsc.type = 'sawtooth';
        bOsc.frequency.setValueAtTime(ch.bass, t);
        bFilt.type = 'lowpass';
        bFilt.frequency.setValueAtTime(step % 2 === 0 ? 380 : 260, t);
        bFilt.frequency.exponentialRampToValueAtTime(140, t + 0.17);
        bGain.gain.setValueAtTime(0.001, t);
        bGain.gain.linearRampToValueAtTime(step % 2 === 0 ? 0.22 : 0.14, t + 0.018);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        bOsc.connect(bFilt);
        bFilt.connect(bGain);
        bGain.connect(bus);
        bOsc.start(t);
        bOsc.stop(t + 0.19);
      }

      // Crisp Synthwave Arpeggio Lead
      ch.arp.forEach((freq, idx) => {
        const t = barStart + idx * 0.2;
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        oscA.type = 'sawtooth';
        oscB.type = 'triangle';
        oscA.frequency.setValueAtTime(freq, t);
        oscB.frequency.setValueAtTime(freq * 1.004, t);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(2200, t);
        filt.frequency.exponentialRampToValueAtTime(950, t + 0.17);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(idx === 0 || idx === 3 || idx === 6 ? 0.11 : 0.075, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscA.connect(filt);
        oscB.connect(filt);
        filt.connect(g);
        g.connect(bus);
        oscA.start(t);
        oscB.start(t);
        oscA.stop(t + 0.19);
        oscB.stop(t + 0.19);
      });

      // Four-on-the-Floor Soft Kick Pulse
      for (let beat = 0; beat < 4; beat++) {
        const kt = barStart + beat * 0.4;
        const kick = ctx.createOscillator();
        const kg = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(120, kt);
        kick.frequency.exponentialRampToValueAtTime(42, kt + 0.12);
        kg.gain.setValueAtTime(0.2, kt);
        kg.gain.exponentialRampToValueAtTime(0.001, kt + 0.14);
        kick.connect(kg);
        kg.connect(bus);
        kick.start(kt);
        kick.stop(kt + 0.15);
      }
    });
  }

  public dispose(): void {
    this.stopIntroMusic();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.initialized = false;
  }
}
