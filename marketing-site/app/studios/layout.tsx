import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Studios",
  description:
    "African Business Suite (ABS) for printing presses and studios: quoting, job tracking, invoicing, pricing templates, deadline management, and materials tracking.",
  alternates: {
    canonical: "/studios",
  },
};

export default function StudiosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
