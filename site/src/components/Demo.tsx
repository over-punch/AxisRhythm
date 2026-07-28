"use client"

// Interactive axis rhythm demo with live controls, cursor/gyro modes, and period slider
import { useState, useEffect, useDeferredValue, useCallback, memo, useMemo } from "react"
import { useMediaQuery, useClientValue } from "@/lib/clientValue"
import { AxisRhythmText } from "@liiift-studio/axisrhythm"
import type { AxisRhythmOptions } from "@liiift-studio/axisrhythm"

type LinePreservation = NonNullable<AxisRhythmOptions['linePreservation']>

const PARAGRAPHS = [
	`Typography has always been as much about texture as legibility. The even grey of a well-set paragraph — called its colour by compositors — depends on consistency: consistent spacing, consistent weight, consistent rhythm from line to line.`,
	`Variable fonts crack this open. The wdth axis can compress or expand a letterform; the wght axis can lighten or darken it; the opsz axis can adjust optical weight for the point size. Applied uniformly, these give you a different typeface.`,
	`Applied line by line, they give you something more interesting: a paragraph with rhythm. Each line carries a different setting but the text reads as one. The difference is a texture the eye feels before the mind names it.`,
]

/** Per-axis slider config: range and sensible defaults */
const AXIS_CONFIG = {
	wdth: { min: 60, max: 125, step: 1, defaultHigh: 110, defaultLow: 70 },
	wght: { min: 100, max: 900, step: 10, defaultHigh: 700, defaultLow: 300 },
} as const

type AxisKey = keyof typeof AXIS_CONFIG

/** Labelled range slider with value displayed below the track */
const Slider = memo(function Slider({ label, value, min, max, step, onChange, title, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; title?: string; disabled?: boolean }) {
	return (
		<div className="flex flex-col gap-1" style={{ opacity: disabled ? 0.35 : 1, transition: 'opacity 0.15s ease' }}>
			<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">{label}</span>
			<input type="range" min={min} max={max} step={step} value={value} aria-label={label} title={title} disabled={disabled} onChange={e => onChange(Number(e.target.value))} onTouchStart={e => e.stopPropagation()} style={{ touchAction: 'none' }} />
			<span className="tabular-nums text-xs text-muted text-right">{value}</span>
		</div>
	)
})

/** Before/after toggle — left half = without effect, right half filled = with effect */
const BeforeAfterToggle = memo(function BeforeAfterToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			aria-label="Toggle before/after comparison"
			aria-pressed={active}
			title={active ? 'Hide comparison' : 'Compare without effect'}
			style={{
				position: 'absolute', bottom: 0, right: 0,
				// 44×44 touch target (WCAG 2.5.5) — visual circle stays 32px via padding
				width: 44, height: 44,
				padding: 6,
				background: 'transparent',
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				cursor: 'pointer',
			}}
		>
			<span style={{
				width: 32, height: 32, borderRadius: '50%',
				border: '1px solid currentColor',
				opacity: active ? 0.8 : 0.25,
				display: 'flex', alignItems: 'center', justifyContent: 'center',
				transition: 'opacity 0.15s ease',
			}}>
				<svg width="14" height="10" viewBox="0 0 14 10" fill="none">
					<rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1"/>
					<line x1="7" y1="0.5" x2="7" y2="9.5" stroke="currentColor" strokeWidth="1"/>
					<rect x="8" y="1.5" width="5" height="7" fill="currentColor"/>
				</svg>
			</span>
		</button>
	)
})

/** Cursor icon SVG */
function CursorIcon() {
	return (
		<svg width="11" height="14" viewBox="0 0 11 14" fill="currentColor" aria-hidden>
			<path d="M0 0L0 11L3 8L5 13L6.8 12.3L4.8 7.3L8.5 7.3Z" />
		</svg>
	)
}

/** Gyroscope icon SVG — circle with rotation arrow */
function GyroIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
			<circle cx="7" cy="7" r="5.5" />
			<circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
			<path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" strokeWidth="1.4" />
			<path d="M11.5 5.5 L12.5 7 L13.8 6" strokeWidth="1.2" />
		</svg>
	)
}

export default function Demo() {
	const [axis, setAxis] = useState<AxisKey>('wght')
	const [valueHigh, setValueHigh] = useState<number>(AXIS_CONFIG.wght.defaultHigh)
	const [valueLow, setValueLow] = useState<number>(AXIS_CONFIG.wght.defaultLow)
	const [period, setPeriod] = useState(2)
	const [align, setAlign] = useState<'top' | 'bottom'>('top')
	const [linePreservation, setLinePreservation] = useState<LinePreservation>('spacing')
	const [beforeAfter, setComparing] = useState(false)

	// Interaction modes — mutually exclusive
	const [cursorMode, setCursorMode] = useState(false)
	const [gyroMode, setGyroMode] = useState(false)
	// Error state for when gyro permission is denied
	const [gyroError, setGyroError] = useState<string | null>(null)

	// Gyro-driven values — kept separate from slider state so slider value props
	// never change during gyro mode (which would cause mobile to scroll to the input)
	const [gyroHigh, setGyroHigh] = useState<number>(AXIS_CONFIG.wght.defaultHigh)
	const [gyroLow, setGyroLow] = useState<number>(AXIS_CONFIG.wght.defaultLow)

	// Detected capabilities — resolved client-side after mount
	const showCursor = useMediaQuery('(hover: hover)')
	const isTouch = useMediaQuery('(hover: none)')
	const hasOrientation = useClientValue(() => 'DeviceOrientationEvent' in window, false)
	const showGyro = isTouch && hasOrientation

	const cfg = AXIS_CONFIG[axis]

	const handleAxisChange = useCallback((next: AxisKey) => {
		setAxis(next)
		setValueHigh(AXIS_CONFIG[next].defaultHigh)
		setValueLow(AXIS_CONFIG[next].defaultLow)
		setGyroHigh(AXIS_CONFIG[next].defaultHigh)
		setGyroLow(AXIS_CONFIG[next].defaultLow)
	}, [])

	// Effective values: gyro-driven when gyroMode is active, slider-driven otherwise
	const effectiveHigh = gyroMode ? gyroHigh : valueHigh
	const effectiveLow = gyroMode ? gyroLow : valueLow

	const dValueHigh = useDeferredValue(effectiveHigh)
	const dValueLow = useDeferredValue(effectiveLow)
	const dPeriod = useDeferredValue(period)

	// Cursor mode — X controls valueHigh (mapped to cfg.min–cfg.max), Y controls valueLow (inverted: top=high)
	useEffect(() => {
		if (!cursorMode) return
		const step = cfg.step
		const handleMove = (e: MouseEvent) => {
			const rawHigh = (e.clientX / window.innerWidth) * (cfg.max - cfg.min) + cfg.min
			const rawLow = (1 - e.clientY / window.innerHeight) * (cfg.max - cfg.min) + cfg.min
			setValueHigh(Math.round(rawHigh / step) * step)
			setValueLow(Math.round(rawLow / step) * step)
		}
		const handleKey = (e: KeyboardEvent) => {
			// Only exit cursor mode when no input/textarea is focused
			if (e.key === 'Escape') {
				const active = document.activeElement
				if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
					setCursorMode(false)
				}
			}
		}
		window.addEventListener('mousemove', handleMove)
		window.addEventListener('keydown', handleKey)
		return () => {
			window.removeEventListener('mousemove', handleMove)
			window.removeEventListener('keydown', handleKey)
		}
	}, [cursorMode, cfg])

	// Gyro mode — gamma → gyroHigh, beta → gyroLow.
	// Updates gyroHigh/gyroLow (not slider state) so slider value props stay frozen,
	// preventing mobile browsers from scrolling to the input on each orientation update.
	// rAF throttle limits re-renders to one per frame.
	useEffect(() => {
		if (!gyroMode) return
		let rafId: number | null = null
		const step = cfg.step
		const handleOrientation = (e: DeviceOrientationEvent) => {
			if (rafId !== null) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				if (e.gamma !== null) {
					// gamma: -90 (tilt left) to 90 (tilt right) → cfg.min–cfg.max
					const raw = ((e.gamma + 90) / 180) * (cfg.max - cfg.min) + cfg.min
					setGyroHigh(Math.round(raw / step) * step)
				}
				if (e.beta !== null) {
					// beta when holding portrait: ~90 upright, decreases when tilted back toward you
					// Clamp to [15, 90] then invert: tilt back = higher value
					const clamped = Math.max(15, Math.min(90, e.beta))
					const raw = ((90 - clamped) / 75) * (cfg.max - cfg.min) + cfg.min
					setGyroLow(Math.round(raw / step) * step)
				}
			})
		}
		window.addEventListener('deviceorientation', handleOrientation)
		return () => {
			window.removeEventListener('deviceorientation', handleOrientation)
			if (rafId !== null) cancelAnimationFrame(rafId)
		}
	}, [gyroMode, cfg])

	// Toggle cursor mode — turns off gyro if active, seeds initial values from current mouse position
	const toggleCursor = useCallback((e: React.MouseEvent) => {
		setGyroMode(false)
		setGyroError(null)
		setCursorMode(v => {
			if (!v) {
				// Pre-seed values from the click position to avoid jump on first mousemove
				const step = cfg.step
				const rawHigh = (e.clientX / window.innerWidth) * (cfg.max - cfg.min) + cfg.min
				const rawLow = (1 - e.clientY / window.innerHeight) * (cfg.max - cfg.min) + cfg.min
				setValueHigh(Math.round(rawHigh / step) * step)
				setValueLow(Math.round(rawLow / step) * step)
			}
			return !v
		})
	}, [cfg])

	// Toggle gyro mode — requests iOS permission if needed, turns off cursor if active
	const toggleGyro = useCallback(async () => {
		if (gyroMode) {
			setGyroMode(false)
			setGyroError(null)
			return
		}
		setCursorMode(false)
		setGyroError(null)
		try {
			const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
				requestPermission?: () => Promise<PermissionState>
			}
			if (typeof DOE.requestPermission === 'function') {
				const permission = await DOE.requestPermission()
				if (permission === 'granted') {
					setGyroMode(true)
				} else {
					setGyroError('Motion access denied. Enable in Settings → Safari → Motion & Orientation Access.')
				}
			} else {
				setGyroMode(true)
			}
		} catch {
			setGyroError('Could not request motion permission.')
		}
	}, [gyroMode])

	const toggleComparing = useCallback(() => setComparing(v => !v), [])

	// Memoised sample style — stable reference avoids unnecessary AxisRhythmText re-runs
	const sampleStyle = useMemo<React.CSSProperties>(() => ({
		fontFamily: "var(--font-merriweather), serif",
		fontSize: "1.125rem",
		lineHeight: "1.8",
		fontVariationSettings: '"wght" 300, "opsz" 18, "wdth" 100',
	}), [])

	const activeMode = cursorMode || gyroMode

	return (
		<div className="w-full">
			{/* Responsive grid — single column on narrow mobile, three columns on sm+ */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
				<Slider label="Axis High" value={valueHigh} min={cfg.min} max={cfg.max} step={cfg.step} onChange={setValueHigh} disabled={gyroMode} title="The maximum axis value assigned to lines — lines at the peak of each wave cycle will use this setting" />
				<Slider label="Axis Low" value={valueLow} min={cfg.min} max={cfg.max} step={cfg.step} onChange={setValueLow} disabled={gyroMode} title="The minimum axis value assigned to lines — lines at the trough of each wave cycle will use this setting" />
				<Slider label="Period" value={period} min={1} max={6} step={1} onChange={setPeriod} title="How many lines it takes to complete one full high-to-low-to-high cycle — shorter period = tighter alternation, longer = slower rhythm" />
			</div>
			<div className="flex flex-wrap items-center gap-3 mb-8">
				<div role="group" aria-label="Axis" className="flex items-center gap-2">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Axis</span>
					{(['wdth', 'wght'] as const).map(v => (
						<button key={v} onClick={() => handleAxisChange(v)} aria-pressed={axis === v} title={v === 'wdth' ? 'Animate the width axis — varies how condensed or expanded each line appears' : 'Animate the weight axis — varies how light or heavy each line appears'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: axis === v ? 1 : 0.5, background: axis === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>
				<div role="group" aria-label="Align" className="flex items-center gap-2 ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Align</span>
					{(['top', 'bottom'] as const).map(v => (
						<button key={v} onClick={() => setAlign(v)} aria-pressed={align === v} title={v === 'top' ? 'Align lines to the top baseline — rhythm starts from the first line downward' : 'Align lines to the bottom baseline — rhythm starts from the last line upward'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: align === v ? 1 : 0.5, background: align === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>
				<div role="group" aria-label="Preserve" className="flex items-center gap-2 ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Preserve</span>
					{(['none', 'spacing', 'scale'] as const).map(v => (
						<button key={v} onClick={() => setLinePreservation(v)} aria-pressed={linePreservation === v} title={v === 'none' ? 'No compensation — axis changes may shift line heights and cause ragged paragraph edges' : v === 'spacing' ? 'Adjust letter-spacing per line to keep each line the same length despite axis variation' : 'Scale each line uniformly to keep line lengths consistent despite axis variation'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: linePreservation === v ? 1 : 0.5, background: linePreservation === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>

				{/* Cursor mode — desktop/hover-capable devices only */}
				{showCursor && (
					<button
						onClick={toggleCursor}
						aria-label={cursorMode ? 'Deactivate cursor mode' : 'Activate cursor mode — move cursor to control axis values'}
						aria-pressed={cursorMode}
						title="Move your cursor to control high value (X) and low value (Y)"
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ml-auto"
						style={{
							borderColor: 'currentColor',
							opacity: cursorMode ? 1 : 0.5,
							background: cursorMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<CursorIcon />
						<span>{cursorMode ? 'Esc to exit' : 'Cursor'}</span>
					</button>
				)}

				{/* Gyro mode — touch devices with DeviceOrientationEvent */}
				{showGyro && (
					<button
						onClick={toggleGyro}
						aria-label={gyroMode ? 'Deactivate tilt mode' : 'Activate tilt mode — tilt device to control axis values'}
						aria-pressed={gyroMode}
						title="Tilt your device to control high value (left/right) and low value (front/back)"
						className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ml-auto"
						style={{
							borderColor: 'currentColor',
							opacity: gyroMode ? 1 : 0.5,
							background: gyroMode ? 'var(--btn-bg)' : 'transparent',
						}}
					>
						<GyroIcon />
						<span>{gyroMode ? 'Tilt active' : 'Tilt'}</span>
					</button>
				)}
			</div>
			{/* Permission-denied feedback for gyro mode */}
			{gyroError && (
				<p className="text-xs mb-4" style={{ color: 'oklch(0.75 0.18 30)' }} role="alert">{gyroError}</p>
			)}
			<div className="relative pb-8">
				<div className="flex flex-col gap-8">
					{PARAGRAPHS.map((para) => (
						<AxisRhythmText key={para.slice(0, 20)} axis={axis} values={[dValueHigh, dValueLow]} period={dPeriod} align={align} linePreservation={linePreservation} style={sampleStyle}>
							{para}
						</AxisRhythmText>
					))}
				</div>
				{beforeAfter && (
					<div aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: '100%', pointerEvents: 'none', opacity: 0.25 }} className="flex flex-col gap-8">
						{PARAGRAPHS.map((para) => (
							<p key={para.slice(0, 20)} style={{ ...sampleStyle, margin: 0 }}>{para}</p>
						))}
					</div>
				)}
				<BeforeAfterToggle active={beforeAfter} onClick={toggleComparing} />
			</div>
			<div className="flex items-center gap-3 mt-8" aria-live="polite">
				{activeMode && (
					<p className="text-xs text-muted italic" style={{ lineHeight: "1.8" }}>
						{cursorMode ? 'Move cursor: X for high value, Y for low. Press Esc to exit.' : 'Tilt left/right for high value, front/back for low.'}
					</p>
				)}
				{!activeMode && (
					<p className="text-xs text-muted italic" style={{ lineHeight: "1.8" }}>Each line gets a different axis value. The paragraph reads as one — like column highlighting for text. The alternation gives the eye a subtle landmark on every line, so it can track its position and find the start of the next without losing its place.</p>
				)}
			</div>
		</div>
	)
}
