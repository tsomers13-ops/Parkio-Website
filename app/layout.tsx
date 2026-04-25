import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parkio — Skip the Lines. Own Your Day.",
  description:
    "Real-time Disney wait times, smarter planning, and beautifully simple park maps. Built for the way you actually visit the parks.",
  metadataBase: new URL("https://parkio.app"),
  openGraph: {
    title: "Parkio",
    description: "Real-time wait times, smarter park days.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-ink-900 font-sans">
        {children}
      </body>
    </html>
  );
}
