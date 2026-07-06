// axisRhythm/src/webflow/embed.ts — zero-config browser bundle for Webflow Custom Code Embed.
// Auto-initialises axis-rhythm on any element marked with [data-axisrhythm], reading options
// from data-* attributes, re-fits on viewport resize (line grouping depends on width), and
// exposes a small window.AxisRhythm API for manual control.
import { applyAxisRhythm, startAxisRhythm, removeAxisRhythm } from '../core/adjust'
import type { AxisRhythmOptions, WaveShape } from '../core/types'

/** Attribute that opts an element in to the axis-rhythm effect. */
const OPT_IN_ATTR = 'data-axisrhythm'

/** Valid anchor alignments for data-ar-align. */
const VALID_ALIGNS: readonly string[] = ['top', 'bottom', 'end']

/** Valid axis value sources for data-ar-source. */
const VALID_SOURCES: readonly string[] = ['fixed', 'syllable-density']

/** Valid line-detection methods for data-ar-line-detection. */
const VALID_LINE_DETECTION: readonly string[] = ['bcr', 'canvas']

/** Valid line-length preservation strategies for data-ar-line-preservation. */
const VALID_LINE_PRESERVATION: readonly string[] = ['none', 'spacing', 'scale']

/** Valid wave shapes for the animated mode (data-ar-wave). */
const VALID_WAVES: readonly WaveShape[] = ['sine', 'triangle', 'spring']

/** Per-element teardown record so destroy() can stop any loop and restore markup. */
interface Instance {
	/** Stop function — the rAF-loop canceller in animated mode, or a no-op in static mode. */
	stop: () => void
	/** Clean HTML snapshot taken before the first mutation, for restoration and re-fits. */
	originalHTML: string
}

/** Tracks live instances keyed by their element — WeakMap so removed nodes are GC'd. */
const INSTANCES = new WeakMap<HTMLElement, Instance>()

/** Iterable set of managed elements, re-fitted on resize (a WeakMap cannot be iterated). */
const TRACKED = new Set<HTMLElement>()

/**
 * Read axis-rhythm options from an element's data-* attributes.
 * Unset attributes fall through to the library defaults.
 *
 * Supported attributes:
 *   data-ar-axis              — variable font axis tag (default 'wdth')
 *   data-ar-values            — comma-separated axis values to cycle (e.g. "100,96")
 *   data-ar-period            — lines per cycle
 *   data-ar-align             — top | bottom | end
 *   data-ar-source            — fixed | syllable-density
 *   data-ar-line-detection    — bcr | canvas
 *   data-ar-line-preservation — none | spacing | scale
 *   data-ar-animate           — "true" to run the ambient wave
 *   data-ar-wave              — sine | triangle | spring
 *   data-ar-speed             — animation speed multiplier
 *   data-ar-intersect         — "true" to defer / pause work off-screen
 *
 * @param el - The opted-in element
 */
function readOptions(el: HTMLElement): AxisRhythmOptions {
	const opts: AxisRhythmOptions = {}
	const d = el.dataset

	if (d.arAxis) opts.axis = d.arAxis

	if (d.arValues) {
		const values = d.arValues
			.split(',')
			.map((s) => parseFloat(s.trim()))
			.filter((n) => !isNaN(n))
		if (values.length > 0) opts.values = values
	}

	if (d.arPeriod !== undefined) {
		const n = parseFloat(d.arPeriod)
		if (!isNaN(n)) opts.period = n
	}

	if (d.arAlign && VALID_ALIGNS.includes(d.arAlign)) {
		opts.align = d.arAlign as AxisRhythmOptions['align']
	}

	if (d.arSource && VALID_SOURCES.includes(d.arSource)) {
		opts.source = d.arSource as AxisRhythmOptions['source']
	}

	if (d.arLineDetection && VALID_LINE_DETECTION.includes(d.arLineDetection)) {
		opts.lineDetection = d.arLineDetection as AxisRhythmOptions['lineDetection']
	}

	if (d.arLinePreservation && VALID_LINE_PRESERVATION.includes(d.arLinePreservation)) {
		opts.linePreservation = d.arLinePreservation as AxisRhythmOptions['linePreservation']
	}

	if (d.arAnimate === 'true') opts.animate = true

	if (d.arWave && (VALID_WAVES as readonly string[]).includes(d.arWave)) {
		opts.waveShape = d.arWave as WaveShape
	}

	if (d.arSpeed !== undefined) {
		const n = parseFloat(d.arSpeed)
		if (!isNaN(n)) opts.speed = n
	}

	if (d.arIntersect === 'true') opts.intersect = true

	return opts
}

/**
 * Build (or rebuild) the axis-rhythm markup for one element from a preserved snapshot.
 * Chooses the real API by mode: animated → startAxisRhythm (returns a stop fn),
 * static → applyAxisRhythm (one-shot, teardown handled by removeAxisRhythm in destroy).
 *
 * @param el           - Target element
 * @param originalHTML - Clean HTML snapshot captured before the first mutation
 * @param options      - Parsed AxisRhythmOptions
 * @returns              A stop function for any running animation loop (no-op in static mode)
 */
function apply(el: HTMLElement, originalHTML: string, options: AxisRhythmOptions): () => void {
	if (options.animate) {
		return startAxisRhythm(el, originalHTML, options)
	}
	applyAxisRhythm(el, originalHTML, options)
	return () => {}
}

/**
 * Initialise a single element: snapshot its markup once, then apply the effect.
 * Idempotent — re-initialising stops any previous loop and rebuilds from the same
 * preserved snapshot (never re-reading the already-mutated innerHTML).
 *
 * @param el - Element to animate
 */
function initElement(el: HTMLElement): void {
	const existing = INSTANCES.get(el)
	// Snapshot the original markup only once — before the first mutation. On a re-fit the
	// preserved snapshot is reused, so mutated .ar-line markup is never captured as "original".
	const originalHTML = existing ? existing.originalHTML : el.innerHTML
	if (existing) existing.stop()

	const options = readOptions(el)
	const stop = apply(el, originalHTML, options)
	INSTANCES.set(el, { stop, originalHTML })
	TRACKED.add(el)
}

/**
 * Stop and restore a single element if it has a live instance.
 *
 * @param el - Element previously initialised
 */
function destroy(el: HTMLElement): void {
	const inst = INSTANCES.get(el)
	if (!inst) return
	inst.stop()
	removeAxisRhythm(el, inst.originalHTML)
	INSTANCES.delete(el)
	TRACKED.delete(el)
}

/**
 * Scan a root for opted-in elements and initialise each one.
 *
 * @param root - Element or document to search (default: document)
 */
function init(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>(`[${OPT_IN_ATTR}]`).forEach(initElement)
}

/**
 * Rebuild every tracked element's line grouping for the current container width.
 * Line detection depends on layout, so a viewport resize can change how words wrap —
 * re-initialising reruns the read/write passes against the preserved snapshot.
 */
function refit(): void {
	TRACKED.forEach((el) => initElement(el))
}

// Re-fit on viewport resize — the container's width drives where lines break. Throttled to
// one re-fit per animation frame so a drag-resize doesn't rerun the layout on every event.
let resizeRaf = 0
function onResize(): void {
	if (resizeRaf) cancelAnimationFrame(resizeRaf)
	resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; refit() })
}

/**
 * Auto-initialise once the DOM is parsed and web fonts have loaded.
 * Fonts must settle first: variable-axis metrics and per-line word wrapping both depend
 * on final glyph widths, which shift when a web font swaps in.
 */
function autoInit(): void {
	const run = () => {
		if (document.fonts?.ready) {
			document.fonts.ready.then(() => init()).catch(() => init())
		} else {
			init()
		}
		window.addEventListener('resize', onResize)
	}
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true })
	} else {
		run()
	}
}

autoInit()

// Public browser API — assigned to window.AxisRhythm via the IIFE global name.
export { init, refit, destroy }
