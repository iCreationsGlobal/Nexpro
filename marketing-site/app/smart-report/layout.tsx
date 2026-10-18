import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Smart Report",
  description:
    "African Business Suite (ABS) Smart Report: sales, expenses, profit, cash flow and stock for any period, with comparisons and PDF download.",
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
