import * as Tone from 'tone';

/**
 * Vinyl crackle / dust texture.
 *
 * Unlike the inline master-bus FX, this is a PARALLEL SOUND SOURCE: it wires
 * itself straight to `Tone.getDestination()` (same pattern as
 * `src/lib/engine/Drums/Noise.ts`) and sits UNDER the music as a thin layer of
 * surface noise. It is built from two complementary parts, both fed from a
 * single low output Volume so the whole layer stays quiet:
 *
 *   1. Dust bed  — a constant, dark brown-noise hiss (the warm "needle resting
 *      in the groove" floor). High-passed to shave off sub rumble.
 *   2. Crackle   — sparse, RANDOM clicks/pops. A continuously running pink-noise
 *      source is gated by a short AmplitudeEnvelope; a `Tone.Loop` triggers that
 *      envelope at randomised, probability-gated slots so the pops feel like
 *      real dust rather than a rhythmic buzz.
 *
 * Nothing auto-starts on construction — audio must only begin on a user gesture.
 * The caller drives start()/stop() alongside Transport playback (the crackle
 * Loop rides the Transport clock, the dust bed runs free).
 */

// ---------------------------------------------------------------------------
// Tunables. The maintainer can't audition these, so defaults are deliberately
// gentle — nudge UP (toward 0 dB / higher gain) only if the layer is inaudible.
// ---------------------------------------------------------------------------

/** Master level for the WHOLE crackle layer. Subtle by design. (-26 = louder, -32 = barely there.) */
const VOLUME_DB = -30;

// --- Dust bed (constant surface hiss) ---
/** Brown noise is naturally dark/warm — the right colour for groove hiss. */
const DUST_NOISE_TYPE: Tone.NoiseType = 'brown';
/** High-pass to remove deep rumble while keeping the soft, airy dust. */
const DUST_HP_HZ = 400;
/** Linear gain of the dust bed before the master Volume (0..1). Keep it a whisper. */
const DUST_GAIN = 0.45;

// --- Crackle (sparse random pops) ---
/** Pink noise is brighter than brown — better click/snap content once high-passed. */
const CRACKLE_NOISE_TYPE: Tone.NoiseType = 'pink';
/** High-pass that thins the noise into clicky "dust" rather than full hiss. */
const CRACKLE_HP_HZ = 1200;
/** How often the Loop CONSIDERS firing a pop (a Tone time). Finer = denser candidates. */
const CRACKLE_INTERVAL = '32n';
/** Probability that any given slot actually pops (0..1). Low = sparse, vinyl-like. */
const CRACKLE_PROBABILITY = 0.22;
/** Each pop's amplitude is randomised within this range (velocity, 0..1). */
const CRACKLE_MIN_GAIN = 0.25;
const CRACKLE_MAX_GAIN = 0.9;
/** Envelope shape of a single pop — a fast, dry tick (sustain 0 = pluck). */
const CRACKLE_ATTACK = 0.001;
const CRACKLE_DECAY = 0.004;
const CRACKLE_RELEASE = 0.02;
/** Hold time passed to triggerAttackRelease; tiny, so pops stay click-short. */
const CRACKLE_HOLD = 0.005;

/** Public handle returned by {@link createVinylCrackle}. */
export interface VinylCrackle {
	/** Begin the dust bed and crackle Loop. Call when Transport playback starts. */
	start(): void;
	/** Silence the dust bed and stop the crackle Loop. Call when playback stops. */
	stop(): void;
	/** Tear down every node. The handle is unusable afterwards. */
	dispose(): void;
}

/**
 * Build a vinyl crackle layer. Does NOT start any sound — call `start()` from a
 * user gesture (alongside `Tone.Transport.start()`).
 */
export function createVinylCrackle(): VinylCrackle {
	// Shared, quiet output for the whole layer → straight to the speakers.
	const output = new Tone.Volume(VOLUME_DB).connect(Tone.getDestination());

	// --- Dust bed: brown noise → high-pass → low gain → output ---
	const dustNoise = new Tone.Noise(DUST_NOISE_TYPE);
	const dustHP = new Tone.Filter(DUST_HP_HZ, 'highpass');
	const dustGain = new Tone.Gain(DUST_GAIN);
	dustNoise.chain(dustHP, dustGain, output);

	// --- Crackle: pink noise (always running) → high-pass → gating envelope → output ---
	const crackleNoise = new Tone.Noise(CRACKLE_NOISE_TYPE);
	const crackleHP = new Tone.Filter(CRACKLE_HP_HZ, 'highpass');
	const crackleEnv = new Tone.AmplitudeEnvelope({
		attack: CRACKLE_ATTACK,
		decay: CRACKLE_DECAY,
		sustain: 0,
		release: CRACKLE_RELEASE,
	});
	crackleNoise.chain(crackleHP, crackleEnv, output);

	// A Transport-driven Loop that, at each slot, randomly decides whether to
	// fire a single pop and at what (random) amplitude — this randomness is what
	// makes it read as vinyl dust instead of a metronomic tick.
	const loop = new Tone.Loop((time: number) => {
		if (Math.random() > CRACKLE_PROBABILITY) return;
		const velocity = CRACKLE_MIN_GAIN + Math.random() * (CRACKLE_MAX_GAIN - CRACKLE_MIN_GAIN);
		crackleEnv.triggerAttackRelease(CRACKLE_HOLD, time, velocity);
	}, CRACKLE_INTERVAL);

	// Guard against double start/stop: Tone sources throw if started twice.
	let running = false;

	return {
		start() {
			if (running) return;
			running = true;
			dustNoise.start();
			crackleNoise.start();
			loop.start(0); // rides the Transport; next iteration fires once playback advances
		},
		stop() {
			if (!running) return;
			running = false;
			dustNoise.stop();
			crackleNoise.stop();
			loop.stop(0);
		},
		dispose() {
			loop.dispose();
			dustNoise.dispose();
			dustHP.dispose();
			dustGain.dispose();
			crackleNoise.dispose();
			crackleHP.dispose();
			crackleEnv.dispose();
			output.dispose();
		},
	};
}

export default createVinylCrackle;
