// axis-rhythm/src/react/useAxisRhythm.ts — React hook
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { applyAxisRhythm, startAxisRhythm, getCleanHTML } from '../core/adjust'
import type { AxisRhythmOptions } from '../core/types'

/**
 * React hook that applies the axis-rhythm effect to a ref'd element.
 * When `options.animate` is true, starts a continuous rAF wave via `startAxisRhythm`
 * and returns a stop function on unmount. Otherwise uses `applyAxisRhythm` as a
 * static snapshot and re-runs on resize (width changes only).
 *
 * When `options.intersect` is true:
 * - Static mode: skips the initial layout pass; an IntersectionObserver runs
 *   `applyAxisRhythm` the first time the element enters the viewport and again
 *   each time it re-enters.
 * - Animated mode: the rAF loop is managed by `startAxisRhythm` (pause/resume
 *   handled there via its own IntersectionObserver).
 */
export function useAxisRhythm(options: AxisRhythmOptions, contentKey?: string) {
	// contentKey: pass a value that changes when the element's content changes (AxisRhythmText derives
	// one from its children). The library rewrites the element's DOM, so new content needs a fresh
	// element and a fresh snapshot rather than React patching nodes that are no longer on the page.
	const ref = useRef<HTMLElement>(null)
	const originalHTMLRef = useRef<string | null>(null)
	/** The element originalHTMLRef was read from; a new element (e.g. after a content change) is read afresh. */
	const sourceElRef = useRef<HTMLElement | null>(null)
	const optionsRef = useRef(options)
	optionsRef.current = options
	const stopRef = useRef<(() => void) | null>(null)

	const { axis, values, period, align, source, lineDetection, linePreservation, animate, waveShape, speed, syncTo, intersect } = options

	// Serialise the full values array so that changes to any element — including
	// values[2] and beyond (valid when period > 2) — trigger a re-run. A JSON string
	// is a stable scalar dep that correctly tracks deep equality for number arrays.
	const valuesKey = values ? JSON.stringify(values) : undefined

	const run = useCallback(() => {
		const el = ref.current
		if (!el) return
		if (originalHTMLRef.current === null || sourceElRef.current !== el) {
			originalHTMLRef.current = getCleanHTML(el)
			sourceElRef.current = el
		}
		// Stop any running animation before re-running
		if (stopRef.current) {
			stopRef.current()
			stopRef.current = null
		}
		if (optionsRef.current.animate) {
			stopRef.current = startAxisRhythm(el, originalHTMLRef.current, optionsRef.current)
		} else {
			applyAxisRhythm(el, originalHTMLRef.current, optionsRef.current)
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [axis, valuesKey, period, align, source, lineDetection, linePreservation, animate, waveShape, speed, syncTo, intersect, contentKey])

	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return

		// Animated mode: startAxisRhythm handles its own IntersectionObserver internally.
		if (optionsRef.current.animate) {
			run()
			return () => {
				if (stopRef.current) {
					stopRef.current()
					stopRef.current = null
				}
			}
		}

		// Static + intersect mode: defer layout until the element enters the viewport.
		// An IntersectionObserver re-runs applyAxisRhythm each time the element
		// scrolls into view, keeping the effect fresh after layout changes.
		if (optionsRef.current.intersect && typeof IntersectionObserver !== 'undefined') {
			let lastWidth = 0
			let roRafId = 0

			const io = new IntersectionObserver((entries) => {
				if (!entries[entries.length - 1].isIntersecting) return
				lastWidth = Math.round((ref.current?.getBoundingClientRect().width) ?? 0)
				run()
			})
			io.observe(el)

			// Still respond to width changes while the element is in view.
			let ro: ResizeObserver | null = null
			if (typeof ResizeObserver !== 'undefined') {
				ro = new ResizeObserver((entries) => {
					const w = Math.round(entries[0].contentRect.width)
					if (w === lastWidth) return
					lastWidth = w
					cancelAnimationFrame(roRafId)
					roRafId = requestAnimationFrame(run)
				})
				ro.observe(el)
			}

			return () => {
				io.disconnect()
				ro?.disconnect()
				cancelAnimationFrame(roRafId)
			}
		}

		// Default static mode: run immediately and re-run on width changes.
		run()

		if (typeof ResizeObserver === 'undefined') return

		let lastWidth = 0
		let rafId = 0
		const ro = new ResizeObserver((entries) => {
			const w = Math.round(entries[0].contentRect.width)
			if (w === lastWidth) return
			lastWidth = w
			cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(run)
		})
		ro.observe(el)
		return () => {
			ro.disconnect()
			cancelAnimationFrame(rafId)
		}
	}, [run])

	// Rerun after fonts finish loading — measurements taken before font-swap
	// (font-display: swap) use the fallback font's widths and produce wrong
	// letter-spacing or scaleX compensation. document.fonts.ready resolves once
	// all @font-face rules have finished loading.
	//
	// A mounted guard prevents the callback from running on a detached element if
	// the component unmounts before fonts have finished loading, and also prevents
	// the extra synchronous microtask re-run that occurs when fonts.ready is already
	// resolved (which happens on every subsequent prop change).
	useEffect(() => {
		if (typeof document === 'undefined' || !document.fonts?.ready) return
		// Only run once per mount: if fonts are already loaded, skip the re-run.
		if (document.fonts.status === 'loaded') return
		let mounted = true
		document.fonts.ready.then(() => {
			if (mounted) run()
		})
		return () => { mounted = false }
	}, [run])

	return ref
}
