import {
  ALTERNATE_SITE_URLS,
  BRAND_ALIASES,
  BRAND_ALTERNATE,
  BRAND_FULL,
  SITE_NAME,
  SITE_URL,
  CONTACT_EMAIL,
  CONTACT_PHONE_E164,
  OFFICE_ADDRESS,
} from "@/lib/constants";

const defaultDescription =
  `${BRAND_FULL} (${BRAND_ALTERNATE}) is all-in-one business software for growing African businesses, including printing presses, shops, and pharmacies.`;

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: BRAND_FULL,
  legalName: BRAND_FULL,
  alternateName: BRAND_ALIASES,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description: defaultDescription,
  sameAs: [
    ...ALTERNATE_SITE_URLS,
    "https://facebook.com/shopwiseafrica",
    "https://twitter.com/shopwiseafrica",
    "https://linkedin.com/company/shopwiseafrica",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    url: `${SITE_URL}/contact`,
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE_E164,
    contactType: "customer service",
    availableLanguage: "English",
    areaServed: "GH",
    address: {
      "@type": "PostalAddress",
      streetAddress: OFFICE_ADDRESS,
      addressLocality: "Accra",
      addressCountry: "GH",
    },
  },
};

const website = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  alternateName: BRAND_ALIASES,
  url: SITE_URL,
  description: defaultDescription,
  publisher: { "@id": `${SITE_URL}/#organization` },
};

export function JsonLd() {
  const organizationWithId = { ...organization, "@id": `${SITE_URL}/#organization` };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationWithId),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(website),
        }}
      />
    </>
  );
}
