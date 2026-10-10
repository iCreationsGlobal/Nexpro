import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants";
import { SHOW_PRICING } from "@/lib/featureFlags";

const routes = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" as const },
  ...(SHOW_PRICING
    ? [{ path: "/pricing", priority: 0.8, changeFrequency: "weekly" as const }]
    : []),
  { path: "/contact", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/support", priority: 0.6, changeFrequency: "monthly" as const },
  { path: "/shops", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/studios", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/pharmacies", priority: 0.8, changeFrequency: "monthly" as const },
  { path: "/sales-agent", priority: 0.7, changeFrequency: "monthly" as const },
  { path: "/smart-report", priority: 0.8, changeFrequency: "monthly" as const },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
