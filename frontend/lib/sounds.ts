// Web Audio API sound synthesis — no audio files needed.
// All sounds are generated procedurally using oscillators and noise.
// AudioContext is created lazily on first user interaction (browser requirement).

export type SoundType =
  | "draw"      // card slides from deck to hand
  | "play"      // card placed onto a stack
  | "complete"  // stack reaches 5 cards
  | "secure"    // stack locked in for a point
  | "steal"     // stealing an opponent stack
  | "turn"      // turn changes to new player
  | "shuffle"   // deck shuffled
  | "error"     // invalid action
  | "wild";     // wild card played

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === "suspended") _ctx.resume().catch(() => {});
    return _ctx;
  } catch {
    return null;
  }
}

/** White noise burst through a bandpass filter */
function noise(
  ac: AudioContext,
  duration: number,
  freq = 1500,
  q = 2,
  vol = 0.25,
  startAt = 0
) {
  const sr = ac.sampleRate;
  const len = Math.ceil(sr * duration);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.8);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.setValueAtTime(freq, ac.currentTime + startAt);
  filt.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, ac.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startAt + duration);
  src.connect(filt);
  filt.connect(gain);
  gain.connect(ac.destination);
  src.start(ac.currentTime + startAt);
  src.stop(ac.currentTime + startAt + duration + 0.05);
}

/** Single oscillator tone with exponential decay */
function tone(
  ac: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  vol = 0.25,
  startAt = 0
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + startAt);
  gain.gain.setValueAtTime(0.001, ac.currentTime + startAt);
  gain.gain.linearRampToValueAtTime(vol, ac.currentTime + startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startAt + duration);
  osc.start(ac.currentTime + startAt);
  osc.stop(ac.currentTime + startAt + duration + 0.05);
}

/** Pitch-swept oscillator (swoosh/whoosh) */
function sweep(
  ac: AudioContext,
  freqStart: number,
  freqEnd: number,
  duration: number,
  type: OscillatorType = "sawtooth",
  vol = 0.25,
  startAt = 0
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ac.currentTime + startAt);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, ac.currentTime + startAt + duration);
  gain.gain.setValueAtTime(vol, ac.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + startAt + duration);
  osc.start(ac.currentTime + startAt);
  osc.stop(ac.currentTime + startAt + duration + 0.05);
}

export function playSound(type: SoundType): void {
  const ac = ctx();
  if (!ac) return;

  switch (type) {
    // Soft high-to-low noise sweep — card sliding through fingers
    case "draw":
      noise(ac, 0.16, 2800, 1.5, 0.22);
      noise(ac, 0.12, 900, 2, 0.12, 0.04);
      break;

    // Percussive thud — card landing flat on table
    case "play":
      noise(ac, 0.10, 700, 4, 0.32);
      tone(ac, 160, 0.14, "sine", 0.18);
      break;

    // Two-tone ascending chime — milestone feel
    case "complete":
      tone(ac, 659, 0.30, "sine", 0.28);
      tone(ac, 880, 0.45, "sine", 0.32, 0.20);
      break;

    // Three-note ascending lock — satisfying resolution
    case "secure":
      tone(ac, 523, 0.20, "sine", 0.22);
      tone(ac, 659, 0.22, "sine", 0.26, 0.14);
      tone(ac, 784, 0.40, "sine", 0.30, 0.28);
      break;

    // Sharp downward whoosh — aggressive action
    case "steal":
      sweep(ac, 700, 90, 0.22, "sawtooth", 0.28);
      noise(ac, 0.12, 1200, 1, 0.15, 0.02);
      break;

    // Single soft bell — attention without distraction
    case "turn":
      tone(ac, 528, 0.55, "sine", 0.20);
      tone(ac, 792, 0.30, "sine", 0.08, 0.02);
      break;

    // Rapid riffling — rapid noise bursts like cards being shuffled
    case "shuffle":
      for (let i = 0; i < 7; i++) {
        noise(ac, 0.05, 1600 + i * 80, 3, 0.14, i * 0.055);
      }
      break;

    // Short low-pitched buzz — clear rejection signal
    case "error":
      tone(ac, 140, 0.18, "square", 0.22);
      tone(ac, 120, 0.14, "square", 0.18, 0.08);
      break;

    // Shimmering sparkle arpeggio — magical/special feel
    case "wild":
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        tone(ac, f, 0.28, "sine", 0.20, i * 0.065);
      });
      noise(ac, 0.35, 3500, 0.8, 0.10);
      break;
  }
}
