// vite.webflow.config.ts — standalone minified IIFE bundle for Webflow Custom Code Embed.
// Produces a single self-contained browser global (window.AxisRhythm) with no module loader,
// no React, and no external dependencies — droppable into a Webflow embed via one <script> tag.
import { defineConfig } from 'vite'

export default defineConfig({
	build: {
		// Do not wipe dist/ — the library build (vite.config.ts) writes index.js/.cjs there too.
		emptyOutDir: false,
		lib: {
			entry: 'src/webflow/embed.ts',
			formats: ['iife'],
			// Exposes the module's exports (init, refit, destroy) as window.AxisRhythm.
			name: 'AxisRhythm',
			fileName: () => 'axisrhythm.webflow.min.js',
		},
		rollupOptions: {
			// The core's optional `import('syllable')` and `import('@chenglou/pretext')` must not
			// be inlined — the embed defaults to fixed values + BCR line detection and never reaches
			// those dynamic imports. Bundling the AFINN-scale syllable data and pretext's canvas
			// engine would add tens of kB of dead weight. Kept external: the runtime import() is
			// never hit unless the user opts into syllable-density / canvas, and the core catches
			// the missing module and falls back gracefully.
			external: ['syllable', '@chenglou/pretext'],
		},
		minify: true,
	},
})
