import Script from "next/script";
import { GTM_ID, isGtmEnabled } from "@/lib/constants";

/**
 * Google Tag Manager (GTM- prefix) for the ABS marketing site.
 * Loads in production only, unless NEXT_PUBLIC_GTM_ENABLED or NEXT_PUBLIC_GA_ENABLED is true.
 *
 * This is NOT the Google tag (GT- prefix). For GT-/G- IDs use GoogleAnalytics instead.
 * When GTM is enabled, add GA4 (and other tags) inside the GTM UI — do not also load direct gtag.
 */
export function GoogleTagManager() {
  if (!isGtmEnabled) {
    return null;
  }

  return (
    <Script id="google-tag-manager" strategy="afterInteractive">
      {`
        (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
        new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
        })(window,document,'script','dataLayer','${GTM_ID}');
      `}
    </Script>
  );
}

/** Noscript fallback — place immediately after the opening <body> tag. */
export function GoogleTagManagerNoScript() {
  if (!isGtmEnabled) {
    return null;
  }

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
