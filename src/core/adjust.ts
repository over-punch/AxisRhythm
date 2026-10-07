// axis-rhythm/src/core/adjust.ts — framework-agnostic axis-rhythm algorithm
import { AXIS_RHYTHM_CLASSES, type AxisRhythmOptions, type WaveShape } from './types'

// ─── Syllable (optional peer dep) ─────────────────────────────────────────────

type SyllableModule = { syllable: (word: string) => number } | { default: (word: string) => number }
let _syllable: ((word: string) => number) | null = null
let _syllableLoading = false

let _syllablePromise: Promise<void> | null = null

/** Starts (once) loading the optional `syllable` package; resolves when it is ready or has failed. */
function tryLoadSyllable(): Promise<void> {
	if (_syllable !== null) return Promise.resolve()
	if (_syllableLoading && _syllablePromise) return _syllablePromise
	_syllableLoading = true
	_syllablePromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'syllable')
		.then((m) => {
			const mod = m as SyllableModule
			_syllable = 'syllable' in mod ? mod.syllable : (mod as { default: (w: string) => number }).default
		})
		.catch(() => {
			// Reset flag so future callers can retry (e.g. after a network hiccup)
			_syllableLoading = false
			warnOnce('syllable', '[axisrhythm] source: "syllable-density" requires the `syllable` package — falling back to "fixed"')
		})
	return _syllablePromise
}

// ─── Pretext (canvas line detection) ─────────────────────────────────────────

/** Minimal surface of @chenglou/pretext that we use */
type PretextModule = {
	prepareWithSegments: (text: string, font: string) => unknown
	layoutWithLines: (prepared: unknown, maxWidth: number, lineHeight: number) => { lines: { text: string }[] }
}

let _pretext: PretextModule | null = null
let _pretextLoading = false

/**
 * Kick off a one-time background import of @chenglou/pretext.
 * No-ops if already loading or loaded. Falls back silently if not installed.
 */
let _pretextPromise: Promise<void> | null = null

function tryLoadPretext(): Promise<void> {
	if (_pretext !== null) return Promise.resolve()
	if (_pretextLoading && _pretextPromise) return _pretextPromise
	_pretextLoading = true
	_pretextPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ '@chenglou/pretext')
		.then((m) => { _pretext = m as PretextModule })
		.catch(() => {
			// Reset flag so future callers can retry (e.g. after a network hiccup)
			_pretextLoading = false
			warnOnce('pretext', '[axisrhythm] canvas lineDetection requires @chenglou/pretext — falling back to BCR')
		})
	return _pretextPromise
}

/** Warnings already printed, so a missing optional package warns once rather than on every refit. */
const _warned = new Set<string>()

/** Prints a console warning the first time it is seen. */
function warnOnce(key: string, message: string): void {
	if (_warned.has(key)) return
	_warned.add(key)
	console.warn(message)
}

/** The latest apply per element: an optional module that finishes loading re-applies only if nothing newer ran. */
const _latestApply = new WeakMap<HTMLElement, object>()

/**
 * Validates options: values must be finite numbers, period a finite number, and axis a four-character
 * tag (letters, digits or spaces). Invalid entries fall back to the defaults with a warning, so a
 * malformed option can't inject extra axes into font-variation-settings.
 */
function sanitizeOptions(options: AxisRhythmOptions): { axis: string; values: number[]; period: number } {
	let axis = typeof options.axis === 'string' ? options.axis : DEFAULTS.axis
	if (!/^[A-Za-z0-9 ]{4}$/.test(axis)) {
		warnOnce('axis:' + axis, `[axisrhythm] axis "${String(options.axis)}" is not a four-character tag — using "${DEFAULTS.axis}"`)
		axis = DEFAULTS.axis
	}
	let values = Array.isArray(options.values) ? options.values.filter((v) => typeof v === 'number' && Number.isFinite(v)) : DEFAULTS.values
	if (options.values !== undefined && (!Array.isArray(options.values) || values.length !== options.values.length)) {
		warnOnce('values', '[axisrhythm] values must be an array of finite numbers — ignoring the invalid entries')
	}
	if (!values.length) values = DEFAULTS.values
	const rawPeriod = Number(options.period ?? DEFAULTS.period)
	const period = Number.isFinite(rawPeriod) ? Math.max(1, Math.round(rawPeriod)) : DEFAULTS.period
	return { axis, values, period }
}

/** Cache: per-element pretext prepared object, keyed by originalHTML to invalidate on content change */
type PreparedEntry = { originalHTML: string; prepared: unknown }
const pretextCache = new WeakMap<HTMLElement, PreparedEntry>()

/** Build the canvas-compatible font string from an element's computed style.
 * CSS font shorthand order: style weight size family */
function getCanvasFont(el: HTMLElement): string {
	const s = getComputedStyle(el)
	const family = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
	return `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${family}`
}

/** Get the computed line height in px, falling back to fontSize × 1.2 */
function getLineHeightPx(el: HTMLElement): number {
	const s = getComputedStyle(el)
	const lh = parseFloat(s.lineHeight)
	return isNaN(lh) ? parseFloat(s.fontSize) * 1.2 : lh
}

/**
 * Assign word spans to line groups using pretext's line texts.
 * Accumulates span text content until it matches each line's text, in order.
 * Any trailing spans (from text normalisation differences) are appended to the last group.
 */
function groupSpansByPretext(
	wordSpans: HTMLElement[],
	lines: { text: string }[],
): HTMLElement[][] {
	const groups: HTMLElement[][] = lines.map(() => [])
	let si = 0

	for (let li = 0; li < lines.length && si < wordSpans.length; li++) {
		const target = lines[li].text.replace(/\s+/g, ' ').trim()
		let acc = ''
		while (si < wordSpans.length) {
			const word = (wordSpans[si].textContent ?? '').replace(/\s+/g, ' ').trim()
			acc = acc ? acc + ' ' + word : word
			groups[li].push(wordSpans[si])
			si++
			if (acc === target) break
		}
	}

	// Fallback: attach any remaining spans to the last group
	while (si < wordSpans.length) {
		groups[groups.length - 1]?.push(wordSpans[si++])
	}

	return groups
}

/**
 * Override a single axis value inside a font-variation-settings string,
 * preserving all other axis values. Adds the axis if it is not already present.
 *
 * e.g. overrideAxis('"wght" 300, "opsz" 18', 'wght', 700) → '"wght" 700, "opsz" 18'
 */
/** Escape special regex metacharacters so a caller-supplied axis tag is matched literally */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Cache of compiled axis-tag regex patterns, keyed by axis tag string */
const _axisPatternCache = new Map<string, RegExp>()

/** Get or create a compiled regex for matching an axis tag in a font-variation-settings string */
function getAxisPattern(axis: string): RegExp {
	let re = _axisPatternCache.get(axis)
	if (!re) {
		// Match the axis tag (in single or double quotes) followed by its numeric value.
		// Anchored with a word boundary after the closing quote so "BCD" does not match
		// inside "ABCD".
		re = new RegExp(`(["'])${escapeRegex(axis)}\\1\\s+[\\d.eE+-]+`)
		_axisPatternCache.set(axis, re)
	}
	return re
}

function overrideAxis(baseFVS: string, axis: string, value: number): string {
	if (!baseFVS || baseFVS === 'normal') return `"${axis}" ${value}`
	const pattern = getAxisPattern(axis)
	const replacement = `"${axis}" ${value}`
	return pattern.test(baseFVS)
		? baseFVS.replace(pattern, replacement)
		: `${baseFVS}, ${replacement}`
}

/** Resolved defaults applied when options are omitted */
const DEFAULTS = {
	axis: 'wdth',
	values: [100, 96] as number[],
	period: 2,
	align: 'top' as const,
	source: 'fixed' as const,
	lineDetection: 'bcr' as const,
	linePreservation: 'none' as const,
	animate: false,
	waveShape: 'sine' as WaveShape,
	speed: 1,
}

// ─── Animation phase registry ─────────────────────────────────────────────────

/**
 * Per-element phase state for the animated mode. Keyed by the primary element so
 * synced elements can read the same phase object without duplicating it.
 */
const sharedPhases = new WeakMap<HTMLElement, { phase: number }>()

// ─── Wave shape helpers ───────────────────────────────────────────────────────

/** Smooth sinusoidal oscillation, returns 0–1 */
function sineWave(phase: number): number {
	return 0.5 + 0.5 * Math.sin(phase * 2 * Math.PI)
}

/** Linear in, linear out — sharper transitions between values, returns 0–1 */
function triangleWave(phase: number): number {
	const t = ((phase % 1) + 1) % 1 // clamp to [0, 1)
	return t < 0.5 ? t * 2 : 2 - t * 2
}

/**
 * Sine with slight overshoot at peaks — more physical, spring-like feel.
 * The bounce term adds ~18% amplitude at 2× the frequency, which is then
 * clamped and re-normalised so the output stays in [0, 1].
 */
function springWave(phase: number): number {
	const s = Math.sin(phase * 2 * Math.PI)
	const bounce = 0.18 * Math.sin(phase * 4 * Math.PI)
	const raw = (s + bounce) / 1.18 // normalise to [-1, 1]
	return 0.5 + 0.5 * Math.max(-1, Math.min(1, raw))
}

/**
 * Map a normalised phase [0, 1] to an axis value within the options.values range.
 * phase = 0/1 → values[0]; phase = 0.5 → values[last] (for sine); triangle and
 * spring follow the same convention.
 */
function phaseToAxisValue(phase: number, waveShape: WaveShape, values: number[]): number {
	let t: number
	switch (waveShape) {
		case 'triangle': t = triangleWave(phase); break
		case 'spring':   t = springWave(phase);   break
		default:         t = sineWave(phase);      break
	}
	// Interpolate through every value in order (values[0] at t = 0, the last at t = 1), so a middle
	// value such as 60 in [100, 60, 140] is reached rather than skipped.
	if (values.length < 2) return values[0] ?? 100
	const pos = Math.max(0, Math.min(1, t)) * (values.length - 1)
	const i = Math.min(values.length - 2, Math.floor(pos))
	return values[i] + (values[i + 1] - values[i]) * (pos - i)
}

// ─── Word items ───────────────────────────────────────────────────────────────

/** Per-item data kept during one apply: the whitespace before it, an author <br> before it, and whether it is a whole element. */
interface ItemMeta {
	lead: string
	breakBefore: HTMLBRElement | null
	atomic?: boolean
}

/**
 * Splits a text node the browser lays out over several lines into one string per line, by
 * measuring where each character's box starts a new line. Used only for the rare word that wraps.
 */
function splitAtLineBreaks(node: Text, text: string): string[] {
	const pieces: string[] = []
	const range = document.createRange()
	let start = 0
	let bottom = NaN
	for (let i = 0; i < text.length; i++) {
		range.setStart(node, i)
		range.setEnd(node, i + 1)
		const rect = range.getClientRects()[0]
		if (!rect) continue
		if (Number.isNaN(bottom)) { bottom = rect.bottom; continue }
		if ((rect.top + rect.bottom) / 2 > bottom) {
			pieces.push(text.slice(start, i))
			start = i
			bottom = rect.bottom
		} else {
			bottom = Math.max(bottom, rect.bottom)
		}
	}
	pieces.push(text.slice(start))
	return pieces.filter((p) => p.length > 0)
}

/** Elements kept whole during the rebuild (no text of their own to split). */
const ATOMIC_TAGS = new Set(['IMG', 'SVG', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'MATH'])

/** Scripts written without spaces between words: every grapheme is a possible line break. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u

/**
 * Splits a space-free token into the pieces a line may break between: graphemes for CJK, Thai and
 * similar scripts (Intl.Segmenter keeps combining marks with their base), the whole token otherwise.
 */
function splitUnspaced(token: string): string[] {
	if (!UNSPACED_SCRIPT.test(token)) return [token]
	const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter
	if (!Seg) return Array.from(token)
	return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(token), (s) => s.segment)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the innerHTML of an element with all axis-rhythm injected markup removed,
 * unwrapping their children in place. Safe to call multiple times — idempotent.
 *
 * @param el - Element that may contain axis-rhythm markup
 */
export function getCleanHTML(el: HTMLElement): string {
	// An element this library processed returns the exact snapshot it was built from (an element that
	// wrapped across lines was rebuilt as one copy per line, which unwrapping can't merge back).
	const original = originals.get(el)
	if (original !== undefined && el.querySelector(`.${AXIS_RHYTHM_CLASSES.line}`)) return original
	const clone = el.cloneNode(true) as HTMLElement
	// Remove all injected line and word spans by unwrapping their children in place.
	// Query for both old data-attribute pattern and current class-based pattern.
	const injected = clone.querySelectorAll(
		`[data-axis-rhythm], .${AXIS_RHYTHM_CLASSES.line}, .${AXIS_RHYTHM_CLASSES.word}`,
	)
	// Iterate in reverse to handle nested spans safely.
	const nodes = Array.from(injected).reverse()
	nodes.forEach((node) => {
		const parent = node.parentNode
		if (!parent) return
		while (node.firstChild) parent.insertBefore(node.firstChild, node)
		parent.removeChild(node)
	})
	// Remove any injected <br> elements left between lines.
	clone.querySelectorAll('br[data-ar-break]').forEach((br) => br.parentNode?.removeChild(br))
	return clone.innerHTML
}

/**
 * Apply the axis-rhythm effect to an element.
 *
 * The algorithm runs five passes:
 *  1. Reset — restore the element to the original HTML snapshot (idempotent)
 *  2. Word wrap — wrap every word in a measurement span (.ar-word)
 *  3. Read phase — set display:inline-block; white-space:nowrap on word spans,
 *     read getBoundingClientRect().top for each, group by rounded top into lines
 *  4. Write phase — wrap each line group in a .ar-line span with font-variation-settings,
 *     remove word spans, insert <br> between lines
 *  5. Scroll restore — rAF to undo any scroll jump caused by DOM mutations
 *
 * @param element      - Target element (must be in the live DOM and visible)
 * @param originalHTML - Clean HTML snapshot from getCleanHTML()
 * @param options      - AxisRhythmOptions (merged with defaults)
 */
export function applyAxisRhythm(
	element: HTMLElement,
	originalHTML: string,
	options: AxisRhythmOptions = {},
): void {
	if (typeof window === 'undefined') return

	// On e-ink / slow-update displays the variable font axis animation produces no
	// visible effect — the panel cannot refresh fast enough to show transitions.
	// Skip all animation work and restore the element to its clean state.
	// matchMedia('(update: slow)') is true on Kindle, Remarkable, and similar panels.
	if (window.matchMedia?.('(update: slow)')?.matches) {
		element.innerHTML = originalHTML
		return
	}

	// Save scroll position — iOS Safari does not support overflow-anchor: none
	const scrollY = window.scrollY

	// Resolve options against defaults (invalid values fall back with a warning).
	const { axis, values, period } = sanitizeOptions(options)
	// Resolve align: 'end' maps to 'bottom' in LTR and 'top' in RTL.
	const alignRaw = options.align ?? DEFAULTS.align
	const align = alignRaw === 'end'
		? (getComputedStyle(element).direction === 'rtl' ? 'top' : 'bottom')
		: alignRaw
	const lineDetection = options.lineDetection ?? 'bcr'
	const linePreservation = options.linePreservation ?? DEFAULTS.linePreservation

	// Optional modules: until they load, the first apply falls back (BCR lines, fixed values); when one
	// finishes loading, the element is re-applied once, unless something newer has run since.
	const source = options.source ?? 'fixed'
	const applyToken = {}
	_latestApply.set(element, applyToken)
	const reapplyWhenLoaded = (load: Promise<void>, ready: () => boolean) => {
		if (ready()) return
		load.then(() => {
			if (ready() && element.isConnected && _latestApply.get(element) === applyToken) applyAxisRhythm(element, originalHTML, options)
		})
	}
	if (lineDetection === 'canvas') reapplyWhenLoaded(tryLoadPretext(), () => _pretext !== null)
	if (source === 'syllable-density') reapplyWhenLoaded(tryLoadSyllable(), () => _syllable !== null)

	// --- Pass 1: Reset ---
	restoreWrap(element)
	element.innerHTML = originalHTML
	originals.set(element, originalHTML)

	// --- Pass 2: Word wrap ---
	// Each word goes in a plain inline span (.ar-word) holding only the word; the whitespace around it
	// stays as text in the flow, so the browser breaks lines exactly as it does for the original text.
	// (Measuring words as inline-blocks drops the space at the start of each box, packs lines too
	// tightly, and the locked nowrap lines then overflow.) Text without spaces (CJK, Thai) is split
	// into graphemes so each character is a possible break, as it is in normal layout. Author <br>,
	// images and other childless elements become atomic items so they survive the rebuild.
	// createTreeWalker is intentionally avoided — it skips inline elements in happy-dom 12.
	const items: HTMLElement[] = []
	const meta = new WeakMap<Element, ItemMeta>()
	let pendingSpace = ''
	let pendingBreak: HTMLBRElement | null = null

	const pushWord = (span: HTMLElement, lead: string) => {
		meta.set(span, { lead: pendingSpace + lead, breakBefore: pendingBreak })
		pendingSpace = ''
		pendingBreak = null
		items.push(span)
	}

	const walk = (function walk(node: Node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const textNode = node as Text
			const text = textNode.textContent ?? ''
			if (!text.trim()) {
				// Whitespace between elements ("<em>a</em> <b>b</b>"): carried as the next word's lead.
				pendingSpace += text
				return
			}
			const fragment = document.createDocumentFragment()
			const tokens = text.split(/(\s+)/)
			let lead = ''
			for (const token of tokens) {
				if (!token) continue
				if (/^\s+$/.test(token)) {
					fragment.appendChild(document.createTextNode(token))
					lead += token
					continue
				}
				for (const piece of splitUnspaced(token)) {
					const span = document.createElement('span')
					span.className = AXIS_RHYTHM_CLASSES.word
					// No automatic hyphenation inside a word: a locked nowrap line can't hyphenate, so the
					// measurement mustn't either (a word split across two lines would land on one).
					span.style.hyphens = 'manual'
					span.textContent = piece
					fragment.appendChild(span)
					pushWord(span, lead)
					lead = ''
				}
			}
			// Trailing whitespace of this text node leads the next word.
			pendingSpace += lead
			textNode.parentNode!.replaceChild(fragment, textNode)
			return
		}
		if (node.nodeType !== Node.ELEMENT_NODE) return
		const el = node as Element
		if (el.tagName === 'BR') {
			pendingBreak = el as HTMLBRElement
			return
		}
		if (!el.hasChildNodes() || ATOMIC_TAGS.has(el.tagName)) {
			// Images, inline SVG, inputs: kept whole, measured like a word.
			meta.set(el, { lead: pendingSpace, breakBefore: pendingBreak, atomic: true })
			pendingSpace = ''
			pendingBreak = null
			items.push(el as HTMLElement)
			return
		}
		Array.from(el.childNodes).forEach(walk)
	})
	// Walk the element's children (the element itself is never an item, even when empty).
	Array.from(element.childNodes).forEach(walk)

	// If no words were found, nothing more to do.
	if (items.length === 0) {
		element.innerHTML = originalHTML
		requestAnimationFrame(() => {
			if (Math.abs(window.scrollY - scrollY) > 2) {
				window.scrollTo({ top: scrollY, behavior: 'instant' })
			}
		})
		return
	}
	const wordSpans = items

	// --- Pass 3: Line grouping ---
	// Two paths: canvas (pretext arithmetic) or bcr (getBoundingClientRect).
	// Canvas path: reuses cached segment widths on resize — no forced reflow.
	// BCR path: reads actual browser layout — ground truth, always accurate.

	interface LineGroup {
		spans: HTMLElement[]
		top: number
	}
	const lineGroups: LineGroup[] = []

	// Capture _pretext as a local const so TypeScript can narrow the type safely
	// within the canvas branch, avoiding non-null assertions on a mutable module var.
	const capturedPretext = _pretext
	const useCanvas = lineDetection === 'canvas' && capturedPretext !== null

	if (useCanvas) {
		// --- Canvas path (pretext) ---
		// Get or compute the prepared segment widths for this element's text.
		const cached = pretextCache.get(element)
		let prepared: unknown
		if (cached && cached.originalHTML === originalHTML) {
			prepared = cached.prepared
		} else {
			prepared = capturedPretext.prepareWithSegments(
				element.textContent ?? '',
				getCanvasFont(element),
			)
			pretextCache.set(element, { originalHTML, prepared })
		}

		// The content box: clientWidth includes padding, which text can't use.
		const cs = getComputedStyle(element)
		const maxWidth = element.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
		const lineHeight = getLineHeightPx(element)
		const { lines } = capturedPretext.layoutWithLines(prepared, maxWidth, lineHeight)

		// Map pretext line texts back to word spans.
		const grouped = groupSpansByPretext(wordSpans, lines)
		grouped.forEach((spans, i) => {
			lineGroups.push({ spans, top: i }) // top is synthetic — only used as identity key
		})
	} else {
		// --- BCR path (default) ---
		// Words stay inline (no forced inline-block), so this reads the real layout. A word starts a
		// new line when its box begins at or below the bottom of the current line; a superscript or
		// a larger inline image on the same line overlaps it and stays in the line.
		// A word the browser itself breaks across lines (after a hyphen, or with overflow-wrap) is split
		// into one span per line at that break, which is already a break, so layout doesn't change.
		for (let i = 0; i < wordSpans.length; i++) {
			const span = wordSpans[i]
			if (meta.get(span)?.atomic) continue
			const rects = span.getClientRects?.()
			if (!rects || rects.length < 2 || span.firstChild?.nodeType !== Node.TEXT_NODE) continue
			const pieces = splitAtLineBreaks(span.firstChild as Text, span.textContent ?? '')
			if (pieces.length < 2) continue
			span.textContent = pieces[0]
			let prev = span
			for (const piece of pieces.slice(1)) {
				const next = document.createElement('span')
				next.className = span.className
				next.style.hyphens = 'manual'
				next.textContent = piece
				prev.after(next)
				meta.set(next, { lead: '', breakBefore: null })
				wordSpans.splice(++i, 0, next)
				prev = next
			}
		}

		// A word starts a new line when its vertical middle is below the bottom of the current line's
		// boxes. Comparing middles, not tops, keeps a superscript or a taller inline image in its line,
		// and still separates lines whose glyph boxes overlap (a tight line-height, or fonts with tall
		// ascenders and descenders). Comparing tops merged every line into one at line-height: 1.
		let currentGroup: LineGroup | null = null
		let groupBottom = -Infinity
		for (const span of wordSpans) {
			const rects = span.getClientRects?.()
			const rect = rects && rects.length ? rects[0] : span.getBoundingClientRect()
			const top = rect.top
			const bottom = rect.bottom ?? rect.top
			if (currentGroup === null || (top + bottom) / 2 > groupBottom) {
				currentGroup = { spans: [], top: Math.round(top) }
				lineGroups.push(currentGroup)
				groupBottom = bottom
			} else {
				groupBottom = Math.max(groupBottom, bottom)
			}
			currentGroup.spans.push(span)
		}
	}

	// An author <br> always starts a line. The canvas path (pretext) doesn't see <br>, so split any line
	// that has one inside it.
	for (let g = 0; g < lineGroups.length; g++) {
		const spans = lineGroups[g].spans
		const cut = spans.findIndex((span, k) => k > 0 && meta.get(span)?.breakBefore)
		if (cut > 0) lineGroups.splice(g + 1, 0, { spans: spans.splice(cut), top: lineGroups[g].top + 0.5 })
	}

	const totalLines = lineGroups.length

	// --- Pass 4: Write phase — wrap lines (no axis value yet) ---
	// Build line spans and insert into DOM before measuring widths.
	// axis values are applied in Pass 5 so we can read natural widths first.

	// ─── Compute per-line axis values ────────────────────────────────────────────
	// 'fixed' mode: cycle through values[] in order, repeating every `period` lines.
	// 'syllable-density' mode: map per-line syllable density to the values[] range.
	//   values[0] → lowest density line, values[1] → highest density line.
	//   Lines in between are linearly interpolated.

	let densityAxisValues: number[] | null = null
	// Capture _syllable as a local const so TypeScript narrows safely within the branch,
	// avoiding non-null assertions on a mutable module var.
	const capturedSyllable = _syllable
	if (source === 'syllable-density' && capturedSyllable !== null) {
		// Compute average syllables-per-word for each line
		const lineDensities = lineGroups.map((group) => {
			const words = group.spans
				.map((s) => (s.textContent ?? '').trim())
				.filter(Boolean)
				.flatMap((t) => t.split(/\s+/))
				.filter(Boolean)
			if (words.length === 0) return 0
			const total = words.reduce((sum, w) => sum + capturedSyllable(w), 0)
			return total / words.length
		})
		// Use reduce instead of spread to avoid stack overflow on texts with many lines
		const minD = lineDensities.reduce((a, b) => Math.min(a, b), Infinity)
		const maxD = lineDensities.reduce((a, b) => Math.max(a, b), -Infinity)
		const rangeD = maxD - minD || 1
		const lo = values[0] ?? 100
		const hi = values[values.length - 1] ?? 96
		densityAxisValues = lineDensities.map((d) => {
			const t = (d - minD) / rangeD // 0 = simplest line, 1 = most complex
			return lo + (hi - lo) * t
		})
	}

	// Computed axis value per line (stored for use in Pass 5).
	const lineAxisValues: number[] = lineGroups.map((group, lineIndex) => densityAxisValues !== null
		? densityAxisValues[lineIndex]
		: values[(align === 'bottom' ? (totalLines - 1 - lineIndex) % period : lineIndex % period) % values.length])

	/** Each line's styled runs: one box per line in 'scale' mode, else one inline run per element the line passes through. */
	const lines: HTMLElement[][] = linePreservation === 'scale'
		? buildLineBoxes(element, lineGroups, meta)
		: buildLineRuns(element, lineGroups, meta)

	// --- Pass 5: Apply axis values + optional line-length preservation ---
	// Read the element's full font-variation-settings once so we can override only
	// the target axis while preserving opsz, wdth, and any others the parent set.
	// Setting just `'wght' 700` on a span would drop the parent's `opsz 18` entirely,
	// making axis-width measurements inconsistent with natural-width measurements.
	const baseFVS = getComputedStyle(element).fontVariationSettings
	const setAxis = (i: number) => lines[i].forEach((run) => { run.style.fontVariationSettings = overrideAxis(baseFVS, axis, lineAxisValues[i]) })

	if (linePreservation === 'none') {
		// Simple path: apply axis variation directly, preserving parent axes.
		lines.forEach((_, i) => setAxis(i))
	} else {
		// Preservation path: measure natural widths before applying axis values,
		// then apply compensation (letter-spacing or scaleX) to keep line lengths stable.

		// Batch read 1: natural widths (runs inherit parent's fontVariationSettings), and in 'scale' mode
		// where each line's box starts.
		const naturalWidths = lines.map(lineWidth)
		const naturalLefts = linePreservation === 'scale' ? lines.map(lineLeft) : []
		// Apply axis values to all runs, preserving all other parent axes.
		lines.forEach((_, i) => setAxis(i))
		// Batch read 2: widths (and box positions) after axis application.
		const axisWidths = lines.map(lineWidth)
		const axisLefts = linePreservation === 'scale' ? lines.map(lineLeft) : []

		if (linePreservation === 'spacing') {
			// Adjust letter-spacing per line so the total advance width matches
			// the natural (un-modified) width. Same technique as HoverBoldly.
			// Added on top of the author's own letter-spacing, which the line would otherwise lose.
			const baseSpacing = authorLetterSpacing(element)
			const zoom = cssZoom(element)
			lines.forEach((runs, i) => {
				// Measured in zoomed pixels; letter-spacing is in CSS pixels.
				const delta = (naturalWidths[i] - axisWidths[i]) / zoom
				const charCount = lineChars(runs)
				const fontSize = parseFloat(getComputedStyle(runs[0]).fontSize)
				if (charCount > 0) runs.forEach((run) => {
					run.style.letterSpacing = fontSize > 0 ? `calc(${baseSpacing} + ${(delta / charCount) / fontSize}em)` : ''
				})
			})
		} else {
			// Apply a scaleX transform so each line visually occupies its natural width. The box keeps
			// its own width (scaling a box already widened to the natural width would scale it twice).
			// A box anchored on the right or the middle (right-to-left, right-aligned or centred text) also
			// moves when its width changes, so it is shifted back to where it started.
			lines.forEach(([el], i) => {
				if (axisWidths[i] > 0 && naturalWidths[i] > 0) {
					el.style.transform = scaleTransform(naturalWidths[i], naturalLefts[i], axisWidths[i], axisLefts[i])
					el.style.transformOrigin = 'left center'
				}
			})
		}
	}

	// --- Pass 6: Restore scroll via rAF ---
	requestAnimationFrame(() => {
		if (Math.abs(window.scrollY - scrollY) > 2) {
			window.scrollTo({ top: scrollY, behavior: 'instant' })
		}
	})
}

/** The element's computed letter-spacing as a CSS length ('normal' becomes 0px). */
function authorLetterSpacing(el: HTMLElement): string {
	const ls = getComputedStyle(el).letterSpacing
	return !ls || ls === 'normal' ? '0px' : ls
}

/**
 * The CSS `zoom` in effect on an element (its own and its ancestors'), 1 when there is none or the browser
 * doesn't report it. getBoundingClientRect() measures in zoomed pixels, while letter-spacing and font-size are
 * in CSS pixels, so a measured width has to be divided by this before it becomes a letter-spacing.
 */
function cssZoom(el: HTMLElement): number {
	const zoom = (el as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom
	return typeof zoom === 'number' && zoom > 0 ? zoom : 1
}

/** The left edge of a 'scale' line's box in viewport pixels (one box per line in that mode). */
function lineLeft(runs: HTMLElement[]): number {
	return runs[0].getBoundingClientRect().left
}

/**
 * The transform that puts a 'scale' line back where it was before the axis changed its width: scaled to its
 * natural width and, where the wider or narrower box moved (right-to-left, right-aligned or centred text, where
 * the box is anchored on the right or the middle), shifted back to its natural left edge. Origin: left center.
 * The shift is written as a percentage of the box's own width, a ratio of two measurements, so it stays
 * right when the page is zoomed with CSS `zoom` (measured pixels and CSS pixels differ there).
 *
 * @param naturalWidth - line width before the axis value was applied (px)
 * @param naturalLeft  - left edge before the axis value was applied (px)
 * @param width        - line width with the axis value applied, untransformed (px)
 * @param left         - left edge with the axis value applied, untransformed (px)
 */
function scaleTransform(naturalWidth: number, naturalLeft: number, width: number, left: number): string {
	const shift = naturalLeft - left
	const scale = `scaleX(${(naturalWidth / width).toFixed(6)})`
	return Math.abs(shift) < 0.01 ? scale : `translateX(${((shift / width) * 100).toFixed(4)}%) ${scale}`
}

/** The rendered width of a line: the sum of its runs (each run sits on one line). */
function lineWidth(runs: HTMLElement[]): number {
	return runs.reduce((sum, run) => sum + run.getBoundingClientRect().width, 0)
}

/** How many characters a line holds, across its runs. */
function lineChars(runs: HTMLElement[]): number {
	return runs.reduce((sum, run) => sum + [...(run.textContent ?? '')].length, 0)
}

/** The element's inline wrapping styles before axisRhythm locked its lines, restored on reset and remove. */
const savedWrap = new WeakMap<HTMLElement, { textWrapMode: string; whiteSpace: string }>()

/** Put back the element's own inline wrapping styles, if axisRhythm changed them. */
function restoreWrap(element: HTMLElement): void {
	const saved = savedWrap.get(element)
	if (!saved) return
	element.style.setProperty('text-wrap-mode', saved.textWrapMode)
	element.style.whiteSpace = saved.whiteSpace
	savedWrap.delete(element)
}

/**
 * Lock the element's lines in place: no wrapping except at the line breaks axisRhythm inserted. Uses
 * text-wrap-mode, which keeps the author's white-space handling; older browsers get white-space: nowrap
 * when the text uses normal white-space.
 */
function lockWrap(element: HTMLElement): void {
	if (!savedWrap.has(element)) savedWrap.set(element, { textWrapMode: element.style.getPropertyValue('text-wrap-mode'), whiteSpace: element.style.whiteSpace })
	if (typeof CSS !== 'undefined' && CSS.supports?.('text-wrap-mode', 'nowrap')) element.style.setProperty('text-wrap-mode', 'nowrap')
	else if (getComputedStyle(element).whiteSpace === 'normal') element.style.whiteSpace = 'nowrap'
}

/**
 * Style each line in place: its words are grouped into inline `.ar-line` runs (one per element the line
 * passes through, all sharing `data-ar-line`), and a `<br>` is placed at the start of each line, inside
 * whatever element continues across the break. The author's markup is kept as it is, so a link that
 * wraps stays one link. Returns each line's runs.
 */
function buildLineRuns(element: HTMLElement, lineGroups: { spans: HTMLElement[] }[], meta: WeakMap<Element, ItemMeta>): HTMLElement[][] {
	const lines = lineGroups.map((group, lineIndex) => {
		const runs: HTMLElement[] = []
		let run: HTMLElement | null = null
		for (const item of group.spans) {
			let joinable = run !== null && run.parentNode === item.parentNode
			if (joinable) {
				// Only whitespace may sit between the run and this word.
				for (let n = run!.nextSibling; n && n !== item; n = n.nextSibling) {
					if (n.nodeType !== Node.TEXT_NODE) { joinable = false; break }
				}
			}
			if (joinable) {
				while (run!.nextSibling && run!.nextSibling !== item) run!.appendChild(run!.nextSibling)
				run!.appendChild(item)
			} else {
				run = document.createElement('span')
				run.className = AXIS_RHYTHM_CLASSES.line
				run.setAttribute('data-ar-line', String(lineIndex))
				item.parentNode!.insertBefore(run, item)
				run.appendChild(item)
				runs.push(run)
			}
		}
		return runs
	})

	// A break at the start of every line after the first (the author's own <br> there is kept).
	lines.forEach((runs, i) => {
		if (i === 0 || !runs.length) return
		if (meta.get(lineGroups[i].spans[0])?.breakBefore) return
		// Climb out of elements that start on this line, so the break sits before them.
		let at: Node = runs[0]
		while (at.parentNode && at.parentNode !== element && firstContent(at.parentNode) === at) at = at.parentNode
		// Not aria-hidden: the space before a forced break collapses, so the break is what keeps the words on
		// either side apart in accessible names ("a long link" across two lines, not "a longlink").
		const br = document.createElement('br')
		br.setAttribute('data-ar-break', '')
		at.parentNode!.insertBefore(br, at)
	})

	// The word spans were for measuring: put their text back as plain text inside the runs.
	for (const group of lineGroups) {
		for (const item of group.spans) {
			if (meta.get(item)?.atomic || !item.parentNode) continue
			item.replaceWith(document.createTextNode(item.textContent ?? ''))
		}
	}
	lines.flat().forEach((run) => run.normalize())
	lockWrap(element)
	return lines
}

/** The first child of a node that isn't whitespace-only text. */
function firstContent(parent: Node): Node | null {
	for (let n = parent.firstChild; n; n = n.nextSibling) {
		if (n.nodeType !== Node.TEXT_NODE || (n.textContent ?? '').trim()) return n
	}
	return null
}

/**
 * 'scale' mode: rebuild each line as its own inline-block `.ar-line` box (a transform needs one box per
 * line). The line's text is rebuilt inside copies of its inline ancestors; an element that continues onto
 * a later line is copied again there, without its id. Returns each line as a one-box array.
 */
function buildLineBoxes(element: HTMLElement, lineGroups: { spans: HTMLElement[] }[], meta: WeakMap<Element, ItemMeta>): HTMLElement[][] {
	// Elements already copied into an earlier line (their later copies drop the id).
	const copied = new Set<Element>()
	const lineElements = lineGroups.map((group, lineIndex) => {
		const lineSpan = document.createElement('span')
		lineSpan.className = AXIS_RHYTHM_CLASSES.line
		lineSpan.setAttribute('data-ar-line', String(lineIndex))
		lineSpan.style.display = 'inline-block'
		lineSpan.style.whiteSpace = 'nowrap'
		// Consecutive words that share an ancestor share one copy (one link stays one link within a line).
		let openChain: { source: Element; clone: Element }[] = []
		group.spans.forEach((item) => {
			const info = meta.get(item)
			const ancestors: Element[] = []
			let node: Element | null = item.parentElement
			while (node && node !== element) {
				ancestors.unshift(node)
				node = node.parentElement
			}
			let shared = 0
			while (shared < openChain.length && shared < ancestors.length && openChain[shared].source === ancestors[shared]) shared++
			openChain = openChain.slice(0, shared)
			let parent: Node = shared ? openChain[shared - 1].clone : lineSpan
			// The space before a word sits outside any element the word's predecessor closed. It is kept at
			// the start of a line too: invisible there (collapsed), but the text and copy-paste keep it.
			const lead = info?.lead ?? ''
			if (lead) parent.appendChild(document.createTextNode(lead))
			for (let a = shared; a < ancestors.length; a++) {
				const copy = ancestors[a].cloneNode(false) as Element
				if (copied.has(ancestors[a])) copy.removeAttribute('id')
				copied.add(ancestors[a])
				parent.appendChild(copy)
				openChain.push({ source: ancestors[a], clone: copy })
				parent = copy
			}
			parent.appendChild(info?.atomic ? item.cloneNode(true) : document.createTextNode(item.textContent ?? ''))
		})
		return lineSpan
	})

	// Insert line boxes into the live DOM, separated by <br>.
	element.innerHTML = ''
	lineElements.forEach((lineEl, i) => {
		element.appendChild(lineEl)
		if (i < lineElements.length - 1) {
			// The author's own <br> at this boundary is kept (getCleanHTML returns it); otherwise an
			// injected, aria-hidden break that getCleanHTML removes.
			const authorBreak = meta.get(lineGroups[i + 1].spans[0])?.breakBefore
			if (authorBreak) {
				element.appendChild(authorBreak.cloneNode(false))
			} else {
				const br = document.createElement('br')
				br.setAttribute('data-ar-break', '')
				br.setAttribute('aria-hidden', 'true')
				element.appendChild(br)
			}
		}
	})
	return lineElements.map((el) => [el])
}

/**
 * Remove axis-rhythm markup and restore the element to its original HTML.
 *
 * @param element      - The element that was previously adjusted
 * @param originalHTML - The snapshot passed to the original applyAxisRhythm call
 */
export function removeAxisRhythm(element: HTMLElement, originalHTML: string): void {
	restoreWrap(element)
	element.innerHTML = originalHTML
	originals.delete(element)
}

/** The snapshot each processed element was built from, returned by getCleanHTML. */
const originals = new WeakMap<HTMLElement, string>()

/**
 * Start a continuous animated axis-rhythm wave on an element.
 *
 * Calls `applyAxisRhythm` once to build the .ar-line DOM structure, then drives
 * per-line axis values each animation frame. Each line is offset in phase by
 * `(lineIndex / period)` so adjacent lines are always at different oscillation
 * points — the wave visually drifts up or down the paragraph over time.
 *
 * @param element      - Target element (must be in the live DOM and visible)
 * @param originalHTML - Clean HTML snapshot from getCleanHTML()
 * @param options      - AxisRhythmOptions; `animate`, `waveShape`, `speed`, and
 *                       `syncTo` are specific to this function. `animate: true`
 *                       is implied — you don't need to pass it explicitly.
 * @returns            - A stop function. Call it to cancel the rAF loop and clean up.
 */
export function startAxisRhythm(
	element: HTMLElement,
	originalHTML: string,
	options: AxisRhythmOptions = {},
): () => void {
	if (typeof window === 'undefined') return () => {}

	// Build the .ar-line DOM structure: the static per-line texture, which isn't motion.
	applyAxisRhythm(element, originalHTML, options)

	// Reduced motion: keep the static texture and don't animate it.
	const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)')
	if (motionQuery?.matches) return () => {}

	const { axis, values, period } = sanitizeOptions(options)
	const linePreservation = options.linePreservation ?? DEFAULTS.linePreservation
	const waveShape = options.waveShape ?? DEFAULTS.waveShape
	const speed    = options.speed     ?? DEFAULTS.speed
	const syncTo   = options.syncTo
	const intersect = options.intersect ?? false

	// Resolve the phase object:
	// - Synced element: borrows the primary element's phase (doesn't advance it).
	// - Primary element: creates its own phase and stores it in the WeakMap so
	//   others can sync to this element later.
	let phaseObj: { phase: number }
	let isPrimary: boolean

	if (syncTo) {
		const existing = sharedPhases.get(syncTo)
		if (existing) {
			phaseObj  = existing
			isPrimary = false
		} else {
			// syncTo hasn't started yet — create a shared phase anyway so the
			// synced element doesn't throw; it will effectively become primary.
			phaseObj  = { phase: 0 }
			sharedPhases.set(element, phaseObj)
			isPrimary = true
		}
	} else {
		phaseObj  = { phase: 0 }
		sharedPhases.set(element, phaseObj)
		isPrimary = true
	}

	const baseFVS     = getComputedStyle(element).fontVariationSettings
	// Each line's runs (a line that passes through a link or <em> has one run per element), by data-ar-line.
	const lineRuns: HTMLElement[][] = []
	element.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`).forEach((run) => {
		const i = Number(run.getAttribute('data-ar-line')) || 0
		;(lineRuns[i] ??= []).push(run)
	})
	const lines = lineRuns.filter(Boolean)

	// Line-length preservation while animating: measure each line once at its natural width and at the
	// lowest and highest axis values, then compensate every frame by interpolating between them
	// (width is close to linear in a single axis), instead of re-measuring 60 times a second.
	const lo = Math.min(...values), hi = Math.max(...values)
	const baseSpacing = authorLetterSpacing(element)
	let natural: number[] = [], widthLo: number[] = [], widthHi: number[] = [], chars: number[] = [], fontSizes: number[] = []
	// 'scale' only: each line box's left edge at its natural width and at the lowest and highest axis values
	let naturalLeft: number[] = [], leftLo: number[] = [], leftHi: number[] = []
	const scaling = linePreservation === 'scale'
	const zoom = cssZoom(element)
	if (linePreservation !== 'none' && hi !== lo) {
		const all = lines.flat()
		all.forEach((el) => { el.style.letterSpacing = ''; el.style.transform = ''; el.style.width = ''; el.style.fontVariationSettings = baseFVS })
		natural = lines.map(lineWidth)
		if (scaling) naturalLeft = lines.map(lineLeft)
		all.forEach((el) => { el.style.fontVariationSettings = overrideAxis(baseFVS, axis, lo) })
		widthLo = lines.map(lineWidth)
		if (scaling) leftLo = lines.map(lineLeft)
		all.forEach((el) => { el.style.fontVariationSettings = overrideAxis(baseFVS, axis, hi) })
		widthHi = lines.map(lineWidth)
		if (scaling) leftHi = lines.map(lineLeft)
		chars = lines.map(lineChars)
		fontSizes = lines.map((runs) => parseFloat(getComputedStyle(runs[0]).fontSize) || 0)
	}

	/** Applies one frame's axis value to a line's runs, with its width compensation. */
	function setLine(runs: HTMLElement[], i: number, value: number): void {
		const fvs = overrideAxis(baseFVS, axis, value)
		runs.forEach((el) => { el.style.fontVariationSettings = fvs })
		if (!natural.length) return
		const t = (value - lo) / (hi - lo)
		const w = widthLo[i] + (widthHi[i] - widthLo[i]) * t
		if (linePreservation === 'spacing' && chars[i] > 0 && fontSizes[i] > 0) {
			const ls = `calc(${baseSpacing} + ${((natural[i] - w) / zoom / chars[i]) / fontSizes[i]}em)`
			runs.forEach((el) => { el.style.letterSpacing = ls })
		} else if (linePreservation === 'scale' && w > 0 && natural[i] > 0) {
			runs[0].style.transform = scaleTransform(natural[i], naturalLeft[i], w, leftLo[i] + (leftHi[i] - leftLo[i]) * t)
			runs[0].style.transformOrigin = 'left center'
		}
	}

	/** Milliseconds for one complete oscillation cycle at speed = 1 */
	const CYCLE_MS = 4000
	let lastTime: number | null = null
	let rafId: number
	/** Whether the rAF loop is currently active (paused when element is off-screen) */
	let running = true

	function frame(time: number): void {
		// The element was removed from the page: stop instead of animating detached nodes forever.
		if (!element.isConnected) {
			stop()
			return
		}
		if (lastTime !== null && isPrimary) {
			const dt = time - lastTime
			phaseObj.phase = (phaseObj.phase + dt / (CYCLE_MS / speed)) % 1
		}
		lastTime = time

		lines.forEach((runs, i) => {
			const linePhase = (phaseObj.phase + i / period) % 1
			setLine(runs, i, phaseToAxisValue(linePhase, waveShape, values))
		})

		if (running) {
			rafId = requestAnimationFrame(frame)
		}
	}

	rafId = requestAnimationFrame(frame)

	// When intersect is requested, pause the rAF loop while the element is
	// outside the viewport and resume when it re-enters.
	let io: IntersectionObserver | null = null
	if (intersect && typeof IntersectionObserver !== 'undefined') {
		io = new IntersectionObserver((entries) => {
			const isVisible = entries[entries.length - 1].isIntersecting
			if (isVisible && !running) {
				running = true
				lastTime = null // reset delta so phase doesn't jump after a long pause
				rafId = requestAnimationFrame(frame)
			} else if (!isVisible && running) {
				running = false
				cancelAnimationFrame(rafId)
			}
		})
		io.observe(element)
	}

	// Reset lastTime when the tab becomes visible again so the first rAF frame after
	// a hidden period does not produce a large dt spike and a visible phase jump.
	function onVisibilityChange(): void {
		if (document.visibilityState === 'visible') {
			lastTime = null
		}
	}
	document.addEventListener('visibilitychange', onVisibilityChange)

	// Reduced motion turned on mid-animation: stop moving and settle on the static texture.
	function onMotionChange(): void {
		if (!motionQuery?.matches) return
		stop()
		applyAxisRhythm(element, originalHTML, options)
	}
	motionQuery?.addEventListener?.('change', onMotionChange)

	/** Cancels the loop and removes listeners; safe to call more than once. */
	function stop(): void {
		running = false
		cancelAnimationFrame(rafId)
		io?.disconnect()
		motionQuery?.removeEventListener?.('change', onMotionChange)
		document.removeEventListener('visibilitychange', onVisibilityChange)
		if (isPrimary) sharedPhases.delete(element)
	}

	return stop
}
