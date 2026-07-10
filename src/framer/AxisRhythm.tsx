// axisRhythm/src/framer/AxisRhythm.tsx — Framer code component wrapping the axisRhythm core.
//
// Distribution: paste this file into Framer (Insert → Code → New Component), or host it as an
// ES module and add it by URL. It imports the framework-agnostic core straight from the CDN, so
// it needs no build step — the core functions take a DOM element, not React, so there is no
// React version/externalisation issue.
//
// The rendering logic mirrors the already-proven `useAxisRhythm` hook (applyAxisRhythm for a static
// snapshot, startAxisRhythm for the ambient rAF wave); the only Framer-specific additions are the
// property controls, RenderTarget gating, and layout annotations.
import { useEffect, useRef } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
// Pin to a published version so shared instances stay stable. Bump when the core changes.
// The core is framework-agnostic (operates on a DOM element), so no React externalisation is needed.
import { applyAxisRhythm, startAxisRhythm, getCleanHTML } from "https://esm.sh/@liiift-studio/axisrhythm@1.1.18"

/** Props surfaced to the Framer UI via addPropertyControls, plus base text styling.
 *  Option fields are declared explicitly so the component needs no type import over HTTP.
 *  `values` from AxisRhythmOptions is split into two numeric controls (valueLow / valueHigh)
 *  because Framer has no first-class array-of-numbers control. */
interface AxisRhythmFramerProps {
	/** The paragraph text to typeset — needs enough words to wrap across multiple lines. */
	text: string
	/** CSS font-family — MUST resolve to a variable font exposing the chosen axis. */
	fontFamily: string
	/** Font size in px. */
	fontSize: number
	/** Text colour. */
	color: string
	/** Horizontal text alignment. */
	textAlign: "left" | "center" | "right"
	/** Variable font axis tag to alternate, e.g. 'wdth' or 'wght'. */
	axis: string
	/** Axis value assigned to the first line of each cycle. */
	valueLow: number
	/** Axis value assigned to the alternate line of each cycle. */
	valueHigh: number
	/** Number of lines per cycle before the pattern repeats. */
	period: number
	/** Anchor alignment: count the cycle from the top, the bottom, or the reading-trailing edge. */
	align: "top" | "bottom" | "end"
	/** Turn the static per-line snapshot into a slow ambient wave. */
	animate: boolean
	/** Wave shape for the animated mode. */
	waveShape: "sine" | "triangle" | "spring"
	/** Animation speed multiplier (1 = one cycle per 4s). */
	speed: number
	/** Line-length preservation strategy that compensates for axis-induced width changes. */
	linePreservation: "none" | "spacing" | "scale"
}

/**
 * Deliberate per-line variable-font axis rhythm, as a Framer code component.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function AxisRhythm(props: Partial<AxisRhythmFramerProps>) {
	const {
		text = "Typography with a deliberate rhythm reads differently line by line as the axis shifts beneath the words",
		fontFamily = "Roboto Flex",
		fontSize = 40,
		color = "#111111",
		textAlign = "left",
		axis = "wdth",
		valueLow = 100,
		valueHigh = 75,
		period = 2,
		align = "top",
		animate = true,
		waveShape = "sine",
		speed = 1,
		linePreservation = "none",
	} = props

	const ref = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const el = ref.current
		if (!el) return

		const options = {
			axis,
			values: [valueLow, valueHigh],
			period,
			align,
			waveShape,
			speed,
			linePreservation,
		}
		const original = getCleanHTML(el)

		// Animate on the live site and on the editing canvas (so the designer sees the motion);
		// render a single static frame on export / thumbnails where a loop is undesirable.
		const target = RenderTarget.current()
		const canAnimate = target === RenderTarget.preview || target === RenderTarget.canvas

		if (animate && canAnimate) {
			const stop = startAxisRhythm(el, original, options)
			return () => {
				stop()
				el.innerHTML = original
			}
		}
		applyAxisRhythm(el, original, options)
		return () => {
			el.innerHTML = original
		}
	}, [
		text,
		fontFamily,
		axis,
		valueLow,
		valueHigh,
		period,
		align,
		animate,
		waveShape,
		speed,
		linePreservation,
	])

	return (
		<div
			ref={ref}
			style={{
				fontFamily,
				fontSize,
				color,
				textAlign,
				lineHeight: 1.2,
				width: "100%",
			}}
		>
			{text}
		</div>
	)
}

// Map every meaningful AxisRhythmOptions field to a Framer control.
// Omitted (cannot be a useful Framer control):
//   - source: "syllable-density" requires the `syllable` npm peer dep, unavailable in Framer's CDN runtime.
//   - lineDetection: "canvas" requires the `@chenglou/pretext` peer dep, unavailable in Framer's CDN runtime.
//   - intersect: viewport-gating is redundant for a single self-contained canvas component.
//   - syncTo: an HTMLElement reference — not expressible as a property control.
addPropertyControls(AxisRhythm, {
	text: {
		type: ControlType.String,
		title: "Text",
		defaultValue:
			"Typography with a deliberate rhythm reads differently line by line as the axis shifts beneath the words",
		displayTextArea: true,
	},
	fontFamily: {
		type: ControlType.String,
		title: "Font",
		defaultValue: "Roboto Flex",
		description: "Must be a variable font exposing the chosen axis.",
	},
	fontSize: { type: ControlType.Number, title: "Size", defaultValue: 40, min: 8, max: 400, unit: "px" },
	color: { type: ControlType.Color, title: "Colour", defaultValue: "#111111" },
	textAlign: {
		type: ControlType.Enum,
		title: "Align",
		options: ["left", "center", "right"],
		optionTitles: ["Left", "Center", "Right"],
		defaultValue: "left",
		displaySegmentedControl: true,
	},
	axis: {
		type: ControlType.String,
		title: "Axis",
		defaultValue: "wdth",
		description: "Variable font axis tag, e.g. wdth or wght.",
	},
	valueLow: { type: ControlType.Number, title: "Value A", defaultValue: 100, min: 0, max: 1000, step: 1 },
	valueHigh: { type: ControlType.Number, title: "Value B", defaultValue: 75, min: 0, max: 1000, step: 1 },
	period: { type: ControlType.Number, title: "Period", defaultValue: 2, min: 1, max: 8, step: 1, unit: "lines" },
	align: {
		type: ControlType.Enum,
		title: "Anchor",
		options: ["top", "bottom", "end"],
		optionTitles: ["Top", "Bottom", "End"],
		defaultValue: "top",
	},
	animate: { type: ControlType.Boolean, title: "Animate", defaultValue: true },
	waveShape: {
		type: ControlType.Enum,
		title: "Wave",
		options: ["sine", "triangle", "spring"],
		optionTitles: ["Sine", "Triangle", "Spring"],
		defaultValue: "sine",
		hidden: (p: Partial<AxisRhythmFramerProps>) => !p.animate,
	},
	speed: {
		type: ControlType.Number,
		title: "Speed",
		defaultValue: 1,
		min: 0.1,
		max: 4,
		step: 0.1,
		hidden: (p: Partial<AxisRhythmFramerProps>) => !p.animate,
	},
	linePreservation: {
		type: ControlType.Enum,
		title: "Line fit",
		options: ["none", "spacing", "scale"],
		optionTitles: ["None", "Spacing", "Scale"],
		defaultValue: "none",
		description: "Compensate for axis-induced width changes to keep line endings stable.",
	},
})
