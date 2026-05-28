import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// SEO metadata — DNK Partner umbrella brand.
// metadataBase resolves relative OG URLs against the prod origin so social
// scrapers fetch absolute URLs. title.template lets nested routes
// (e.g. /privacy) extend the brand suffix without manually duplicating it.
// Pixel will iterate on copy + OG imagery in Phase 2.
export const metadata: Metadata = {
  metadataBase: new URL("https://dnkpartner.com"),
  title: {
    default: "DNK Partner — Where effective solutions are gathered",
    template: "%s · DNK Partner",
  },
  description:
    "DNK Partner — Where effective solutions are gathered. Sales services, effectivity, creativity and product solutions — All at one place.",
  applicationName: "DNK Partner",
  authors: [{ name: "DNK Partner" }],
  creator: "DNK Partner",
  publisher: "DNK Partner",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://dnkpartner.com/",
    siteName: "DNK Partner",
    title: "DNK Partner — Where effective solutions are gathered",
    description:
      "Sales services, effectivity, creativity and product solutions — All at one place.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "DNK Partner — Where effective solutions are gathered",
    description:
      "Sales services, effectivity, creativity and product solutions — All at one place.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  // brand-accent — used by mobile browser chrome / theme-color meta tag.
  // Sampled from the DNK Partner logo wordmark; see app/globals.css for
  // full palette provenance.
  themeColor: '#092848',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
