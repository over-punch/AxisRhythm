// OG image for axisrhythm.com — generated at build time via next/og
// Satori (used by ImageResponse) supports TTF and WOFF but not WOFF2.
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'Social preview: alternating weight lines in a paragraph — axis rhythm visualised'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Cache font buffer at module scope — read once per serverless instance
const interLightPromise = readFile(join(process.cwd(), 'public/fonts/inter-300.woff'))

// Palette: bg=#530103 btn=#692e27 fg=#faf3f2 muted=#cdb8b5 subtle=#a49491 barDim=#847775
export default async function Image() {
	const interLight = await interLightPromise
	return new ImageResponse(
		(
			<div style={{ background: '#530103', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '72px 80px', fontFamily: 'Inter, sans-serif' }}>
				{/* Eyebrow label */}
				<span style={{ fontSize: 13, letterSpacing: '0.18em', color: '#cdb8b5', textTransform: 'uppercase' }}>axis rhythm</span>

				{/* Decorative bars + headlines */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
						{[100, 94, 100, 94, 100].map((w, i) => (
							<div key={i} style={{ width: `${w * 5}px`, height: 3, background: i % 2 === 0 ? '#cdb8b5' : '#847775', borderRadius: 2 }} />
						))}
					</div>
					<div style={{ fontSize: 76, color: '#faf3f2', lineHeight: 1.06, fontWeight: 300 }}>Axis Rhythm,</div>
					<div style={{ fontSize: 76, color: '#cdb8b5', lineHeight: 1.06, fontWeight: 300 }}>line by line.</div>
				</div>

				{/* Footer */}
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
					<div style={{ fontSize: 14, color: '#cdb8b5', letterSpacing: '0.04em', display: 'flex', gap: 20 }}>
						<span>TypeScript</span><span style={{ opacity: 0.4 }}>·</span>
						<span>No required dependencies</span><span style={{ opacity: 0.4 }}>·</span>
						<span>React + Vanilla JS</span>
					</div>
					<div style={{ fontSize: 13, color: '#a49491', letterSpacing: '0.04em' }}>axisrhythm.com</div>
				</div>
			</div>
		),
		{ ...size, fonts: [{ name: 'Inter', data: interLight, style: 'normal', weight: 300 }] },
	)
}
