// axis-rhythm/src/__tests__/adjust.test.ts — core algorithm tests
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyAxisRhythm, removeAxisRhythm, getCleanHTML } from '../core/adjust'
import { AXIS_RHYTHM_CLASSES } from '../core/types'

// ─── DOM measurement mock ─────────────────────────────────────────────────────
const CONTAINER_W = 600
const WORD_W = 80

/**
 * Tracks word span getBoundingClientRect call order so we can simulate line breaks.
 * 7 words fit per line: 7 * 80 = 560 < 600. Each line is 20px tall.
 */
let wordCallIndex = 0

/**
 * Mocks offsetWidth on HTMLElement.prototype (not instance) so happy-dom's
 * constructor `this.offsetWidth = 0` doesn't throw — the no-op setter absorbs it.
 * Also mocks getBoundingClientRect to return position data.
 * Returns a cleanup function restoring both originals.
 */
function mockMeasurement() {
	wordCallIndex = 0

	const proto = HTMLElement.prototype
	const priorOffsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth')
	Object.defineProperty(proto, 'offsetWidth', {
		configurable: true,
		get: function (this: HTMLElement) {
			if (this.classList?.contains(AXIS_RHYTHM_CLASSES.probe)) return 0
			if (this.classList?.contains(AXIS_RHYTHM_CLASSES.word)) return WORD_W
			return CONTAINER_W
		},
		// No-op setter required — happy-dom's HTMLElement constructor does `this.offsetWidth = 0`
		set: () => {},
	})

	const origBCR = Element.prototype.getBoundingClientRect
	Element.prototype.getBoundingClientRect = function (this: Element) {
		const el = this as HTMLElement
		if (el.classList?.contains(AXIS_RHYTHM_CLASSES.probe)) {
			return { width: 0, top: 0, left: 0, bottom: 20, right: 0, height: 20, x: 0, y: 0, toJSON: () => {} } as DOMRect
		}
		if (el.classList?.contains(AXIS_RHYTHM_CLASSES.word)) {
			// Assign each word to a line based on call order: 7 words per line at 80px each
			const lineIndex = Math.floor(wordCallIndex / 7)
			wordCallIndex++
			const top = lineIndex * 20
			return { width: WORD_W, top, left: 0, bottom: top + 20, right: WORD_W, height: 20, x: 0, y: top, toJSON: () => {} } as DOMRect
		}
		return { width: CONTAINER_W, top: 0, left: 0, bottom: 20, right: CONTAINER_W, height: 20, x: 0, y: 0, toJSON: () => {} } as DOMRect
	}

	return () => {
		if (priorOffsetWidth) Object.defineProperty(proto, 'offsetWidth', priorOffsetWidth)
		Element.prototype.getBoundingClientRect = origBCR
	}
}

function makeElement(html: string): HTMLElement {
	const el = document.createElement('p')
	el.innerHTML = html
	el.style.width = `${CONTAINER_W}px`
	document.body.appendChild(el)
	return el
}

/** Generate a string of n space-separated words */
function nWords(n: number, word = 'word'): string {
	return Array.from({ length: n }, () => word).join(' ')
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('axis-rhythm', () => {
	let cleanup: (() => void) | null = null

	beforeEach(() => {
		document.body.innerHTML = ''
		cleanup = mockMeasurement()
	})

	afterEach(() => {
		cleanup?.()
		cleanup = null
	})

	// 1. applyAxisRhythm doesn't throw on empty element
	it('applyAxisRhythm does not throw on empty element', () => {
		const el = makeElement('')
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, {})).not.toThrow()
	})

	// 2. removeAxisRhythm restores original HTML
	it('removeAxisRhythm restores original HTML', () => {
		const el = makeElement('<em>Hello</em> world')
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, {})
		removeAxisRhythm(el, original)
		expect(el.innerHTML).toBe(original)
	})

	// 3. getCleanHTML is idempotent
	it('getCleanHTML is idempotent', () => {
		const el = makeElement('<em>Hello</em> world')
		const html1 = getCleanHTML(el)
		const html2 = getCleanHTML(el)
		expect(html1).toBe(html2)
	})

	// Also verify getCleanHTML strips axis-rhythm markup after apply
	it('getCleanHTML strips axis-rhythm line markup after apply', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(AXIS_RHYTHM_CLASSES.line)
		expect(cleaned).not.toContain(AXIS_RHYTHM_CLASSES.word)
	})

	// 4. Inline elements (<em>, <strong>) are preserved after apply
	it('preserves <em> and <strong> inline elements after apply', () => {
		const el = makeElement('<em>italic</em> and <strong>bold</strong>')
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, {})
		expect(el.querySelector('em')).toBeTruthy()
		expect(el.querySelector('strong')).toBeTruthy()
	})

	// 5. After apply with { axis: 'wdth', values: [100, 96], period: 2 },
	//    first line wrapper has wdth 100 and second has wdth 96
	it('applies font-variation-settings wdth 100 to line 1 and wdth 96 to line 2', () => {
		// 14 words → 2 lines of 7 (7 * 80px = 560 < 600px container)
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })

		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		expect(lines[0].style.fontVariationSettings).toContain('"wdth" 100')
		expect(lines[1].style.fontVariationSettings).toContain('"wdth" 96')
	})

	// 5b. Output HTML contains the font-variation-settings strings
	it('output HTML contains font-variation-settings strings', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		// Assert via the CSSOM rather than raw innerHTML — happy-dom 20+ HTML-escapes
		// double quotes (" -> &quot;) when serializing innerHTML, which is serialization
		// noise; the parsed style values are unaffected.
		const fvs = [...el.querySelectorAll('.ar-line')].map((l) => (l as HTMLElement).style.fontVariationSettings)
		expect(fvs).toContain('"wdth" 100')
		expect(fvs).toContain('"wdth" 96')
	})

	// 6. align: 'bottom' reverses the cycle — last line gets values[0], second-to-last gets values[1]
	it('align bottom: last line gets values[0] and second-to-last gets values[1]', () => {
		// 14 words → 2 lines
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, align: 'bottom' })

		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		const last = lines[lines.length - 1]
		const secondToLast = lines[lines.length - 2]
		// align=bottom, 2 lines: cyclePos for last (index 1) = (2-1-1)%2=0 → values[0]=100
		expect(last.style.fontVariationSettings).toContain('"wdth" 100')
		// cyclePos for first (index 0) = (2-1-0)%2=1 → values[1]=96
		expect(secondToLast.style.fontVariationSettings).toContain('"wdth" 96')
	})

	// 7. Custom period: 3 cycles through 3 values across 3 lines
	it('period 3 applies three distinct axis values across three lines', () => {
		// 21 words → 3 lines of 7 each
		const el = makeElement(nWords(21))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wght', values: [400, 450, 500], period: 3, align: 'top' })

		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(3)
		expect(lines[0].style.fontVariationSettings).toContain('"wght" 400')
		expect(lines[1].style.fontVariationSettings).toContain('"wght" 450')
		expect(lines[2].style.fontVariationSettings).toContain('"wght" 500')
	})

	// 8. Single-word input doesn't crash
	it('single-word input does not crash', () => {
		const el = makeElement('Hello')
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })).not.toThrow()
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBe(1)
	})

	// Bonus: apply is idempotent — applying twice from the same originalHTML produces the same result
	it('apply is idempotent — applying twice does not double line wrappers', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const linesAfterFirst = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length

		// Reset wordCallIndex before second apply so measurements are consistent
		wordCallIndex = 0
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const linesAfterSecond = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length

		expect(linesAfterSecond).toBe(linesAfterFirst)
	})

	// 12. All produced line spans have fontVariationSettings set
	it('every line span has a non-empty fontVariationSettings style', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThan(0)
		lines.forEach((line) => {
			expect(line.style.fontVariationSettings).toBeTruthy()
		})
	})

	// 13. Period wraps — 4 lines with period=2: lines 0,2 get values[0], lines 1,3 get values[1]
	it('period wraps — 4 lines with period=2 alternates correctly', () => {
		const el = makeElement(nWords(28))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, align: 'top' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(4)
		expect(lines[0].style.fontVariationSettings).toContain('"wdth" 100')
		expect(lines[1].style.fontVariationSettings).toContain('"wdth" 96')
		expect(lines[2].style.fontVariationSettings).toContain('"wdth" 100')
		expect(lines[3].style.fontVariationSettings).toContain('"wdth" 96')
	})

	// 14. Whitespace-only element does not throw
	it('whitespace-only element does not throw', () => {
		const el = makeElement('   ')
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, {})).not.toThrow()
	})

	// 15. Single line with align:bottom still gets values[0] (bottom line = last = only line)
	it('single line with align:bottom gets values[0]', () => {
		const el = makeElement(nWords(3))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, align: 'bottom' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBe(1)
		expect(lines[0].style.fontVariationSettings).toContain('"wdth" 100')
	})

	// 16. Custom wght axis applies correct values
	it('custom wght axis applies correct values to lines', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wght', values: [400, 700], period: 2, align: 'top' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		expect(lines[0].style.fontVariationSettings).toContain('"wght" 400')
		expect(lines[1].style.fontVariationSettings).toContain('"wght" 700')
	})

	// 17. getCleanHTML after apply contains no axis-rhythm class names
	it('getCleanHTML after apply strips all injected markup', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain(AXIS_RHYTHM_CLASSES.line)
		expect(cleaned).not.toContain(AXIS_RHYTHM_CLASSES.word)
	})

	// 18. Nested <a> link is preserved after apply
	it('preserves <a> links inside element after apply', () => {
		const el = makeElement('<a href="#">click</a> to learn more about typography')
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, {})
		const link = el.querySelector('a')
		expect(link).toBeTruthy()
		expect(link?.getAttribute('href')).toBe('#')
	})

	// 19. Exactly 7 words (one full line) produces exactly 1 line span
	it('7 words (one line) produces exactly 1 line span', () => {
		const el = makeElement(nWords(7))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const lines = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBe(1)
	})

	// 20. prefers-reduced-motion: applyAxisRhythm restores originalHTML and injects no markup
	it('prefers-reduced-motion: restores originalHTML and injects no line spans', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		expect(el.innerHTML).toBe(original)
		expect(el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length).toBe(0)
		vi.restoreAllMocks()
	})

	// 21. update:slow: applyAxisRhythm restores originalHTML
	it('update:slow: restores originalHTML on e-ink display', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: true, media: '', onchange: null, addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		applyAxisRhythm(el, original, {})
		expect(el.innerHTML).toBe(original)
		vi.restoreAllMocks()
	})

	// 22. SSR guard: applyAxisRhythm does not throw when window is undefined
	it('SSR guard: does not throw when called server-side (window undefined)', () => {
		const el = makeElement(nWords(7))
		const original = getCleanHTML(el)
		const win = (globalThis as Record<string, unknown>).window
		delete (globalThis as Record<string, unknown>).window
		try {
			expect(() => applyAxisRhythm(el, original, {})).not.toThrow()
		} finally {
			;(globalThis as Record<string, unknown>).window = win
		}
	})
})
