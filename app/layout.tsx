import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Parkio — Skip the Lines. Own Your Day.",
    template: "%s · Parkio",
  },
  description:
    "Real-time Disney wait times, smarter planning, and beautifully simple park maps for all six U.S. Disney parks. Built for the way you actually visit.",
  metadataBase: new URL("https://parkio.info"),
  applicationName: "Parkio",
  keywords: [
    "Disney wait times",
    "Walt Disney World",
    "Disneyland",
    "Magic Kingdom",
    "EPCOT",
    "Hollywood Studios",
    "Animal Kingdom",
    "California Adventure",
    "park planner",
    "live wait times",
  ],
  openGraph: {
    title: "Parkio — Skip the Lines. Own Your Day.",
    description:
      "Real-time Disney wait times, smarter planning, and beautifully simple park maps. All six U.S. Disney parks, refreshed every minute.",
    type: "website",
    siteName: "Parkio",
    url: "https://parkio.info",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Parkio — Skip the Lines. Own Your Day.",
    description:
      "Real-time Disney wait times, smarter planning, and beautifully simple park maps.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: "/",
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
