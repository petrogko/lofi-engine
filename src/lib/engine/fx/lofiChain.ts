import * as Tone from 'tone';

/**
 * lofiChain — a "tape character" master-FX module.
 *
 * Builds the ordered Tone nodes that give the master mix a warped-tape lo-fi
 * character. The nodes are returned UNCONNECTED: the host (PlayButton) splices
 * them into the master chain itself, e.g.
 *
 *     const lofi = createLofiChain();
 *     dest.chain(...prefix, ...lofi.nodes, ...suffix);
 *     lofi.start();   // when Tone.Transport starts
 *     lofi.stop();    // when Tone.Transport stops
 *     lofi.dispose(); // on teardown
 *
 * Signal order of `nodes`:
 *   1. Tone.Distortion — gentle tape saturation / warmth
 *   2. Tone.Vibrato    — wow & flutter (delay-based pitch warble)
 *   3. Tone.EQ3        — darker lo-fi tone shaping (roll off highs, warm lows)
 *   4. Tone.Gain       — tempo-synced pump/ducking (modulated by an LFO)
 *
 * The control-rate Tone.LFO that drives the pump is NOT part of `nodes`; it is
 * connected internally to the pump gain and managed by start/stop/dispose.
 *
 * API:
 *   createLofiChain(): {
 *     nodes: any[];   // ordered nodes for the host to chain
 *     start(): void;  // start the pump LFO (call when Transport starts)
 *     stop(): void;   // stop the pump LFO (call when Transport stops)
 *     dispose(): void;// dispose every node + the LFO
 *   }
 *
 * Tunable constants (all perceptual amounts live here, kept conservative so the
 * default sound is safe to ship without auditioning):
 *   SATURATION_AMOUNT = 0.12   // 0..1 distortion drive; subtle harmonic warmth
 *   FLUTTER_RATE_HZ   = 4      // Hz warble rate; low enough to read as tape, not vibrato
 *   FLUTTER_DEPTH     = 0.06   // 0..1 pitch-mod depth; very shallow warble
 *   EQ_LOW_DB         = 2      // dB low-band lift; a touch of low-mid warmth
 *   EQ_MID_DB         = 0      // dB mid-band; left flat by default
 *   EQ_HIGH_DB        = -6     // dB high-band cut; the classic darker lo-fi top end
 *   PUMP_DEPTH        = 0.15   // 0..1 ducking depth; gain dips to (1 - depth) on each beat
 *   PUMP_SUBDIVISION  = '4n'   // transport subdivision the pump syncs to (one dip per beat)
 */

// --- Tunable constants (every perceptual amount lives here; keep them gentle) ---

const SATURATION_AMOUNT = 0.12; // 0..1 distortion drive; subtle harmonic warmth
const FLUTTER_RATE_HZ = 4; // Hz warble rate; low enough to read as tape, not vibrato
const FLUTTER_DEPTH = 0.06; // 0..1 pitch-mod depth; very shallow warble
const EQ_LOW_DB = 2; // dB low-band lift; a touch of low-mid warmth
const EQ_MID_DB = 0; // dB mid-band; left flat by default
const EQ_HIGH_DB = -6; // dB high-band cut; the classic darker lo-fi top end
const PUMP_DEPTH = 0.15; // 0..1 ducking depth; gain dips to (1 - depth) on each beat
const PUMP_SUBDIVISION = '4n'; // transport subdivision the pump syncs to (one dip per beat)

export function createLofiChain(): {
	nodes: any[];
	start(): void;
	stop(): void;
	dispose(): void;
} {
	// 1. Gentle tape saturation / warmth.
	const saturation = new Tone.Distortion({
		distortion: SATURATION_AMOUNT,
		oversample: '2x',
	});

	// 2. Wow & flutter — shallow, slowish pitch warble that reads as tape.
	const flutter = new Tone.Vibrato(FLUTTER_RATE_HZ, FLUTTER_DEPTH);

	// 3. Tone shaping — darker top end with a hint of low-mid warmth.
	const eq = new Tone.EQ3({
		low: EQ_LOW_DB,
		mid: EQ_MID_DB,
		high: EQ_HIGH_DB,
	});

	// 4. Tempo-synced pump — gain dips on each beat to fake kick-driven ducking.
	const pump = new Tone.Gain(1);

	// Control-rate LFO driving the pump gain. A sawtooth snaps down at the start
	// of each beat (the duck) then ramps back up (the recovery). Synced so it
	// tracks Transport tempo changes (e.g. the engine's BPM drift).
	const pumpLfo = new Tone.LFO({
		frequency: PUMP_SUBDIVISION,
		type: 'sawtooth',
		min: 1 - PUMP_DEPTH,
		max: 1,
	});
	pumpLfo.connect(pump.gain);
	pumpLfo.sync();

	const nodes = [saturation, flutter, eq, pump];

	return {
		nodes,
		start() {
			pumpLfo.start(0);
		},
		stop() {
			pumpLfo.stop();
		},
		dispose() {
			pumpLfo.dispose();
			saturation.dispose();
			flutter.dispose();
			eq.dispose();
			pump.dispose();
		},
	};
}
