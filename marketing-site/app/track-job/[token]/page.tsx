import { redirect } from 'next/navigation';

function webAppBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || 'https://myapp.africanbusinesssuite.com'
  ).replace(/\/$/, '');
}

type PageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Public job tracking lives on the main SPA (Vite), not this marketing site.
 * This route bridges links that use the apex domain + /track-job/:token.
 */
export default async function TrackJobBridgePage({ params }: PageProps) {
  const { token } = await params;
  const t = (token || '').trim();
  if (!t || t.length < 16) {
    redirect('/');
  }
  redirect(`${webAppBase()}/track-job/${encodeURIComponent(t)}`);
}
