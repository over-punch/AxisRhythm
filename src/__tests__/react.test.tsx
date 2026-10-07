// axis-rhythm/src/__tests__/react.test.tsx — @testing-library/react hook and component tests
import React from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useAxisRhythm } from '../react/useAxisRhythm'
import { AxisRhythmText } from '../react/AxisRhythmText'
import { AXIS_RHYTHM_CLASSES } from '../core/types'

// ─── DOM measurement mock (mirrors pattern from adjust.test.ts) ───────────────

const CONTAINER_W = 600
const WORD_W = 80

let wordCallIndex = 0

/**
 * Mocks offsetWidth and getBoundingClientRect on prototypes so happy-dom returns
 * useful dimensions. Returns a cleanup function that restores originals.
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

// ─── useAxisRhythm hook tests ─────────────────────────────────────────────────

describe('useAxisRhythm', () => {
	let cleanupMock: (() => void) | null = null

	beforeEach(() => {
		document.body.innerHTML = ''
		cleanupMock = mockMeasurement()
	})

	afterEach(() => {
		cleanupMock?.()
		cleanupMock = null
		vi.restoreAllMocks()
	})

	it('mounts without throwing', () => {
		expect(() => {
			renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96], period: 2 }))
		}).not.toThrow()
	})

	it('returns a ref object', () => {
		const { result } = renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96] }))
		expect(result.current).toBeDefined()
		expect(typeof result.current).toBe('object')
		expect('current' in result.current).toBe(true)
	})

	it('unmounts without throwing', () => {
		const { unmount } = renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96], period: 2 }))
		expect(() => unmount()).not.toThrow()
	})

	it('re-runs without throwing when options change', () => {
		const { rerender } = renderHook(
			({ values }: { values: number[] }) => useAxisRhythm({ axis: 'wdth', values, period: 2 }),
			{ initialProps: { values: [100, 96] } },
		)
		expect(() => {
			act(() => {
				rerender({ values: [100, 90] })
			})
		}).not.toThrow()
	})

	it('mounts without throwing in animate mode', () => {
		expect(() => {
			const { unmount } = renderHook(() =>
				useAxisRhythm({ axis: 'wdth', values: [100, 96], period: 2, animate: true, speed: 1 }),
			)
			unmount()
		}).not.toThrow()
	})

	it('re-measures the lines when the width changes in animate mode', () => {
		// Regression: the animated branch never observed the element, so after the container narrowed the
		// lines stayed locked at their old breaks and overflowed (336 px in the site demo, 1440 → 800 px).
		const observers: { cb: ResizeObserverCallback; targets: Element[] }[] = []
		class FakeResizeObserver {
			private record: { cb: ResizeObserverCallback; targets: Element[] }
			constructor(cb: ResizeObserverCallback) { this.record = { cb, targets: [] }; observers.push(this.record) }
			observe(target: Element) { this.record.targets.push(target) }
			unobserve() {}
			disconnect() { this.record.targets.length = 0 }
		}
		vi.stubGlobal('ResizeObserver', FakeResizeObserver)
		// Run rAF callbacks synchronously, once each (the wave's own loop is not followed).
		let depth = 0
		vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { if (depth === 0) { depth++; fn(0); depth-- } return 1 })
		vi.stubGlobal('cancelAnimationFrame', () => {})

		const { container, unmount } = render(
			<AxisRhythmText axis="wdth" values={[100, 96]} period={2} animate>
				one two three four five six seven eight nine ten eleven twelve thirteen fourteen
			</AxisRhythmText>,
		)
		const el = container.firstElementChild as HTMLElement
		const observed = observers.filter((o) => o.targets.includes(el))
		expect(observed.length).toBe(1)

		/** Reports a content width to the hook's observer. */
		const report = (width: number) => act(() => { observed[0].cb([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver) })
		report(600) // the initial report on observe(): the width already measured
		const before = el.querySelector(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(before).not.toBeNull()
		report(600)
		expect(el.querySelector(`.${AXIS_RHYTHM_CLASSES.line}`)).toBe(before) // same width: nothing rebuilt
		report(300)
		const after = el.querySelector(`.${AXIS_RHYTHM_CLASSES.line}`)
		expect(after).not.toBeNull()
		expect(after).not.toBe(before) // narrower: lines rebuilt from the original text

		unmount()
		expect(observed[0].targets.length).toBe(0)
		vi.unstubAllGlobals()
	})

	it('mounts without throwing with align bottom', () => {
		expect(() => {
			renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96], period: 2, align: 'bottom' }))
		}).not.toThrow()
	})

	it('mounts without throwing with linePreservation spacing', () => {
		expect(() => {
			renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96], linePreservation: 'spacing' }))
		}).not.toThrow()
	})

	it('mounts without throwing with linePreservation scale', () => {
		expect(() => {
			renderHook(() => useAxisRhythm({ axis: 'wdth', values: [100, 96], linePreservation: 'scale' }))
		}).not.toThrow()
	})

	it('mounts without throwing with waveShape triangle in animate mode', () => {
		expect(() => {
			const { unmount } = renderHook(() =>
				useAxisRhythm({ axis: 'wdth', values: [100, 96], animate: true, waveShape: 'triangle' }),
			)
			unmount()
		}).not.toThrow()
	})

	it('mounts without throwing with empty options', () => {
		expect(() => {
			renderHook(() => useAxisRhythm({}))
		}).not.toThrow()
	})
})

// ─── AxisRhythmText component tests ──────────────────────────────────────────

describe('AxisRhythmText', () => {
	let cleanupMock: (() => void) | null = null

	beforeEach(() => {
		document.body.innerHTML = ''
		cleanupMock = mockMeasurement()
	})

	afterEach(() => {
		cleanupMock?.()
		cleanupMock = null
		vi.restoreAllMocks()
	})

	it('renders without throwing', () => {
		expect(() => {
			render(<AxisRhythmText values={[100, 96]}>Hello world</AxisRhythmText>)
		}).not.toThrow()
	})

	it('renders children text content', () => {
		const { container } = render(
			<AxisRhythmText values={[100, 96]}>Hello world</AxisRhythmText>,
		)
		expect(container.textContent).toContain('Hello')
		expect(container.textContent).toContain('world')
	})

	it('renders a <p> element by default', () => {
		const { container } = render(
			<AxisRhythmText values={[100, 96]}>Some text</AxisRhythmText>,
		)
		expect(container.querySelector('p')).toBeTruthy()
	})

	it('renders the element specified by the `as` prop', () => {
		const { container } = render(
			<AxisRhythmText as="div" values={[100, 96]}>Some text</AxisRhythmText>,
		)
		expect(container.querySelector('div')).toBeTruthy()
		expect(container.querySelector('p')).toBeFalsy()
	})

	it('forwards className to the root element', () => {
		const { container } = render(
			<AxisRhythmText className="my-class" values={[100, 96]}>Text</AxisRhythmText>,
		)
		const root = container.querySelector('p')
		expect(root?.classList.contains('my-class')).toBe(true)
	})

	it('forwards aria-label to the root element', () => {
		const { container } = render(
			<AxisRhythmText aria-label="descriptive label" values={[100, 96]}>Text</AxisRhythmText>,
		)
		const root = container.querySelector('p')
		expect(root?.getAttribute('aria-label')).toBe('descriptive label')
	})

	it('forwards data attributes to the root element', () => {
		const { container } = render(
			<AxisRhythmText data-testid="ar-text" values={[100, 96]}>Text</AxisRhythmText>,
		)
		const root = container.querySelector('[data-testid="ar-text"]')
		expect(root).toBeTruthy()
	})

	it('unmounts without throwing', () => {
		const { unmount } = render(
			<AxisRhythmText values={[100, 96]}>Text</AxisRhythmText>,
		)
		expect(() => unmount()).not.toThrow()
	})

	it('displays name is set', () => {
		expect(AxisRhythmText.displayName).toBe('AxisRhythmText')
	})

	it('renders without throwing in animate mode', () => {
		expect(() => {
			const { unmount } = render(
				<AxisRhythmText values={[100, 96]} animate speed={0.5}>
					Animated text content here
				</AxisRhythmText>,
			)
			unmount()
		}).not.toThrow()
	})

	it('renders without throwing with align end', () => {
		expect(() => {
			render(
				<AxisRhythmText values={[100, 96]} align="end">
					Text with end alignment
				</AxisRhythmText>,
			)
		}).not.toThrow()
	})

	it('forwards style prop to the root element', () => {
		const { container } = render(
			<AxisRhythmText style={{ color: 'red' }} values={[100, 96]}>Text</AxisRhythmText>,
		)
		const root = container.querySelector('p') as HTMLElement
		expect(root?.style.color).toBe('red')
	})
})
