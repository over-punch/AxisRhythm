"use client"

// Interactive axis rhythm demo: axis, period and preservation controls, an animated wave, English/Japanese/Arabic samples, and cursor/gyro modes
import { useState, useEffect, useDeferredValue, useCallback, memo, useMemo } from "react"
import { useMediaQuery, useClientValue } from "@/lib/clientValue"
import { AxisRhythmText } from "@overpunch/axisrhythm"
import type { AxisRhythmOptions } from "@overpunch/axisrhythm"

type LinePreservation = NonNullable<AxisRhythmOptions['linePreservation']>

/** Slider range and starting values for one axis of one sample font (axis units; wdth is a percentage). */
interface AxisRange { min: number; max: number; step: number; defaultHigh: number; defaultLow: number }

/** One demo sample: its language, writing direction, variable font, the axes that font really has, and its text. */
interface Sample {
	label: string
	lang: string
	dir: 'ltr' | 'rtl'
	fontFamily: string
	axes: { wght: AxisRange; wdth?: AxisRange }
	paragraphs: string[]
}

/**
 * Demo samples. Axis ranges are each font's real fvar ranges, so every slider position changes the text:
 * Merriweather wght 300–900 and wdth 87–112; Noto Sans JP and Noto Sans Arabic (as served by Google Fonts) wght 100–900.
 */
const SAMPLES = {
	en: {
		label: 'English',
		lang: 'en',
		dir: 'ltr',
		fontFamily: 'var(--font-merriweather), serif',
		axes: {
			wght: { min: 300, max: 900, step: 10, defaultHigh: 700, defaultLow: 300 },
			wdth: { min: 87, max: 112, step: 1, defaultHigh: 112, defaultLow: 87 },
		},
		paragraphs: [
			`Typography has always been as much about texture as legibility. The even grey of a well-set paragraph — called its colour by compositors — depends on consistency: consistent spacing, consistent weight, consistent rhythm from line to line.`,
			`Variable fonts crack this open. The wdth axis can compress or expand a letterform; the wght axis can lighten or darken it; the opsz axis can adjust optical weight for the point size. Applied uniformly, these give you a different typeface.`,
			`Applied line by line, they give you something more interesting: a paragraph with rhythm. Each line carries a different setting but the text reads as one. The difference is a texture the eye feels before the mind names it.`,
		],
	},
	ja: {
		label: '日本語',
		lang: 'ja',
		dir: 'ltr',
		fontFamily: 'var(--font-noto-jp), sans-serif',
		axes: { wght: { min: 100, max: 900, step: 10, defaultHigh: 700, defaultLow: 300 } },
		paragraphs: [
			`タイポグラフィは、読みやすさと同じくらい、紙面の質感にかかわる仕事です。よく組まれた段落は均一な灰色に見えますが、その均一さは、字間、太さ、行ごとのリズムがそろってはじめて生まれます。`,
			`バリアブルフォントを使えば、行ごとに太さを少しずつ変えることができます。日本語は単語の間に空白がないので、行は文字と文字の間で折り返されます。Axis Rhythm はその折り返しをそのまま保ちます。`,
		],
	},
	ar: {
		label: 'العربية',
		lang: 'ar',
		dir: 'rtl',
		fontFamily: 'var(--font-noto-ar), sans-serif',
		axes: { wght: { min: 100, max: 900, step: 10, defaultHigh: 700, defaultLow: 300 } },
		paragraphs: [
			`الطباعة ليست وضوح الحروف فقط، بل هي أيضًا ملمس الصفحة. الفقرة المصفوفة بعناية تبدو كتلة رمادية متساوية، وهذا التساوي يأتي من انتظام المسافات والوزن والإيقاع من سطر إلى سطر.`,
			`الخطوط المتغيرة تسمح بتغيير وزن كل سطر على حدة. النص العربي يُكتب من اليمين إلى اليسار، وحروفه تتصل ببعضها، ولذلك تبقى كل كلمة قطعة واحدة ويبقى كل سطر في مكانه.`,
		],
	},
} as const satisfies Record<string, Sample>

/**
 * Axis values for one cycle: `period` values stepping evenly from `high` to `low`, so every line in the
 * cycle gets its own value ([high, low] at period 2, [high, mid, low] at 3, and so on).
 */
function cycleValues(high: number, low: number, period: number): number[] {
	const n = Math.max(2, Math.round(period))
	return Array.from({ length: n }, (_, i) => Math.round(high + ((low - high) * i) / (n - 1)))
}

type SampleKey = keyof typeof SAMPLES
type AxisKey = 'wdth' | 'wght'

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
	const [sampleKey, setSampleKey] = useState<SampleKey>('en')
	const [axis, setAxis] = useState<AxisKey>('wght')
	const [valueHigh, setValueHigh] = useState<number>(SAMPLES.en.axes.wght.defaultHigh)
	const [valueLow, setValueLow] = useState<number>(SAMPLES.en.axes.wght.defaultLow)
	// Animated wave (startAxisRhythm under the hood); off by default so the static texture is what loads
	const [wave, setWave] = useState(false)
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
	const [gyroHigh, setGyroHigh] = useState<number>(SAMPLES.en.axes.wght.defaultHigh)
	const [gyroLow, setGyroLow] = useState<number>(SAMPLES.en.axes.wght.defaultLow)

	// Detected capabilities — resolved client-side after mount
	const showCursor = useMediaQuery('(hover: hover)')
	const isTouch = useMediaQuery('(hover: none)')
	const hasOrientation = useClientValue(() => 'DeviceOrientationEvent' in window, false)
	const showGyro = isTouch && hasOrientation

	const sample: Sample = SAMPLES[sampleKey]
	// The sample's font may not have the chosen axis (only Merriweather has wdth); fall back to wght
	const cfg: AxisRange = sample.axes[axis] ?? sample.axes.wght

	/** Switches sample and axis together, resetting the sliders to that font's defaults for the axis. */
	const selectSampleAxis = useCallback((nextSample: SampleKey, wanted: AxisKey) => {
		const axes: Sample['axes'] = SAMPLES[nextSample].axes
		const nextAxis: AxisKey = axes[wanted] ? wanted : 'wght'
		const range = axes[nextAxis] ?? axes.wght
		setSampleKey(nextSample)
		setAxis(nextAxis)
		setValueHigh(range.defaultHigh)
		setValueLow(range.defaultLow)
		setGyroHigh(range.defaultHigh)
		setGyroLow(range.defaultLow)
	}, [])

	const handleAxisChange = useCallback((next: AxisKey) => selectSampleAxis(sampleKey, next), [selectSampleAxis, sampleKey])
	const handleSampleChange = useCallback((next: SampleKey) => {
		selectSampleAxis(next, axis)
		// Browsers add no letter-spacing between joined Arabic letters, so 'spacing' can only recover part of the
		// width there: use 'scale' for the Arabic sample, and go back to 'spacing' when leaving it.
		setLinePreservation(prev => next === 'ar' ? (prev === 'spacing' ? 'scale' : prev) : (sampleKey === 'ar' && prev === 'scale' ? 'spacing' : prev))
	}, [selectSampleAxis, axis, sampleKey])

	// Effective values: gyro-driven when gyroMode is active, slider-driven otherwise
	const effectiveHigh = gyroMode ? gyroHigh : valueHigh
	const effectiveLow = gyroMode ? gyroLow : valueLow

	const dValueHigh = useDeferredValue(effectiveHigh)
	const dValueLow = useDeferredValue(effectiveLow)
	const dPeriod = useDeferredValue(period)
	// One value per line of the cycle; memoised so the array is stable between renders
	const values = useMemo(() => cycleValues(dValueHigh, dValueLow, dPeriod), [dValueHigh, dValueLow, dPeriod])

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
		fontFamily: sample.fontFamily,
		fontSize: "1.125rem",
		lineHeight: "1.8",
		fontVariationSettings: '"wght" 300, "opsz" 18, "wdth" 100',
	}), [sample.fontFamily])

	const activeMode = cursorMode || gyroMode

	return (
		<div className="w-full">
			{/* Responsive grid — single column on narrow mobile, three columns on sm+ */}
			<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
				<Slider label="Axis High" value={valueHigh} min={cfg.min} max={cfg.max} step={cfg.step} onChange={setValueHigh} disabled={gyroMode} title="The axis value of the first line in each cycle" />
				<Slider label="Axis Low" value={valueLow} min={cfg.min} max={cfg.max} step={cfg.step} onChange={setValueLow} disabled={gyroMode} title="The axis value of the last line in each cycle" />
				<Slider label="Period" value={period} min={2} max={6} step={1} onChange={setPeriod} title="Lines per cycle. At 2 the lines alternate High and Low; a longer period steps evenly from High to Low over that many lines, then starts again" />
			</div>
			<div className="flex flex-wrap items-center gap-3 mb-8">
				<div role="group" aria-label="Axis" className="flex items-center gap-2">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Axis</span>
					{(['wdth', 'wght'] as const).map(v => {
						const available = Boolean(sample.axes[v])
						return (
							<button key={v} onClick={() => handleAxisChange(v)} aria-pressed={axis === v} disabled={!available} title={!available ? 'This sample\'s font has no width axis' : v === 'wdth' ? 'Cycle the width axis: how condensed or expanded each line is' : 'Cycle the weight axis: how light or heavy each line is'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: !available ? 0.2 : axis === v ? 1 : 0.5, background: axis === v ? 'var(--btn-bg)' : 'transparent', cursor: available ? 'pointer' : 'not-allowed' }}>{v}</button>
						)
					})}
				</div>
				<div role="group" aria-label="Align" className="flex items-center gap-2 sm:ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Align</span>
					{(['top', 'bottom'] as const).map(v => (
						<button key={v} onClick={() => setAlign(v)} aria-pressed={align === v} title={v === 'top' ? 'Count the cycle from the first line down' : 'Count the cycle from the last line up, so the last line always gets the first value'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: align === v ? 1 : 0.5, background: align === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>
				<div role="group" aria-label="Preserve" className="flex flex-wrap items-center gap-2 sm:ml-4">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Preserve</span>
					{(['none', 'spacing', 'scale'] as const).map(v => (
						<button key={v} onClick={() => setLinePreservation(v)} aria-pressed={linePreservation === v} title={v === 'none' ? 'No compensation: each line gets wider or narrower with its axis value, and wide lines can pass the edge of the column' : v === 'spacing' ? (sample.dir === 'rtl' ? 'Adjust letter-spacing per line. Joined Arabic letters take no letter-spacing, so this recovers only part of the width here: use scale' : 'Adjust letter-spacing per line so each line keeps the length it had before the axis changed') : 'Scale each line horizontally (scaleX) so it keeps the length it had before the axis changed'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: linePreservation === v ? 1 : 0.5, background: linePreservation === v ? 'var(--btn-bg)' : 'transparent' }}>{v}</button>
					))}
				</div>

				<div role="group" aria-label="Sample text" className="flex flex-wrap items-center gap-2">
					<span className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Text</span>
					{(Object.keys(SAMPLES) as SampleKey[]).map(k => (
						<button key={k} onClick={() => handleSampleChange(k)} aria-pressed={sampleKey === k} lang={SAMPLES[k].lang} title={k === 'en' ? 'English in Merriweather (weight and width axes)' : k === 'ja' ? 'Japanese in Noto Sans JP: no spaces between words, so lines break between characters' : 'Arabic in Noto Sans Arabic: right-to-left, joined letters'} className="text-xs px-3 py-1 rounded-full border transition-opacity" style={{ borderColor: 'currentColor', opacity: sampleKey === k ? 1 : 0.5, background: sampleKey === k ? 'var(--btn-bg)' : 'transparent' }}>{SAMPLES[k].label}</button>
					))}
				</div>
				<button
					onClick={() => setWave(v => !v)}
					aria-label={wave ? 'Stop the animated wave' : 'Animate: turn the static texture into a moving wave'}
					aria-pressed={wave}
					title="Animate the axis as a wave that drifts through the lines (one cycle every 4 seconds). Stays still when your system asks for reduced motion."
					className="text-xs px-3 py-1 rounded-full border transition-opacity sm:ml-4"
					style={{ borderColor: 'currentColor', opacity: wave ? 1 : 0.5, background: wave ? 'var(--btn-bg)' : 'transparent' }}
				>
					Wave
				</button>

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
					{sample.paragraphs.map((para) => (
						<AxisRhythmText key={para.slice(0, 20)} axis={axis} values={values} period={dPeriod} align={align} linePreservation={linePreservation} animate={wave} lang={sample.lang} dir={sample.dir} style={sampleStyle}>
							{para}
						</AxisRhythmText>
					))}
				</div>
				{beforeAfter && (
					<div aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: '100%', pointerEvents: 'none', opacity: 0.25 }} className="flex flex-col gap-8">
						{sample.paragraphs.map((para) => (
							<p key={para.slice(0, 20)} lang={sample.lang} dir={sample.dir} style={{ ...sampleStyle, margin: 0 }}>{para}</p>
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
