import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Become an ABS Sales Agent",
  description:
    "Apply to become an ABS sales agent. Help shops, studios, and pharmacies go digital while earning by introducing African Business Suite.",
  alternates: {
    canonical: "/sales-agent",
  },
};

export default function SalesAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
