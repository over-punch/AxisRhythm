// axis-rhythm/src/__tests__/pure-functions.test.ts — tests for pure utility functions

// We need to access internal functions. They are not exported, so we test them via
// the observable effects of applyAxisRhythm / startAxisRhythm where possible,
// and directly export them in test-only mode by re-importing from adjust internals.
// For wave shapes and overrideAxis, we test via the public applyAxisRhythm surface.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyAxisRhythm, getCleanHTML, startAxisRhythm, removeAxisRhythm } from '../core/adjust'
import { AXIS_RHYTHM_CLASSES } from '../core/types'

// ─── DOM measurement mock (same as adjust.test.ts) ───────────────────────────
const CONTAINER_W = 600
const WORD_W = 80
let wordCallIndex = 0

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
		set: () => {},
	})
	const origBCR = Element.prototype.getBoundingClientRect
	Element.prototype.getBoundingClientRect = function (this: Element) {
		const el = this as HTMLElement
		if (el.classList?.contains(AXIS_RHYTHM_CLASSES.probe)) {
			return { width: 0, top: 0, left: 0, bottom: 20, right: 0, height: 20, x: 0, y: 0, toJSON: () => {} } as DOMRect
		}
		if (el.classList?.contains(AXIS_RHYTHM_CLASSES.word)) {
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

function nWords(n: number, word = 'word'): string {
	return Array.from({ length: n }, () => word).join(' ')
}

// ─── overrideAxis tests (via applyAxisRhythm observable output) ───────────────

describe('overrideAxis (via applyAxisRhythm)', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('applies axis value when baseFVS is empty/normal', () => {
		const el = makeElement(nWords(7))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100], period: 1 })
		const line = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!
		expect(line.style.fontVariationSettings).toContain('"wdth" 100')
	})

	it('preserves other axes when overriding one axis', () => {
		const el = makeElement(nWords(7))
		el.style.fontVariationSettings = '"opsz" 18, "wdth" 100'
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [80], period: 1 })
		const line = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!
		expect(line.style.fontVariationSettings).toContain('"opsz" 18')
		expect(line.style.fontVariationSettings).toContain('"wdth" 80')
	})

	it('adds a new axis when it is absent from baseFVS', () => {
		const el = makeElement(nWords(7))
		el.style.fontVariationSettings = '"opsz" 18'
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [90], period: 1 })
		const line = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!
		expect(line.style.fontVariationSettings).toContain('"opsz" 18')
		expect(line.style.fontVariationSettings).toContain('"wdth" 90')
	})

	it('does not corrupt FVS when axis tag is a suffix of another tag', () => {
		// "BCD " must not match inside "ABCD" — regex must be anchored. (Tags are four characters,
		// space-padded; a three-character tag is now rejected by option validation.)
		const el = makeElement(nWords(7))
		el.style.fontVariationSettings = '"ABCD" 200, "BCD " 100'
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'BCD ', values: [50], period: 1 })
		const line = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!
		// ABCD must retain its original value; only "BCD " should change
		expect(line.style.fontVariationSettings).toContain('"ABCD" 200')
		expect(line.style.fontVariationSettings).toContain('"BCD " 50')
		expect(line.style.fontVariationSettings).not.toMatch(/"ABCD"\s+50/)
	})
})

// ─── values/period edge-case guard tests ─────────────────────────────────────

describe('values and period guards', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('empty values array: returns early without throwing', () => {
		const el = makeElement(nWords(7))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, { values: [] })).not.toThrow()
	})

	it('period: 0 is clamped to 1 — does not crash', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 0 })).not.toThrow()
	})

	it('period: -1 is clamped to 1 — does not crash', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: -1 })).not.toThrow()
	})

	it('period: 0.4 rounds to 1 — does not crash', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 0.4 })).not.toThrow()
	})

	it('period 3 with values[0..2] — all three values appear', () => {
		const el = makeElement(nWords(21))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wght', values: [400, 450, 500], period: 3 })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(3)
		expect(lines[0].style.fontVariationSettings).toContain('"wght" 400')
		expect(lines[1].style.fontVariationSettings).toContain('"wght" 450')
		expect(lines[2].style.fontVariationSettings).toContain('"wght" 500')
	})
})

// ─── align: 'end' tests ───────────────────────────────────────────────────────

describe("align: 'end'", () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it("align 'end' in LTR resolves to 'bottom' — last line gets values[0]", () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		// Default direction is LTR in jsdom/happy-dom
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, align: 'end' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		// LTR end = bottom: last line gets values[0]=100, first gets values[1]=96
		expect(lines[lines.length - 1].style.fontVariationSettings).toContain('"wdth" 100')
		expect(lines[0].style.fontVariationSettings).toContain('"wdth" 96')
	})

	it("align 'end' in RTL resolves to 'top' — first line gets values[0]", () => {
		const el = makeElement(nWords(14))
		el.style.direction = 'rtl'
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, align: 'end' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		// RTL end = top: first line gets values[0]=100
		expect(lines[0].style.fontVariationSettings).toContain('"wdth" 100')
	})
})

// ─── linePreservation tests ───────────────────────────────────────────────────

describe("linePreservation: 'spacing'", () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it("'spacing' mode does not throw and applies letter-spacing or leaves it as empty string", () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, {
			axis: 'wdth', values: [100, 80], period: 2, linePreservation: 'spacing',
		})).not.toThrow()
		// line spans should exist
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
	})

	it("'spacing' mode produces line spans with fontVariationSettings set", () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, linePreservation: 'spacing' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		lines.forEach((line) => {
			expect(line.style.fontVariationSettings).toBeTruthy()
		})
	})
})

describe("linePreservation: 'scale'", () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it("'scale' mode does not throw", () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		expect(() => applyAxisRhythm(el, original, {
			axis: 'wdth', values: [100, 80], period: 2, linePreservation: 'scale',
		})).not.toThrow()
	})

	it("'scale' mode produces line spans with fontVariationSettings set", () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, linePreservation: 'scale' })
		const lines = el.querySelectorAll<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)
		lines.forEach((line) => {
			expect(line.style.fontVariationSettings).toBeTruthy()
		})
	})
})

// ─── getCleanHTML legacy selector and br removal ─────────────────────────────

describe('getCleanHTML edge cases', () => {
	it('strips data-axis-rhythm legacy attribute', () => {
		const el = document.createElement('p')
		el.innerHTML = '<span data-axis-rhythm="">Hello world</span>'
		document.body.appendChild(el)
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain('data-axis-rhythm')
		expect(cleaned).toContain('Hello world')
		document.body.innerHTML = ''
	})

	it('removes br[data-ar-break] elements', () => {
		const el = document.createElement('p')
		el.innerHTML = 'Line one<br data-ar-break="">Line two'
		document.body.appendChild(el)
		const cleaned = getCleanHTML(el)
		expect(cleaned).not.toContain('data-ar-break')
		expect(cleaned).toContain('Line one')
		expect(cleaned).toContain('Line two')
		document.body.innerHTML = ''
	})
})

// ─── mockMeasurement wordCallIndex reset in beforeEach ───────────────────────

describe('wordCallIndex reset in beforeEach (mock hygiene)', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('first apply correctly identifies 2 lines after beforeEach reset', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const lines = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBe(2)
	})

	it('second independent test also starts fresh and identifies 2 lines', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const lines = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBe(2)
	})
})

// ─── injected br elements ─────────────────────────────────────────────────────

describe('injected br elements', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	// Not aria-hidden: the space before a forced break collapses, so the break is what keeps the words on
	// either side apart in an accessible name (a wrapped link read as "a long link", not "a longlink").
	it('injected br elements are not hidden from assistive tech', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const brs = el.querySelectorAll('br[data-ar-break]')
		expect(brs.length).toBeGreaterThan(0)
		brs.forEach((br) => {
			expect(br.getAttribute('aria-hidden')).toBeNull()
		})
	})
})

// ─── startAxisRhythm prefers-reduced-motion ──────────────────────────────────

describe('startAxisRhythm prefers-reduced-motion', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null; vi.restoreAllMocks() })

	it('keeps the static texture and does not animate under reduced motion', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
			matches: q.includes('prefers-reduced-motion'), media: q, onchange: null,
			addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		}) as MediaQueryList)
		const raf = vi.spyOn(window, 'requestAnimationFrame')
		const stop = startAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		expect(el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length).toBeGreaterThan(0)
		// Only the scroll-restore frame from applyAxisRhythm; no animation loop
		expect(raf.mock.calls.length).toBeLessThanOrEqual(1)
		expect(() => stop()).not.toThrow()
	})

	it('settles on the static texture when reduced motion turns on mid-animation', () => {
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		let onChange: (() => void) | null = null
		const mq = { matches: false, media: '', onchange: null, addListener: () => {}, removeListener: () => {},
			addEventListener: (_: string, f: () => void) => { onChange = f }, removeEventListener: () => { onChange = null }, dispatchEvent: () => true }
		vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => (q.includes('prefers-reduced-motion') ? mq : { ...mq, matches: false, addEventListener: () => {} }) as unknown as MediaQueryList)
		const cancel = vi.spyOn(window, 'cancelAnimationFrame')
		startAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		expect(onChange).not.toBeNull()
		mq.matches = true
		onChange!()
		expect(cancel).toHaveBeenCalled()
		expect(onChange).toBeNull()   // the listener is removed with the loop
		expect(el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length).toBeGreaterThan(0)
	})
})

// ─── startAxisRhythm basic stop function ─────────────────────────────────────

describe('startAxisRhythm', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null; vi.restoreAllMocks() })

	it('returns a callable stop function', () => {
		// Ensure matchMedia returns false (not reduced-motion)
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: false, media: '', onchange: null,
			addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		let stop: (() => void) | undefined
		expect(() => {
			stop = startAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		}).not.toThrow()
		expect(typeof stop).toBe('function')
		// stop() must not throw
		expect(() => stop!()).not.toThrow()
	})

	it('builds .ar-line DOM structure (non reduced-motion)', () => {
		vi.spyOn(window, 'matchMedia').mockReturnValue({
			matches: false, media: '', onchange: null,
			addListener: () => {}, removeListener: () => {},
			addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
		} as MediaQueryList)
		const el = makeElement(nWords(14))
		const original = getCleanHTML(el)
		const stop = startAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2 })
		const lines = el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(lines.length).toBeGreaterThanOrEqual(2)
		stop()
	})
})

// ─── Review fixes (2026-10) ──────────────────────────────────────────────────

describe('markup and whitespace survive the rebuild', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('keeps the text, author <br> and inline elements; getCleanHTML returns the input', () => {
		const html = 'The <em>quick brown</em> fox <a href="#x" id="L">jumps over the</a> <strong>lazy</strong> <em>dog</em>.<br>Second <b>line</b> after a break.'
		const el = makeElement(html)
		const text = el.textContent
		applyAxisRhythm(el, html, { values: [100, 90] })
		expect(el.textContent).toBe(text)
		expect(getCleanHTML(el)).toBe(html)
		// One id in the document, whatever the line breaks
		expect(el.querySelectorAll('#L').length).toBe(1)
	})

	it('word spans hold only the word: whitespace stays in the flow', () => {
		const html = nWords(10)
		const el = makeElement(html)
		applyAxisRhythm(el, html, {})
		expect(el.textContent).toBe(html)
	})

	it('an empty element is left as it was', () => {
		const el = makeElement('')
		applyAxisRhythm(el, '', {})
		expect(el.innerHTML).toBe('')
	})
})

describe('option validation', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement(); vi.spyOn(console, 'warn').mockImplementation(() => {}) })
	afterEach(() => { cleanup?.(); cleanup = null; vi.restoreAllMocks() })

	it('rejects an axis string that would inject extra axes', () => {
		const el = makeElement(nWords(7))
		applyAxisRhythm(el, getCleanHTML(el), { axis: 'wdth" 50, "wght', values: [70], period: 1 })
		const fvs = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!.style.fontVariationSettings
		expect(fvs).not.toContain('wght')
		expect(fvs).toContain('"wdth" 70')
	})

	it('ignores non-numeric values and a NaN period', () => {
		const el = makeElement(nWords(7))
		applyAxisRhythm(el, getCleanHTML(el), { values: [80, Number.NaN] as number[], period: Number.NaN })
		const fvs = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!.style.fontVariationSettings
		expect(fvs).toContain('"wdth" 80')
	})
})

describe('letter-spacing preservation keeps the author tracking', () => {
	let cleanup: (() => void) | null = null
	beforeEach(() => { document.body.innerHTML = ''; cleanup = mockMeasurement() })
	afterEach(() => { cleanup?.(); cleanup = null })

	it('adds to the computed letter-spacing instead of replacing it', () => {
		const el = makeElement(nWords(7))
		el.style.letterSpacing = '2px'
		applyAxisRhythm(el, getCleanHTML(el), { values: [100, 90], linePreservation: 'spacing' })
		const ls = el.querySelector<HTMLElement>(`.${AXIS_RHYTHM_CLASSES.line}`)!.style.letterSpacing
		expect(ls.startsWith('calc(2px')).toBe(true)
	})
})

describe('line grouping with overlapping glyph boxes', () => {
	afterEach(() => { vi.restoreAllMocks() })

	it('keeps lines apart when word boxes are taller than the line pitch (line-height: 1)', () => {
		document.body.innerHTML = ''
		let idx = 0
		// 7 words per line, lines 20px apart, but each word box is 30px tall (overlapping the next line,
		// as fonts with tall ascenders and descenders do at line-height: 1)
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
			const el = this as HTMLElement
			if (el.classList?.contains(AXIS_RHYTHM_CLASSES.word)) {
				const top = Math.floor(idx++ / 7) * 20
				return { width: 80, top, left: 0, bottom: top + 30, right: 80, height: 30, x: 0, y: top, toJSON: () => {} } as DOMRect
			}
			return { width: 600, top: 0, left: 0, bottom: 20, right: 600, height: 20, x: 0, y: 0, toJSON: () => {} } as DOMRect
		})
		const el = makeElement(nWords(14))
		applyAxisRhythm(el, getCleanHTML(el), { values: [100, 90] })
		expect(el.querySelectorAll(`.${AXIS_RHYTHM_CLASSES.line}`).length).toBe(2)
	})
})

// ─── wrapped links stay one link (2026-10) ────────────────────────────────────

describe('elements that wrap across lines', () => {
	afterEach(() => { vi.restoreAllMocks() })

	it('a link across two lines stays one <a>, with the break inside it', () => {
		const el = document.createElement('p')
		el.innerHTML = 'one two <a href="#x" id="L">three four five</a> six'
		document.body.appendChild(el)
		// Words on two lines: "one two three" | "four five six" (stub each word's line by its text)
		const second = new Set(['four', 'five', 'six'])
		const proto = HTMLElement.prototype
		const rectFor = (top: number) => ({ top, bottom: top + 20, left: 0, right: 10, width: 10, height: 20, x: 0, y: top, toJSON() {} })
		vi.spyOn(proto, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return rectFor(second.has(this.textContent ?? '') ? 20 : 0) as DOMRect })
		vi.spyOn(proto, 'getClientRects').mockImplementation(function (this: HTMLElement) { return [rectFor(second.has(this.textContent ?? '') ? 20 : 0)] as unknown as DOMRectList })
		const original = getCleanHTML(el)
		applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 96], period: 2, linePreservation: 'none' })
		expect(el.querySelectorAll('a').length).toBe(1)
		expect(el.querySelectorAll('#L').length).toBe(1)
		expect(el.querySelector('a br[data-ar-break]')).toBeTruthy()
		expect(el.textContent).toBe('one two three four five six')
		expect(new Set(Array.from(el.querySelectorAll('.ar-line'), (r) => r.getAttribute('data-ar-line')))).toEqual(new Set(['0', '1']))
		expect(getCleanHTML(el)).toBe(original)
		removeAxisRhythm(el, original)
		expect(el.innerHTML).toBe(original)
		expect(el.getAttribute('style') ?? '').toBe('')
	})
})
