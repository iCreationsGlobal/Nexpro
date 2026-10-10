import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { GoogleAnalytics } from "@/components/seo/GoogleAnalytics";
import {
  GoogleTagManager,
  GoogleTagManagerNoScript,
} from "@/components/seo/GoogleTagManager";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicConfigProvider } from "@/context/PublicConfigContext";
import { BRAND_ALIASES, BRAND_ALTERNATE, BRAND_FULL, SITE_NAME, SITE_URL } from "@/lib/constants";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const defaultTitle = `${BRAND_FULL} | Business Management Platform`;
const defaultDescription =
  `${BRAND_FULL} (${BRAND_ALTERNATE}) is all-in-one business software for growing African businesses, including printing presses, shops, and pharmacies.`;
const brandIcon = "/abs-logo-icon.png";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: BRAND_ALTERNATE,
  title: {
    default: defaultTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: defaultDescription,
  keywords: [
    ...BRAND_ALIASES,
    "ABS Ghana business app",
    "business management",
    "Ghana business management",
    "printing press",
    "shop management",
    "pharmacy management",
    "POS",
    "inventory management",
    "CRM",
  ],
  openGraph: {
    type: "website",
    locale: "en",
    url: "/",
    siteName: SITE_NAME,
    title: defaultTitle,
    description: defaultDescription,
    // Default OG image from app/opengraph-image.tsx
  },
  alternates: {
    canonical: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    // Default image from app/opengraph-image.tsx
  },
  icons: {
    icon: [{ url: brandIcon, type: "image/png", sizes: "1024x1024" }],
    shortcut: [brandIcon],
    apple: [{ url: brandIcon, type: "image/png", sizes: "1024x1024" }],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <GoogleTagManager />
        <GoogleAnalytics />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <GoogleTagManagerNoScript />
        <JsonLd />
        <PublicConfigProvider>
          <Header />
          {children}
          <Footer />
        </PublicConfigProvider>
      </body>
    </html>
  );
}
