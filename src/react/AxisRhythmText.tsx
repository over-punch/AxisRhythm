// axis-rhythm/src/react/AxisRhythmText.tsx — React component wrapper
import React, { Children, forwardRef, isValidElement, useCallback, useRef } from 'react'
import { useAxisRhythm } from './useAxisRhythm'
import type { AxisRhythmOptions } from '../core/types'

/** Algorithm options — these are consumed by the hook, not forwarded to the DOM element */
const ALGORITHM_OPTION_KEYS: (keyof AxisRhythmOptions)[] = [
	'axis', 'values', 'period', 'align', 'source', 'lineDetection',
	'linePreservation', 'animate', 'waveShape', 'speed', 'intersect', 'syncTo',
]

interface AxisRhythmTextProps extends AxisRhythmOptions {
	children: React.ReactNode
	className?: string
	style?: React.CSSProperties
	/** HTML element to render. Default: 'p' */
	as?: React.ElementType
	/** Any other HTML attributes (aria-*, data-*, id, etc.) are forwarded to the element */
	[key: string]: unknown
}

/**
 * A string that changes whenever the rendered content of `children` changes: text, element types,
 * keys and primitive props, walked recursively. Functions and objects are ignored.
 */
function childrenSignature(children: React.ReactNode): string {
	const parts: string[] = []
	const walk = (node: React.ReactNode) => {
		Children.forEach(node, (child) => {
			if (child === null || child === undefined || typeof child === 'boolean') return
			if (typeof child === 'string' || typeof child === 'number') { parts.push(String(child)); return }
			if (isValidElement(child)) {
				const type = typeof child.type === 'string' ? child.type : ((child.type as { displayName?: string; name?: string }).displayName ?? (child.type as { name?: string }).name ?? 'C')
				const props = child.props as Record<string, unknown>
				const attrs = Object.keys(props).filter((k) => k !== 'children' && ['string', 'number', 'boolean'].includes(typeof props[k])).sort().map((k) => `${k}=${String(props[k])}`)
				parts.push(`<${type}${child.key != null ? '#' + child.key : ''} ${attrs.join(' ')}>`)
				walk(props.children as React.ReactNode)
				parts.push(`</${type}>`)
			}
		})
	}
	walk(children)
	return parts.join('\u0000')
}

/**
 * Drop-in component that applies the axis-rhythm effect to its children.
 * Forwards the ref to the root element while also attaching the internal hook ref.
 * ARIA attributes and other HTML attributes passed as props are forwarded to the element.
 */
export const AxisRhythmText = forwardRef<HTMLElement, AxisRhythmTextProps>(
	function AxisRhythmText({ children, className, style, as: Tag = 'p', ...rest }, ref) {
		// Separate algorithm options from HTML attributes so ARIA/data attrs reach the DOM
		const options: AxisRhythmOptions = {}
		const htmlProps: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(rest)) {
			if ((ALGORITHM_OPTION_KEYS as string[]).includes(key)) {
				;(options as Record<string, unknown>)[key] = val
			} else {
				htmlProps[key] = val
			}
		}

		// The library replaces the element's DOM, so React can't patch new children into it. When the
		// children's content changes, remount the element (key) and re-apply to the fresh content.
		const contentKey = childrenSignature(children as React.ReactNode)
		const innerRef = useAxisRhythm(options, contentKey)

		// Use a ref to hold the callback so the identity stays stable across renders
		// without needing to list innerRef in the useCallback deps (it is a stable ref object).
		const mergedRefFnRef = useRef<((node: HTMLElement | null) => void) | null>(null)
		if (!mergedRefFnRef.current) {
			mergedRefFnRef.current = (node: HTMLElement | null) => {
				// Assign to the internal hook ref's mutable backing storage.
				// useRef returns an object whose .current is writable; the cast
				// is required because React types it as RefObject (read-only) in React 19.
				;(innerRef as React.MutableRefObject<HTMLElement | null>).current = node
				if (typeof ref === 'function') {
					ref(node)
				} else if (ref) {
					;(ref as React.MutableRefObject<HTMLElement | null>).current = node
				}
			}
		}

		const mergedRef = useCallback(
			(node: HTMLElement | null) => mergedRefFnRef.current?.(node),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[ref],
		)

		return (
			<Tag key={contentKey} ref={mergedRef} className={className} style={style} {...htmlProps}>
				{children}
			</Tag>
		)
	},
)

AxisRhythmText.displayName = 'AxisRhythmText'
