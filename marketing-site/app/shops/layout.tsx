import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For Shops",
  description:
    "African Business Suite (ABS) for retail shops: modern POS, inventory, sales analytics, barcode scanning, offline mode, mobile money, and WhatsApp receipts.",
  alternates: {
    canonical: "/shops",
  },
};

export default function ShopsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
