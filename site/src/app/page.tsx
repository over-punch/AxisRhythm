import Demo from "@/components/Demo"
import CopyInstall from "@/components/CopyInstall"
import CodeBlock from "@/components/CodeBlock"
import ToolDirectory from "@/components/ToolDirectory"
import { version } from "../../../package.json"
import { version as siteVersion } from "../../package.json"
import SiteFooter from "../components/SiteFooter"
import { MagnetChar } from "@liiift-studio/magnettype"

export default function Home() {
	return (
		<main className="flex flex-col items-center px-6 py-20 gap-24">

			{/* Hero */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<p className="text-xs uppercase tracking-[0.18em] font-medium text-muted">axisrhythm</p>
					<h1 className="text-4xl lg:text-8xl xl:text-9xl" style={{ fontFamily: "var(--font-merriweather), serif", fontVariationSettings: '"wght" 300, "opsz" 144', lineHeight: "1.05em" }}>
						<MagnetChar as="span" minWeight={300} maxWeight={800} spreadRadius={220} fixedAxes={{ opsz: 144 }}>Per-line axis</MagnetChar><br />
						<MagnetChar as="span" minWeight={300} maxWeight={800} spreadRadius={220} fixedAxes={{ opsz: 144 }} style={{ color: "var(--foreground-subtle)", fontStyle: "italic" }}>alternation.</MagnetChar>
					</h1>
				</div>
				<div className="flex items-center gap-4">
					<CopyInstall />
					<a
						href="https://github.com/Liiift-Studio/AxisRhythm"
						target="_blank"
						rel="noopener noreferrer"
						aria-label="AxisRhythm on GitHub (opens in new tab)"
						className="text-sm text-muted hover:text-foreground transition-colors"
					>
						GitHub ↗
					</a>
				</div>
				<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tracking-wide">
					<span>TypeScript</span><span aria-hidden="true">·</span><span>No required dependencies</span><span aria-hidden="true">·</span><span>React + Vanilla JS</span>
				</div>
				<p className="text-base leading-relaxed max-w-lg">
					CSS applies font variation settings to the whole element. Axis Rhythm applies them line by line — cycling any axis through a sequence of values across paragraph lines. The result is a texture the eye reads as rhythm, not noise.
				</p>
			</section>

			{/* Demo */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-4">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Live demo — drag the sliders</h2>
				<div className="rounded-xl -mx-8 px-8 py-8" style={{ background: "var(--panel)", overflow: 'hidden' }}>
					<Demo />
				</div>
			</section>

			{/* Explanation */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">How it works</h2>
				<div className="prose-grid grid grid-cols-1 sm:grid-cols-2 gap-12 text-sm leading-relaxed">
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-foreground text-base">CSS stops at the element</p>
						<p>font-variation-settings applies a single setting to an entire element. Every line gets the same axis value. There&rsquo;s no way to target individual lines — they&rsquo;re not DOM nodes.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-foreground text-base">Axis Rhythm works line by line</p>
						<p>The algorithm detects visual lines using glyph positions, then wraps each in a span with its own font-variation-settings. Resize, reflow, inline elements — all handled automatically.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-foreground text-base">It aids reading</p>
						<p>Alternating axis values create a subtle visual banding across the paragraph — like column highlighting in a spreadsheet, but for text. The eye uses the variation as a landmark: each line has a slightly different texture, so you always know which line you&rsquo;re on and where the next one begins.</p>
					</div>
					<div className="flex flex-col gap-3">
						<p className="font-semibold text-foreground text-base">Line length preservation</p>
						<p>The <code className="text-xs font-mono">linePreservation</code> option prevents reflow when the axis changes character widths. <code className="text-xs font-mono">&apos;spacing&apos;</code> compensates with letter-spacing per line — exact widths, no glyph distortion. <code className="text-xs font-mono">&apos;scale&apos;</code> uses a GPU scaleX transform — faster, minor horizontal compression at large ranges.</p>
					</div>
				</div>
			</section>

			{/* Usage */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<div className="flex items-baseline gap-4">
					<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Usage</h2>
					<p className="text-xs text-muted tracking-wide">TypeScript + React · Vanilla JS</p>
				</div>
				<div className="flex flex-col gap-8 text-sm">
					<div className="flex flex-col gap-3">
						<p className="text-muted">Drop-in component</p>
						<CodeBlock code={`import { AxisRhythmText } from '@liiift-studio/axisrhythm'

<AxisRhythmText axis="wdth" values={[100, 88]} period={2}>
  Your paragraph text here...
</AxisRhythmText>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Hook — attach to any element</p>
						<CodeBlock code={`import { useAxisRhythm } from '@liiift-studio/axisrhythm'

const ref = useAxisRhythm({ axis: 'wdth', values: [100, 88], period: 2 })
<p ref={ref}>{children}</p>`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Vanilla JS — static</p>
						<CodeBlock code={`import { applyAxisRhythm, getCleanHTML } from '@liiift-studio/axisrhythm'

const el = document.querySelector('p')
const original = getCleanHTML(el)
applyAxisRhythm(el, original, { axis: 'wdth', values: [100, 88], period: 2 })`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Vanilla JS — animated</p>
						<CodeBlock code={`import { startAxisRhythm, getCleanHTML } from '@liiift-studio/axisrhythm'

const el = document.querySelector('p')
const original = getCleanHTML(el)
const stop = startAxisRhythm(el, original, {
  axis: 'wght', values: [300, 700], period: 3,
  animate: true, waveShape: 'sine', speed: 0.5,
})
// Later: stop() cancels the animation`} />
					</div>
					<div className="flex flex-col gap-3">
						<p className="text-muted">Options</p>
						<table className="w-full text-xs" aria-label="API options">
							<caption className="sr-only">AxisRhythm API options</caption>
							<thead><tr className="text-subtle text-left"><th className="pb-2 pr-6 font-normal">Option</th><th className="pb-2 pr-6 font-normal">Default</th><th className="pb-2 font-normal">Description</th></tr></thead>
							<tbody className="text-muted">
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">axis</td><td className="py-2 pr-6">&apos;wdth&apos;</td><td className="py-2">Variable font axis tag, e.g. &apos;wdth&apos;, &apos;wght&apos;, &apos;opsz&apos;.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">values</td><td className="py-2 pr-6">[100, 96]</td><td className="py-2">Axis values to cycle through across lines.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">period</td><td className="py-2 pr-6">2</td><td className="py-2">Lines per cycle.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">align</td><td className="py-2 pr-6">&apos;top&apos;</td><td className="py-2">&apos;top&apos; counts from first line, &apos;bottom&apos; from last. &apos;end&apos; anchors to the reading direction&rsquo;s trailing edge (equivalent to &apos;bottom&apos; in LTR text).</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">source</td><td className="py-2 pr-6">&apos;fixed&apos;</td><td className="py-2">&apos;fixed&apos; cycles through <code className="font-mono">values</code> in order. &apos;syllable-density&apos; maps per-line syllable density to the value range — complex lines get one end, simple lines the other. Requires the <code className="font-mono">syllable</code> package.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">animate</td><td className="py-2 pr-6">false</td><td className="py-2">Turn the static snapshot into a continuous ambient wave. Uses <code className="font-mono">startAxisRhythm</code> internally. Ignored by <code className="font-mono">applyAxisRhythm</code>.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">waveShape</td><td className="py-2 pr-6">&apos;sine&apos;</td><td className="py-2">Wave shape for animated mode. &apos;sine&apos; — smooth oscillation. &apos;triangle&apos; — linear transitions. &apos;spring&apos; — sine with slight overshoot at peaks.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">speed</td><td className="py-2 pr-6">1</td><td className="py-2">Animation speed multiplier. At 1, one full cycle takes 4 s. Use values below 1 for imperceptible background motion.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">syncTo</td><td className="py-2 pr-6">—</td><td className="py-2">Synchronise phase with another element&rsquo;s animation loop. The target element must already have <code className="font-mono">startAxisRhythm</code> running on it.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">lineDetection</td><td className="py-2 pr-6">&apos;bcr&apos;</td><td className="py-2">&apos;bcr&apos; reads actual browser layout — ground truth, works with any font and inline HTML. &apos;canvas&apos; uses <a href="https://github.com/chenglou/pretext" className="underline text-subtle">@chenglou/pretext</a> for arithmetic line breaking with no forced reflow on resize. Install pretext separately.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">linePreservation</td><td className="py-2 pr-6">&apos;none&apos;</td><td className="py-2">&apos;none&apos; — no compensation. &apos;spacing&apos; — adjusts letter-spacing per line to match natural line widths; prevents reflow. &apos;scale&apos; — applies a CSS scaleX transform per line; GPU-composited, no letter-spacing change.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">intersect</td><td className="py-2 pr-6">false</td><td className="py-2">Pause axis alternation when the element scrolls out of view; resume when visible. Uses IntersectionObserver internally.</td></tr>
								<tr className="border-t border-foreground/10 hover:bg-foreground/5 transition-colors"><td className="py-2 pr-6 font-mono">as</td><td className="py-2 pr-6">&apos;p&apos;</td><td className="py-2">HTML element to render, e.g. &apos;h1&apos;, &apos;div&apos;, &apos;li&apos;. Accepts any valid React element type. (AxisRhythmText only)</td></tr>
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Accessibility & Compatibility */}
			<section className="w-full max-w-2xl lg:max-w-5xl flex flex-col gap-6">
				<h2 className="text-xs uppercase tracking-[0.18em] font-medium text-muted">Accessibility &amp; compatibility</h2>
				<div className="flex flex-col gap-4 text-sm leading-relaxed">
					<p><strong>prefers-reduced-motion</strong> — when the user has enabled reduced motion in their OS settings, all axis alternation is skipped and the element is restored to its original HTML. No spans are injected; the text renders as plain prose.</p>
					<p><strong>update: slow</strong> — on e-ink and slow-refresh displays (Kindle, reMarkable, and similar panels), variable font axis animations produce no visible effect because the panel cannot refresh fast enough to show the transition. Axis Rhythm detects <code className="text-xs font-mono">matchMedia(&apos;(update: slow)&apos;)</code> and returns early, restoring the element to its original HTML without injecting any spans or applying any axis values.</p>
				</div>
			</section>

			<SiteFooter current="axisRhythm" npmVersion={version} siteVersion={siteVersion} />

		</main>
	)
}
