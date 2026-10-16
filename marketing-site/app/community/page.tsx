import type { Metadata } from 'next'
import { CommunityPage } from '@/components/community/CommunityPage'

export const metadata: Metadata = {
  title: 'Our Community',
  description: 'Meet the people, conversations, and ideas shaping African Business Suite. Help us build a better ABS together.',
  alternates: { canonical: '/community' },
}

export default function Page() {
  return <CommunityPage />
}
