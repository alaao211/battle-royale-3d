// Audio System - Procedural sound effects using Web Audio API
class AudioSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterVolume = 0.4;
    this.init();
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio not supported');
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // AR gunshot - rapid, sharp
  playARShot() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Noise burst for gunshot
    const duration = 0.08;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.8;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Low pass for body
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);

    // Click/crack layer
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.masterVolume * 0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  }

  // Sniper shot - loud, booming
  playSniperShot() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Heavy boom
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.masterVolume * 0.8, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);

    // Crack
    const duration = 0.15;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 15) * 1.0;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);

    // Echo/reverb tail
    const echoDuration = 0.5;
    const echoBuffer = ctx.createBuffer(1, ctx.sampleRate * echoDuration, ctx.sampleRate);
    const echoData = echoBuffer.getChannelData(0);
    for (let i = 0; i < echoData.length; i++) {
      const t = i / echoData.length;
      echoData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 6) * 0.3;
    }
    const echoSource = ctx.createBufferSource();
    echoSource.buffer = echoBuffer;
    const echoGain = ctx.createGain();
    echoGain.gain.setValueAtTime(this.masterVolume * 0.3, now + 0.05);
    echoGain.gain.exponentialRampToValueAtTime(0.001, now + echoDuration);
    echoSource.connect(echoGain);
    echoGain.connect(ctx.destination);
    echoSource.start(now + 0.05);
  }

  // Shotgun - wide, heavy blast
  playShotgunShot() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Heavy noise blast
    const duration = 0.2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 1.0;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);

    // Low thud
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.15);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.masterVolume * 0.6, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // Play weapon shot by type
  playShot(weaponType) {
    switch (weaponType) {
      case 'ar': this.playARShot(); break;
      case 'sniper': this.playSniperShot(); break;
      case 'shotgun': this.playShotgunShot(); break;
    }
  }

  // Explosion - deep boom with debris
  playExplosion() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep boom
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(15, now + 0.8);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(this.masterVolume * 1.0, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);

    // Debris noise
    const duration = 1.0;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.6;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);
    filter.frequency.exponentialRampToValueAtTime(200, now + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);

    // Secondary boom
    const osc2 = ctx.createOscillator();
    osc2.frequency.setValueAtTime(40, now + 0.05);
    osc2.frequency.exponentialRampToValueAtTime(10, now + 0.5);
    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(this.masterVolume * 0.5, now + 0.05);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc2.connect(osc2Gain);
    osc2Gain.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.6);
  }

  // Grenade throw whoosh
  playGrenadeThrow() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.masterVolume * 0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Hit marker sound
  playHitMarker() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.setValueAtTime(2200, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Player hurt
  playHurt() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Thud
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Reload click
  playReload() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Click 1
    const osc1 = ctx.createOscillator();
    osc1.frequency.setValueAtTime(2000, now);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(this.masterVolume * 0.3, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.03);

    // Click 2
    const osc2 = ctx.createOscillator();
    osc2.frequency.setValueAtTime(1500, now + 0.2);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(this.masterVolume * 0.3, now + 0.2);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.23);

    // Slide sound
    const duration = 0.15;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 20) * 0.2;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.2, now + 0.1);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(now + 0.1);
  }

  // Weapon switch click
  playWeaponSwitch() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(900, now + 0.04);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Kill sound
  playKill() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Ding 1
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(this.masterVolume * 0.4, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(g1);
    g1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Ding 2 higher
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1320, now + 0.1);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(this.masterVolume * 0.4, now + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);
  }

  // Zone warning buzz
  playZoneWarning() {
    if (!this.enabled) return;
    this.resume();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.masterVolume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }
}
