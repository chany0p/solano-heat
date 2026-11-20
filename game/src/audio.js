// All sound is synthesized with WebAudio — no audio files. A tiny bassline
// loop, an engine hum that follows speed, two-tone police sirens, gunshots,
// pickup chimes and mission jingles. Created on the first user gesture.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicOn = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this._beat = 0;
  }

  /** Must be called from a user gesture at least once. Safe to call often. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    // Engine hum: two detuned saws through a lowpass, gain follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const engineOsc2 = this.ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 58;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp);
    engineOsc2.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    engineOsc2.start();
    this.engineOsc2 = engineOsc2;
    // Siren: a square wave that alternates between two notes.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);
    this.sirenOsc.start();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain ? null : null;
    if (this.engineGain) this.engineGain.gain.value = m ? 0 : this._engineLevel;
    if (this.sirenGain) this.sirenGain.gain.value = m ? 0 : (this._sirenOn ? 0.05 : 0);
  }

  /** Engine hum level 0..1 and pitch follow the car's speed. */
  engine(level, speedNorm) {
    if (!this.ctx || this.muted) return;
    this._engineLevel = level * 0.09;
    this.engineGain.gain.setTargetAtTime(this._engineLevel, this.ctx.currentTime, 0.08);
    const f = 50 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.02, this.ctx.currentTime, 0.08);
  }
  engineOff() {
    if (!this.ctx) return;
    this._engineLevel = 0;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  /** Two-tone siren on/off. */
  siren(on) {
    if (!this.ctx) return;
    this._sirenOn = on;
    if (on && !this.sirenTimer) {
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (this.muted) return;
        high = !high;
        this.sirenOsc.frequency.value = high ? 880 : 660;
        this.sirenGain.gain.value = 0.045;
      }, 420);
    } else if (!on && this.sirenTimer) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenGain.gain.value = 0;
    }
  }

  _tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(this.ctx.destination);
    src.start();
  }

  shot() { this._noise(0.14, 0.5, 1800); this._tone(160, 0.08, 'square', 0.25); }
  punch() { this._noise(0.08, 0.3, 900); }
  pickup() { this._tone(880, 0.12, 'sine', 0.25); this._tone(1318, 0.18, 'sine', 0.22, 0.09); }
  cash() { this._tone(1046, 0.1, 'sine', 0.25); this._tone(1568, 0.16, 'sine', 0.22, 0.08); }
  jingle() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.28, i * 0.13));
  }
  fail() { this._tone(220, 0.3, 'sawtooth', 0.22); this._tone(174, 0.45, 'sawtooth', 0.22, 0.22); }
  crash() { this._noise(0.35, 0.6, 700); }
  explosion() { this._noise(0.9, 0.9, 400); this._tone(60, 0.7, 'sine', 0.5); }
  door() { this._noise(0.06, 0.2, 1200); }
  busted() { this._tone(392, 0.25, 'square', 0.2); this._tone(311, 0.4, 'square', 0.2, 0.25); }

  /** Simple bassline loop: A minor groove, one note per beat at 112 BPM. */
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.musicOn = true;
    const bass = [55, 55, 65.41, 55, 49, 55, 82.41, 73.42];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.musicOn) return;
      const f = bass[this.musicStep % bass.length];
      this.musicStep++;
      this._tone(f, 0.42, 'triangle', 0.11);
      if (this.musicStep % 2 === 0) this._tone(f * 2, 0.1, 'sine', 0.05);
    }, 535);
  }
  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
