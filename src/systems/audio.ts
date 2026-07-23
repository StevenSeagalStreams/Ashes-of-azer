// Corruption music layer (Milestone 3). The game has no audio assets and
// CLAUDE.md forbids fetching copyrighted sound, so this is a fully original,
// self-contained ambient drone *synthesized* in code via the Web Audio API. It
// stays silent at zero corruption and swells — louder, more dissonant, brighter
// and more restless — as corruption climbs. No files, nothing to license.
//
// The param mapping is pure + unit-tested; the AudioContext plumbing is wrapped
// so a headless/blocked environment (no audio) simply no-ops instead of throwing.

export interface AudioParams {
  master: number; // overall volume (0 = silent)
  diss: number; // dissonant-oscillator volume (unease creeps in past Tainted)
  cutoff: number; // lowpass cutoff Hz (brighter/harsher when high)
  wobbleHz: number; // filter LFO rate (slow breath → restless pulse)
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Pure corruption → audio parameters. Silent at 0; swells and sours with tier. */
export function corruptionAudioParams(corruption: number): AudioParams {
  const t = clamp01(corruption / 100);
  return {
    master: t * 0.11, // subtle ambience even at max — never drowns the game
    diss: Math.max(0, t - 0.25) * 0.1, // dissonance from ~Tainted upward
    cutoff: 260 + t * 1200, // 260Hz → 1460Hz
    wobbleHz: 0.15 + t * 1.1, // slow drift → faster unease
  };
}

/**
 * Singleton ambient synth. All Web Audio calls are guarded — if the context
 * can't be created (SSR, headless, autoplay-blocked before a gesture), every
 * method is a safe no-op and the game is unaffected.
 */
export class CorruptionAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dissGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private readonly oscs: OscillatorNode[] = [];
  private muted = false;
  private started = false;
  private lastCorruption = 0;

  /** Lazily builds the audio graph + starts the (initially inaudible) drone. */
  private ensureStarted(): void {
    if (this.started) return;
    const Ctx = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.connect(master);
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.6;
      droneGain.connect(filter);
      const dissGain = ctx.createGain();
      dissGain.gain.value = 0;
      dissGain.connect(filter);

      // A low root + its fifth (calm), plus a slightly detuned saw for the
      // dissonant beating that fades in with corruption.
      const mk = (type: OscillatorType, freq: number, dest: GainNode): void => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.connect(dest);
        o.start();
        this.oscs.push(o);
      };
      mk('sine', 55, droneGain); // A1
      mk('sine', 82.4, droneGain); // E2 (a fifth)
      mk('sawtooth', 58.3, dissGain); // detuned — beats against the root

      // Slow LFO wobbling the filter cutoff for movement.
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 120;
      lfo.connect(lfoDepth);
      lfoDepth.connect(filter.frequency);
      lfo.start();

      // droneGain + lfoDepth stay alive via their graph connections; only the
      // nodes read by apply() need to be kept as fields.
      this.ctx = ctx;
      this.master = master;
      this.filter = filter;
      this.dissGain = dissGain;
      this.lfo = lfo;
      this.started = true;
      this.apply(this.lastCorruption);
    } catch {
      this.started = false; // audio unavailable — stay a no-op
    }
  }

  /** Resume the context after a user gesture (browser autoplay policy). */
  resume(): void {
    this.ensureStarted();
    try {
      void this.ctx?.resume();
    } catch {
      /* ignore */
    }
  }

  /** Update the drone to a corruption level (ramped, so changes are smooth). */
  setCorruption(corruption: number): void {
    this.lastCorruption = corruption;
    this.apply(corruption);
  }

  private apply(corruption: number): void {
    if (!this.ctx || !this.master || !this.filter || !this.dissGain || !this.lfo) return;
    const p = corruptionAudioParams(corruption);
    const now = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number): void => {
      param.setTargetAtTime(value, now, 0.4);
    };
    ramp(this.master.gain, this.muted ? 0 : p.master);
    ramp(this.dissGain.gain, p.diss);
    ramp(this.filter.frequency, p.cutoff);
    try {
      this.lfo.frequency.setTargetAtTime(p.wobbleHz, now, 0.4);
    } catch {
      /* ignore */
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.apply(this.lastCorruption);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  destroy(): void {
    try {
      for (const o of this.oscs) o.stop();
      this.lfo?.stop();
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
  }
}

// Module singleton so the drone persists across zone changes (scene restarts)
// instead of spawning a new AudioContext each load.
let instance: CorruptionAudio | null = null;
export const getCorruptionAudio = (): CorruptionAudio => (instance ??= new CorruptionAudio());
