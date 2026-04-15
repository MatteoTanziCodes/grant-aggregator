import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-inter",
	display: "swap",
});

const mono = localFont({
	src: [
		{
			path: "../../public/fonts/founders-grotesk-mono-light.woff2",
			weight: "300",
			style: "normal",
		},
		{
			path: "../../public/fonts/founders-grotesk-mono-regular.woff2",
			weight: "400",
			style: "normal",
		},
	],
	variable: "--font-founders-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Canadian Funding Intelligence",
	description: "Canada-first funding intelligence for Canadian entrepreneurs.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<link rel="icon" href="/favicon.svg" type="image/svg+xml"></link>
			</head>
			<body className={`${inter.variable} ${mono.variable} antialiased`}>
				{children}
			</body>
		</html>
	);
}
