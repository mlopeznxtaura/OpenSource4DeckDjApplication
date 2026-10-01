const EQ_FREQS = [60, 170, 350, 1000, 3500, 10000];

export type DeckId = 0 | 1 | 2 | 3;

export class DeckEngine {
  readonly id: DeckId;
  readonly label: string;
  private ctx: AudioContext;
  private trimGain: GainNode;
  private eqNodes: BiquadFilterNode[];
  private gain: GainNode;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private pausedAt = 0;
  private playing = false;
  private trimRate = 1;
  private volume = 0.75;
  private crossfadeWeight = 1;
  private peaks: number[] = [];

  constructor(ctx: AudioContext, id: DeckId, label: string, destination: AudioNode) {
    this.id = id;
    this.label = label;
    this.ctx = ctx;
    this.trimGain = ctx.createGain();
    this.eqNodes = EQ_FREQS.map((freq) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = 0;
      return f;
    });
    this.gain = ctx.createGain();
    this.trimGain.connect(this.eqNodes[0]);
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    this.eqNodes[this.eqNodes.length - 1].connect(this.gain);
    this.gain.connect(destination);
    this.gain.gain.value = this.volume;
  }

  getPeaks() {
    return this.peaks;
  }

  getDuration() {
    return this.buffer?.duration ?? 0;
  }

  getCurrentTime() {
    if (!this.buffer) return 0;
    if (this.playing) {
      return (this.ctx.currentTime - this.startedAt) * this.trimRate + this.pausedAt;
    }
    return this.pausedAt;
  }

  isPlaying() {
    return this.playing;
  }

  getFileName() {
    return this.buffer ? 'loaded' : '';
  }

  async loadFile(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.ctx.decodeAudioData(arrayBuffer.slice(0));
    this.peaks = computePeaks(this.buffer);
    this.stop();
    return file.name;
  }

  play() {
    if (!this.buffer || this.playing) return;
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.trimRate;
    this.source.connect(this.trimGain);
    const offset = this.pausedAt;
    this.source.start(0, offset);
    this.startedAt = this.ctx.currentTime - offset / this.trimRate;
    this.playing = true;
    this.source.onended = () => {
      if (this.playing) this.stop();
    };
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.getCurrentTime();
    this.source?.stop();
    this.source = null;
    this.playing = false;
  }

  stop() {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source = null;
    }
    this.playing = false;
    this.pausedAt = 0;
    this.startedAt = 0;
  }

  seek(deltaSec: number) {
    const dur = this.getDuration();
    const next = Math.max(0, Math.min(dur, this.getCurrentTime() + deltaSec));
    if (this.playing) {
      this.pausedAt = next;
      this.source?.stop();
      this.source = null;
      this.playing = false;
      this.play();
    } else {
      this.pausedAt = next;
    }
  }

  setVolume(v: number) {
    this.volume = v;
    this.gain.gain.value = v * this.crossfadeWeight;
  }

  setTrim(rate: number) {
    this.trimRate = rate;
    if (this.source) this.source.playbackRate.value = rate;
  }

  setEqBand(index: number, gainDb: number) {
    if (this.eqNodes[index]) this.eqNodes[index].gain.value = gainDb;
  }

  setCrossfadeWeight(weight: number) {
    this.crossfadeWeight = weight;
    this.gain.gain.value = this.volume * weight;
  }
}

function computePeaks(buffer: AudioBuffer, bins = 120): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.floor(data.length / bins);
  const peaks: number[] = [];
  for (let i = 0; i < bins; i++) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(data[start + j] ?? 0);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  return peaks;
}

export class MixerEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private decks: DeckEngine[] = [];
  private masterVolume = 0.75;
  private crossfade = 0.5;

  async ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.masterVolume;
      this.decks = [0, 1, 2, 3].map((i) =>
        new DeckEngine(this.ctx!, i as DeckId, ['A', 'B', 'C', 'D'][i], this.masterGain!)
      );
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  getDecks() {
    return this.decks;
  }

  setMasterVolume(v: number) {
    this.masterVolume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
    this.applyCrossfade();
  }

  setCrossfade(v: number) {
    this.crossfade = v;
    this.applyCrossfade();
  }

  private applyCrossfade() {
    if (!this.decks.length) return;
    // Crossfade between deck pairs A↔B and C↔D
    const t = this.crossfade;
    const weights = [
      1 - t * 0.5,
      0.5 + t * 0.5,
      1 - t * 0.5,
      0.5 + t * 0.5,
    ];
    this.decks.forEach((d, i) => d.setCrossfadeWeight(weights[i]));
  }
}
