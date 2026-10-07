// Sitemap for axisrhythm.com (a single page).
import type { MetadataRoute } from 'next'
export default function sitemap(): MetadataRoute.Sitemap {
	return [{ url: 'https://axisrhythm.com', lastModified: new Date('2026-10-06'), changeFrequency: 'monthly', priority: 1 }]
}
