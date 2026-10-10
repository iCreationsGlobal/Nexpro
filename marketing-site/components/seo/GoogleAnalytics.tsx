import Script from "next/script";
import {
  GA_MEASUREMENT_ID,
  GOOGLE_TAG_ID,
  GTAG_PRIMARY_ID,
  isGaDirectEnabled,
} from "@/lib/constants";

/**
 * Google Analytics 4 (gtag.js) for the ABS marketing site.
 *
 * Always configures the GA4 measurement ID (G-TJP79NHHRL by default) so Analytics Admin
 * receives page views. Optionally also configures NEXT_PUBLIC_GOOGLE_TAG_ID (GT-*) for
 * Ads and other linked destinations.
 *
 * Skipped when NEXT_PUBLIC_GTM_ID is set — add GA4 inside Tag Manager instead.
 * Loads in production only (or when NEXT_PUBLIC_GA_ENABLED=true for local testing).
 */
export function GoogleAnalytics() {
  if (!isGaDirectEnabled || !GTAG_PRIMARY_ID) {
    return null;
  }

  const secondaryConfig =
    GOOGLE_TAG_ID && GOOGLE_TAG_ID !== GA_MEASUREMENT_ID
      ? `\ngtag('config', '${GOOGLE_TAG_ID}');`
      : "";

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GTAG_PRIMARY_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID || GTAG_PRIMARY_ID}');${secondaryConfig}
        `}
      </Script>
    </>
  );
}
