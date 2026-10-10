import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Report",
  description:
    "African Business Suite (ABS) Smart Report: AI-powered business insights, instant analytics, trend detection, and actionable recommendations.",
  alternates: {
    canonical: "/smart-report",
  },
};

export default function SmartReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
