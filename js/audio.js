export class MachineAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.motor = null;
    this.enabled = false;
  }

  async setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stopMotor();
      return;
    }
    this.context ||= new AudioContext();
    await this.context.resume();
    this.master ||= this.createMaster();
    this.startMotor();
  }

  createMaster() {
    const gain = this.context.createGain();
    gain.gain.value = 0.22;
    gain.connect(this.context.destination);
    return gain;
  }

  startMotor() {
    if (!this.enabled || this.motor) return;
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 34;
    filter.type = 'lowpass';
    filter.frequency.value = 120;
    gain.gain.value = 0.045;
    oscillator.connect(filter).connect(gain).connect(this.master);
    oscillator.start();
    this.motor = { oscillator, gain };
  }

  stopMotor() {
    if (!this.motor) return;
    this.motor.oscillator.stop();
    this.motor = null;
  }

  impact(item, intensity = 1) {
    if (!this.enabled) return;
    const now = this.context.currentTime;
    const length = Math.floor(this.context.sampleRate * 0.48);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320 + item.sound * 1300, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.45);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(Math.min(0.8, 0.18 * intensity), now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  load(amount = 1) {
    if (!this.motor) return;
    const now = this.context.currentTime;
    this.motor.oscillator.frequency.cancelScheduledValues(now);
    this.motor.oscillator.frequency.setValueAtTime(34, now);
    this.motor.oscillator.frequency.linearRampToValueAtTime(23, now + 0.18);
    this.motor.oscillator.frequency.linearRampToValueAtTime(34, now + 0.8 + amount * 0.15);
  }
}
