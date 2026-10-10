import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Pharmacies",
  description:
    "African Business Suite (ABS) for pharmacies: prescription management, drug inventory, expiry alerts, and regulatory compliance.",
  alternates: {
    canonical: "/pharmacies",
  },
};

export default function PharmaciesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
