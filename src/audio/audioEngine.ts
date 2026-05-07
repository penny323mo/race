export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  // Engine: sub-bass sine + fundamental sawtooth + square harmonic + distortion shaper
  private readonly engineSub: OscillatorNode;
  private readonly engineSubGain: GainNode;
  private readonly engineFund: OscillatorNode;
  private readonly engineHarm: OscillatorNode;
  private readonly engineDistortion: WaveShaperNode;
  private readonly engineGain: GainNode;

  // Tire screech: looped white-noise buffer through bandpass
  private readonly tireSource: AudioBufferSourceNode;
  private readonly tireFilter: BiquadFilterNode;
  private readonly tireGain: GainNode;

  // Wind: high-pass filtered noise at high speed
  private readonly windSource: AudioBufferSourceNode;
  private readonly windHighpass: BiquadFilterNode;
  private readonly windGain: GainNode;

  // Road rumble: low-frequency bandpass noise, physical texture at speed
  private readonly rumbleSource: AudioBufferSourceNode;
  private readonly rumbleFilter: BiquadFilterNode;
  private readonly rumbleGain: GainNode;

  // Turbo whistle: high-frequency sine that builds with speed under boost
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;

  private started = false;
  private lastGear = -1;
  private wasAccelerating = false;
  private exhaustPopCooldown = 0;
  private limiterCooldown = 0;

  public constructor() {
    this.ctx = new AudioContext();

    // Master compressor keeps everything balanced
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 8;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.18;
    this.compressor.connect(this.ctx.destination);

    // Sub-bass: pure sine at half the fundamental, adds body/weight
    this.engineSub = this.ctx.createOscillator();
    this.engineSub.type = "sine";
    this.engineSub.frequency.value = 40;
    this.engineSubGain = this.ctx.createGain();
    this.engineSubGain.gain.value = 0;
    this.engineSub.connect(this.engineSubGain);
    this.engineSubGain.connect(this.compressor);
    this.engineSub.start();

    // Engine fundamental (sawtooth, rich harmonics)
    this.engineFund = this.ctx.createOscillator();
    this.engineFund.type = "sawtooth";
    this.engineFund.frequency.value = 80;

    // Engine harmonic doubles the fundamental (adds punch / growl)
    this.engineHarm = this.ctx.createOscillator();
    this.engineHarm.type = "square";
    this.engineHarm.frequency.value = 160;

    // Soft-clip waveshaper for analogue distortion character
    this.engineDistortion = this.ctx.createWaveShaper();
    this.engineDistortion.curve = makeDistortionCurve(72);
    this.engineDistortion.oversample = "2x";

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.28;

    this.engineFund.connect(this.engineDistortion);
    this.engineHarm.connect(harmGain);
    harmGain.connect(this.engineDistortion);
    this.engineDistortion.connect(this.engineGain);
    this.engineGain.connect(this.compressor);
    this.engineFund.start();
    this.engineHarm.start();

    // Tire screech: true white-noise buffer (2 s looped) → bandpass
    const sampleRate = this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;

    this.tireSource = this.ctx.createBufferSource();
    this.tireSource.buffer = noiseBuffer;
    this.tireSource.loop = true;

    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = "bandpass";
    this.tireFilter.frequency.value = 1600;
    this.tireFilter.Q.value = 1.4;

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.value = 0;

    this.tireSource.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.compressor);
    this.tireSource.start();

    // Wind: same noise bank, high-pass filtered for rushing-air sensation
    const windBuffer = this.ctx.createBuffer(1, sampleRate * 2, sampleRate);
    const windData = windBuffer.getChannelData(0);
    for (let i = 0; i < windData.length; i++) windData[i] = Math.random() * 2 - 1;

    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = windBuffer;
    this.windSource.loop = true;

    this.windHighpass = this.ctx.createBiquadFilter();
    this.windHighpass.type = "highpass";
    this.windHighpass.frequency.value = 2800;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;

    this.windSource.connect(this.windHighpass);
    this.windHighpass.connect(this.windGain);
    this.windGain.connect(this.compressor);
    this.windSource.start();

    // Road rumble: bandpass noise centred ~85 Hz — felt more than heard
    const rumbleBuffer = this.ctx.createBuffer(1, sampleRate * 3, sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    for (let i = 0; i < rumbleData.length; i++) rumbleData[i] = Math.random() * 2 - 1;
    this.rumbleSource = this.ctx.createBufferSource();
    this.rumbleSource.buffer = rumbleBuffer;
    this.rumbleSource.loop = true;
    this.rumbleFilter = this.ctx.createBiquadFilter();
    this.rumbleFilter.type = "bandpass";
    this.rumbleFilter.frequency.value = 85;
    this.rumbleFilter.Q.value = 0.7;
    this.rumbleGain = this.ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumbleSource.connect(this.rumbleFilter);
    this.rumbleFilter.connect(this.rumbleGain);
    this.rumbleGain.connect(this.compressor);
    this.rumbleSource.start();

    // Turbo whistle: narrow sine at ~14× engine fundamental, audible above 40% throttle
    this.turboOsc = this.ctx.createOscillator();
    this.turboOsc.type = "sine";
    this.turboOsc.frequency.value = 1120;
    this.turboGain = this.ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain);
    this.turboGain.connect(this.compressor);
    this.turboOsc.start();
  }

  public start(): void {
    if (!this.started && this.ctx.state === "suspended") {
      void this.ctx.resume().then(() => {
        // Fade engine in from silence to avoid a jarring pop on first unlock
        const t = this.ctx.currentTime;
        this.engineGain.gain.setValueAtTime(0, t);
        this.engineGain.gain.linearRampToValueAtTime(0.05, t + 0.55);
        this.engineSubGain.gain.setValueAtTime(0, t);
        this.engineSubGain.gain.linearRampToValueAtTime(0.03, t + 0.65);
      });
      this.started = true;
    }
  }

  // fraction 0=idle, 1=held at launch RPM — called each frame during countdown
  public setCountdownRev(fraction: number): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    const revFreq = 80 + fraction * 185;          // idle 80Hz → launch ~265Hz
    const revGain = 0.05 + fraction * 0.13;
    const subGain = 0.03 + fraction * 0.055;
    this.engineFund.frequency.setTargetAtTime(revFreq, t, 0.08);
    this.engineHarm.frequency.setTargetAtTime(revFreq * 2, t, 0.08);
    this.engineSub.frequency.setTargetAtTime(revFreq * 0.5, t, 0.12);
    this.engineGain.gain.setTargetAtTime(revGain, t, 0.1);
    this.engineSubGain.gain.setTargetAtTime(subGain, t, 0.14);
  }

  public update(speedMetersPerSecond: number, isDrifting: boolean, isAccelerating = false, lateralSpeed = 0, deltaSeconds = 0.016, isBraking = false, isReversing = false, isNitroActive = false): void {
    const speed = Math.abs(speedMetersPerSecond);
    const t = this.ctx.currentTime;

    // Simulate gear-shift RPM: speed is divided into 4 gear bands, each ramps 80→260 Hz
    const topSpeed = 50;
    const numGears = 4;
    const speedPerGear = topSpeed / numGears;
    const gear = Math.min(numGears - 1, Math.floor(speed / speedPerGear));
    const gearProgress = (speed % speedPerGear) / speedPerGear;
    const idleFreq = 75 + gear * 14;
    const peakFreq = 230 + gear * 22;
    let engineFreq = idleFreq + (peakFreq - idleFreq) * gearProgress;
    // Reverse: pitch engine down 20% — sounds strained and lower
    if (isReversing) engineFreq *= 0.80;
    // Nitro: pitch up 18% — engine screams under boost
    if (isNitroActive) engineFreq *= 1.18;

    // Dual-LFO idle: two inharmonic wobbles create organic engine lumpiness
    const idleStrength = speed < 8 ? (1 - speed / 8) : 0;
    const idleLfo = idleStrength > 0
      ? (Math.sin(t * 2.2 * Math.PI * 2) * 3.0 + Math.sin(t * 3.7 * Math.PI * 2) * 1.5) * idleStrength
      : 0;
    this.engineFund.frequency.setTargetAtTime(engineFreq + idleLfo, t, 0.035);
    this.engineHarm.frequency.setTargetAtTime((engineFreq + idleLfo) * 2, t, 0.035);
    this.engineSub.frequency.setTargetAtTime((engineFreq + idleLfo) * 0.5, t, 0.055);

    // Gain: low idle when coasting, louder under acceleration; reverse is slightly louder
    const baseGain = speed < 1 ? 0.05 : 0.09;
    const accelBoost = isAccelerating ? 0.11 * Math.min(speed / 8, 1) : 0;
    const reverseBoost = isReversing ? 0.04 : 0;
    const nitroBoost = isNitroActive ? 0.06 : 0;
    this.engineGain.gain.linearRampToValueAtTime(baseGain + accelBoost + reverseBoost + nitroBoost, t + 0.09);

    // Tire screech: drift, hard launch, lateral cornering slip, or hard braking
    const launching = isAccelerating && gear === 0 && speed < 6;
    const cornerSlip = Math.min(1, lateralSpeed / 14);
    const brakeScrub = (isBraking && !isDrifting && speed > 14) ? Math.min(1, (speed - 14) / 18) * 0.22 : 0;
    const targetTireGain = isDrifting ? 0.30 : (launching ? 0.07 : Math.max(cornerSlip * 0.14, brakeScrub));
    const fadeTime = isDrifting || launching ? 0.06 : 0.18;
    this.tireGain.gain.linearRampToValueAtTime(targetTireGain, t + fadeTime);
    // Frequency: drift/slip rises 1200→2600Hz; brake squeal sits high at 2800Hz
    const slipRatio = isDrifting ? Math.min(1, lateralSpeed / 20) : cornerSlip;
    const tireFreqTarget = (isBraking && !isDrifting && brakeScrub > 0.02)
      ? 2800
      : 1200 + slipRatio * 1400;
    this.tireFilter.frequency.setTargetAtTime(tireFreqTarget, t, 0.06);

    // Exhaust pops + BOV blow-off: throttle lift at speed fires crackling pops, then BOV hiss
    this.exhaustPopCooldown = Math.max(0, this.exhaustPopCooldown - deltaSeconds);
    if (this.wasAccelerating && !isAccelerating && speed > 22 && this.exhaustPopCooldown <= 0) {
      const popCount = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < popCount; i++) {
        this.scheduleExhaustPop(t + i * (0.06 + Math.random() * 0.05));
      }
      this.scheduleBovBurst(t + 0.05);
      this.exhaustPopCooldown = 0.35 + Math.random() * 0.25;
    }
    this.wasAccelerating = isAccelerating;

    // Wind: kicks in above ~55% of top speed
    const speedRatio = speed / 50;
    const windTarget = speedRatio > 0.55 ? Math.pow((speedRatio - 0.55) / 0.45, 1.4) * 0.08 : 0;
    this.windGain.gain.linearRampToValueAtTime(windTarget, t + 0.35);

    // Road rumble: low-pass texture, linear with speed, felt as much as heard
    const rumbleTarget = speedRatio > 0.05 ? Math.pow(speedRatio, 0.6) * 0.048 : 0;
    this.rumbleGain.gain.linearRampToValueAtTime(rumbleTarget, t + 0.25);

    // Sub-bass: richer at idle, pulses under acceleration
    const subIdle = speed < 2 ? 0.055 : 0.06 + speedRatio * 0.055;
    const subTarget = subIdle * (isAccelerating ? 1.28 : 0.82);
    this.engineSubGain.gain.linearRampToValueAtTime(subTarget, t + 0.12);

    // Turbo/nitro: normal whistle at speed; during nitro, locked high-frequency scream
    const normalTurboTarget = isAccelerating ? Math.pow(Math.max(0, speedRatio - 0.18) / 0.82, 1.5) * 0.065 : 0;
    const turboTarget = isNitroActive ? 0.16 : normalTurboTarget;
    const turboFreqTarget = isNitroActive ? 3400 : (engineFreq * 8 + 400);
    this.turboOsc.frequency.setTargetAtTime(turboFreqTarget, t, isNitroActive ? 0.04 : 0.18);
    this.turboGain.gain.linearRampToValueAtTime(turboTarget, t + (isNitroActive ? 0.05 : isAccelerating ? 0.35 : 0.10));

    // Rev limiter: at the top of each gear band, crackle and briefly cut engine note
    this.limiterCooldown = Math.max(0, this.limiterCooldown - deltaSeconds);
    if (isAccelerating && gearProgress > 0.91 && this.limiterCooldown <= 0) {
      this.scheduleExhaustPop(t);
      if (Math.random() < 0.55) this.scheduleExhaustPop(t + 0.04 + Math.random() * 0.03);
      this.engineGain.gain.cancelScheduledValues(t);
      this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, t);
      this.engineGain.gain.linearRampToValueAtTime(0.012, t + 0.022);
      this.engineGain.gain.linearRampToValueAtTime(baseGain + accelBoost, t + 0.09);
      this.limiterCooldown = 0.22 + Math.random() * 0.12;
    }

    // Gear shift: brief pitch flutter on upshift / downshift
    if (gear !== this.lastGear && this.lastGear >= 0 && speed > 3) {
      this.playGearShift(gear > this.lastGear);
    }
    this.lastGear = gear;
  }

  private scheduleExhaustPop(when: number): void {
    const dur = 0.032 + Math.random() * 0.024;
    const buf = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.6);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 220 + Math.random() * 120;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11 + Math.random() * 0.07, when);
    gain.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(filter).connect(gain).connect(this.compressor);
    src.start(when);
    src.stop(when + dur + 0.01);
  }

  private scheduleBovBurst(when: number): void {
    // Blow-off valve: descending noise whoosh simulating turbo pressure release
    const dur = 0.18 + Math.random() * 0.06;
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.45);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3200, when);
    filter.frequency.linearRampToValueAtTime(800, when + dur);
    filter.Q.value = 2.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, when);
    gain.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(filter).connect(gain).connect(this.compressor);
    src.start(when);
    src.stop(when + dur + 0.02);
  }

  private playGearShift(upshift: boolean): void {
    const t = this.ctx.currentTime;
    // Tonal component: pitch sweep
    const startFreq = upshift ? 340 : 170;
    const endFreq = upshift ? 85 : 290;
    const osc = this.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.09);
    const toneGain = this.ctx.createGain();
    toneGain.gain.setValueAtTime(0.065, t);
    toneGain.gain.linearRampToValueAtTime(0, t + 0.12);
    osc.connect(toneGain).connect(this.compressor);
    osc.start(t);
    osc.stop(t + 0.14);

    // Mechanical thunk: short noise burst at the clunk point
    const sr = this.ctx.sampleRate;
    const dur = 0.045;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = upshift ? 280 : 380;
    const thunkGain = this.ctx.createGain();
    thunkGain.gain.value = 0.08;
    src.connect(lpf).connect(thunkGain).connect(this.compressor);
    src.start(t);

    // Fuel-cut dip
    this.engineGain.gain.cancelScheduledValues(t);
    this.engineGain.gain.setValueAtTime(this.engineGain.gain.value, t);
    this.engineGain.gain.linearRampToValueAtTime(0.012, t + 0.025);
    this.engineGain.gain.linearRampToValueAtTime(0.09, t + 0.13);
  }

  public playCountdownBeep(isGo: boolean): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const t = this.ctx.currentTime;
    const freq = isGo ? 880 : 440;
    const duration = isGo ? 0.35 : 0.12;
    const vol = isGo ? 0.22 : 0.14;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (isGo) osc.frequency.linearRampToValueAtTime(1100, t + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  public playDriftEntry(): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    // Sharp tire screech: noise burst filtered to a narrow high-frequency band
    const sr = this.ctx.sampleRate;
    const dur = 0.14;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.35);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = "bandpass";
    hpf.frequency.setValueAtTime(3400, t);
    hpf.frequency.linearRampToValueAtTime(1800, t + dur);
    hpf.Q.value = 3.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(hpf).connect(gain).connect(this.compressor);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  public playImpact(): void {
    const t = this.ctx.currentTime;

    // Metallic ring: pitched oscillator with rapid exponential decay
    const ringOsc = this.ctx.createOscillator();
    ringOsc.type = "sine";
    ringOsc.frequency.setValueAtTime(300 + Math.random() * 180, t);
    ringOsc.frequency.exponentialRampToValueAtTime(75, t + 0.14);
    const ringGain = this.ctx.createGain();
    ringGain.gain.setValueAtTime(0.20, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    ringOsc.connect(ringGain).connect(this.compressor);
    ringOsc.start(t);
    ringOsc.stop(t + 0.25);

    // Low body thud: noise burst through heavy lowpass
    const sr = this.ctx.sampleRate;
    const dur = 0.09;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 160;
    const thudGain = this.ctx.createGain();
    thudGain.gain.value = 0.30;
    src.connect(lpf).connect(thudGain).connect(this.compressor);
    src.start(t);
  }

  public playJumpLaunch(): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    // Rising whoosh: noise burst through ascending bandpass
    const sr = this.ctx.sampleRate;
    const dur = 0.22;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 0.3) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bpf = this.ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.setValueAtTime(600, t);
    bpf.frequency.exponentialRampToValueAtTime(3200, t + dur);
    bpf.Q.value = 2.0;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bpf).connect(gain).connect(this.compressor);
    src.start(t);
    src.stop(t + dur + 0.02);

    // Sub-bass thump on launch
    const thumpOsc = this.ctx.createOscillator();
    thumpOsc.type = "sine";
    thumpOsc.frequency.setValueAtTime(80, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(30, t + 0.12);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.28, t);
    thumpGain.gain.linearRampToValueAtTime(0, t + 0.14);
    thumpOsc.connect(thumpGain).connect(this.compressor);
    thumpOsc.start(t);
    thumpOsc.stop(t + 0.16);
  }

  public playLandingThump(): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    // Heavy body slam: sub-bass thud + brief noise
    const thumpOsc = this.ctx.createOscillator();
    thumpOsc.type = "sine";
    thumpOsc.frequency.setValueAtTime(55, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(22, t + 0.18);
    const thumpGain = this.ctx.createGain();
    thumpGain.gain.setValueAtTime(0.35, t);
    thumpGain.gain.linearRampToValueAtTime(0, t + 0.22);
    thumpOsc.connect(thumpGain).connect(this.compressor);
    thumpOsc.start(t);
    thumpOsc.stop(t + 0.25);

    // Surface crunch layer
    const sr = this.ctx.sampleRate;
    const dur = 0.08;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.5);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const lpf = this.ctx.createBiquadFilter();
    lpf.type = "lowpass";
    lpf.frequency.value = 280;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(lpf).connect(gain).connect(this.compressor);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  public playLapComplete(): void {
    if (this.ctx.state === "suspended") return;
    const notes = [440, 660, 880];
    const t = this.ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, t + i * 0.14);
      gain.gain.linearRampToValueAtTime(0, t + i * 0.14 + 0.18);
      osc.connect(gain).connect(this.compressor);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.22);
    });
  }

  public playCheckpoint(): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.linearRampToValueAtTime(880, t + 0.12);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.20);
    osc.connect(gain).connect(this.compressor);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  public playNitroStart(): void {
    if (this.ctx.state === "suspended") return;
    const t = this.ctx.currentTime;
    // Ascending electric whine: sine sweeps from 800 → 3200 Hz with harmonics
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.20);
    osc.connect(gain).connect(this.compressor);
    osc.start(t);
    osc.stop(t + 0.22);

    // Boost hiss: short noise burst filtered around 3kHz
    const sr = this.ctx.sampleRate;
    const dur = 0.10;
    const buf = this.ctx.createBuffer(1, Math.ceil(sr * dur), sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 0.5);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bpf = this.ctx.createBiquadFilter();
    bpf.type = "bandpass";
    bpf.frequency.value = 3000;
    bpf.Q.value = 1.8;
    const hissGain = this.ctx.createGain();
    hissGain.gain.setValueAtTime(0.08, t);
    hissGain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(bpf).connect(hissGain).connect(this.compressor);
    src.start(t);
    src.stop(t + dur + 0.01);
  }

  public dispose(): void {
    for (const node of [
      this.engineSub,
      this.engineFund,
      this.engineHarm,
      this.tireSource,
      this.windSource,
      this.rumbleSource,
      this.turboOsc
    ]) {
      try {
        node.stop();
      } catch {
        // Already stopped or never started.
      }
    }

    if (this.ctx.state !== "closed") {
      void this.ctx.close();
    }
  }
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 512;
  const buf = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buf);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}
