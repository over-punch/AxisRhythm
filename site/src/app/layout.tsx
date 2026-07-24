import type { Metadata } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import SiteHeader from "../components/SiteHeader"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

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
		<html lang="en" className={`h-full antialiased ${inter.variable}`}>
			<body className="min-h-full flex flex-col">
				<SiteHeader current="axisRhythm" githubUrl="https://github.com/Liiift-Studio/AxisRhythm" />{children}</body>
		</html>
	)
}
