import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore African Business Suite (ABS) features for shops, pharmacies, studios, and AI-powered Smart Report. POS, inventory, prescriptions, quotes, jobs, and more.',
  alternates: {
    canonical: '/features',
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
