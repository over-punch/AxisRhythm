// Root layout for axisrhythm.com: metadata, fonts (Inter, plus Noto Sans JP and Arabic for the demo samples) and the shared header.
import type { Metadata } from "next"
import "./globals.css"
import { Inter, Noto_Sans_JP, Noto_Sans_Arabic } from "next/font/google"
import SiteHeader from "../components/SiteHeader"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
/** Variable Noto Sans JP (wght 100–900) for the demo's Japanese sample; fetched only when that sample is shown. */
const notoJp = Noto_Sans_JP({ weight: "variable", preload: false, display: "swap", variable: "--font-noto-jp" })
/** Variable Noto Sans Arabic (wght 100–900) for the demo's right-to-left sample; fetched only when that sample is shown. */
const notoAr = Noto_Sans_Arabic({ weight: "variable", subsets: ["arabic"], preload: false, display: "swap", variable: "--font-noto-ar" })

export const metadata: Metadata = {
	title: "Axis Rhythm — Per-line variable font axis alternation",
	icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" },
	description:
		"Axis Rhythm cycles any variable font axis — wdth, wght, opsz — across paragraph lines, creating a subtle typographic texture impossible in CSS alone. React + vanilla JS.",
	keywords: [
		"axis rhythm", "variable font", "font axis", "wdth", "wght", "opsz", "typography",
		"TypeScript", "npm", "react typography", "letter spacing", "typesetting",
	],
	openGraph: {
		title: "Axis Rhythm — Per-line variable font axis alternation",
		description: "Cycle any variable font axis across paragraph lines. A typographic texture technique, now in one npm package.",
		url: "https://axisrhythm.com",
		siteName: "Axis Rhythm",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Axis Rhythm — Per-line variable font axis alternation",
		description: "Cycle any variable font axis across paragraph lines. A typographic texture technique, now in one npm package.",
		images: ["https://axisrhythm.com/opengraph-image"],
	},
	metadataBase: new URL("https://axisrhythm.com"),
	alternates: { canonical: "https://axisrhythm.com" },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`h-full antialiased ${inter.variable} ${notoJp.variable} ${notoAr.variable}`}>
			<body className="min-h-full flex flex-col">
				<SiteHeader current="axisRhythm" githubUrl="https://github.com/over-punch/AxisRhythm" />{children}</body>
		</html>
	)
}
