import * as Tone from 'tone';

/**
 * Reverb.ts — a subtle master-bus reverb for the LoFi Engine.
 *
 * Adds a touch of room/depth to the WHOLE mix. The host (PlayButton) splices the
 * returned node INLINE into the master chain; this factory returns it UNCONNECTED
 * and never touches Tone.getDestination() itself.
 *
 * The mix is intentionally mostly DRY — this is glue, not an effect you should
 * notice. Keep WET gentle so nothing washes out.
 *
 * Note: Tone.Reverb renders its impulse response asynchronously after
 * construction (see `node.ready` / `.generate()`). It is safe to chain
 * immediately — the reverb tail simply "warms up" a moment after load once the
 * IR finishes rendering. We kick off `.ready` but do NOT await it, so module
 * load and audio start are never blocked.
 *
 * API:
 *   createReverb(): { node: Tone.Reverb; dispose(): void }
 *     - node:    the configured Tone.Reverb (host chains it into the master bus)
 *     - dispose: releases the reverb node
 */

// Wet/dry mix. Mostly dry on purpose — a hair of ambience, not a wash. (0..1)
const WET = 0.18;

// Reverb tail length in seconds. Moderate room, not a cavern.
const DECAY_SECONDS = 2.0;

// Pre-delay before the tail starts, in seconds. A small gap keeps transients
// (drum hits, note onsets) clear before the reverb blooms behind them.
const PREDELAY_SECONDS = 0.02;

export function createReverb(): { node: Tone.Reverb; dispose(): void } {
	const node = new Tone.Reverb({
		wet: WET,
		decay: DECAY_SECONDS,
		preDelay: PREDELAY_SECONDS,
	});

	// Start rendering the impulse response, but don't block — the tail warms up
	// shortly after load. Swallow errors so a failed IR render can't reject an
	// unhandled promise.
	void node.ready.catch(() => {});

	return {
		node,
		dispose() {
			node.dispose();
		},
	};
}
