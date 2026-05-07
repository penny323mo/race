export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly compressor: DynamicsCompressorNode;

  // Engine: fundamental sawtooth + square harmonic + distortion shaper
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

  private started = false;
  private lastGear = -1;

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
    this.engineDistortion.curve = makeDistortionCurve(55);
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
  }

  public start(): void {
    if (!this.started && this.ctx.state === "suspended") {
      void this.ctx.resume();
      this.started = true;
    }
  }

  public update(speedMetersPerSecond: number, isDrifting: boolean, isAccelerating = false): void {
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
    const engineFreq = idleFreq + (peakFreq - idleFreq) * gearProgress;

    this.engineFund.frequency.setTargetAtTime(engineFreq, t, 0.035);
    this.engineHarm.frequency.setTargetAtTime(engineFreq * 2, t, 0.035);

    // Gain: low idle when coasting, louder under acceleration
    const baseGain = speed < 1 ? 0.05 : 0.09;
    const accelBoost = isAccelerating ? 0.11 * Math.min(speed / 8, 1) : 0;
    this.engineGain.gain.linearRampToValueAtTime(baseGain + accelBoost, t + 0.09);

    // Tire screech: drift or hard launch wheelspin
    const launching = isAccelerating && gear === 0 && speed < 6;
    const targetTireGain = isDrifting ? 0.30 : (launching ? 0.07 : 0);
    const fadeTime = isDrifting || launching ? 0.06 : 0.18;
    this.tireGain.gain.linearRampToValueAtTime(targetTireGain, t + fadeTime);

    // Wind: kicks in above ~55% of top speed
    const speedRatio = speed / 50;
    const windTarget = speedRatio > 0.55 ? Math.pow((speedRatio - 0.55) / 0.45, 1.4) * 0.08 : 0;
    this.windGain.gain.linearRampToValueAtTime(windTarget, t + 0.35);

    // Gear shift: brief pitch flutter on upshift / downshift
    if (gear !== this.lastGear && this.lastGear >= 0 && speed > 3) {
      this.playGearShift(gear > this.lastGear);
    }
    this.lastGear = gear;
  }

  private playGearShift(upshift: boolean): void {
    const t = this.ctx.currentTime;
    const startFreq = upshift ? 280 : 160;
    const endFreq = upshift ? 110 : 230;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + 0.07);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.09);
    osc.connect(gain).connect(this.compressor);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playImpact(): void {
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.1), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.5);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.22;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  public playLapComplete(): void {
    if (this.ctx.state === "suspended") return;
    const notes = [440, 660, 880];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + i * 0.12 + 0.12);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + i * 0.12);
      osc.stop(this.ctx.currentTime + i * 0.12 + 0.16);
    });
  }

  public playCheckpoint(): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.13, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.22);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
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
