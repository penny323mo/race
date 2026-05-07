export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly engineOsc: OscillatorNode;
  private readonly engineGain: GainNode;
  private readonly tireOsc: OscillatorNode;
  private readonly tireGain: GainNode;
  private started = false;

  public constructor() {
    this.ctx = new AudioContext();

    // Engine: sawtooth oscillator, frequency tracks speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 80;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Tire noise: white noise approximated with a high-freq sawtooth
    this.tireOsc = this.ctx.createOscillator();
    this.tireOsc.type = "sawtooth";
    this.tireOsc.frequency.value = 800;
    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.value = 0;

    // Add bandpass filter to shape tire noise
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.8;
    this.tireOsc.connect(filter);
    filter.connect(this.tireGain);
    this.tireGain.connect(this.ctx.destination);
    this.tireOsc.start();
  }

  public start(): void {
    if (!this.started && this.ctx.state === "suspended") {
      void this.ctx.resume();
      this.started = true;
    }
  }

  public update(speedMetersPerSecond: number, isDrifting: boolean): void {
    const speed = Math.abs(speedMetersPerSecond);
    const t = this.ctx.currentTime;

    // Engine frequency: 80 Hz idle → 260 Hz at max speed
    const targetFreq = 80 + speed * 3.2;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, t, 0.05);

    // Engine gain: 0 at rest, 0.08 at speed
    const targetGain = speed > 0.5 ? 0.08 : 0.0;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.1);

    // Tire screech: ramp up when drifting
    const tireTarget = isDrifting ? 0.22 : 0.0;
    this.tireGain.gain.setTargetAtTime(tireTarget, t, isDrifting ? 0.04 : 0.25);
  }

  public playImpact(): void {
    // Short white-noise burst for wall collision
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.08), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.18;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start();
  }

  public playCheckpoint(): void {
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(880, this.ctx.currentTime + 0.15);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
