import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function webAppBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL || 'https://myapp.africanbusinesssuite.com'
  ).replace(/\/$/, '');
}

/**
 * WhatsApp / older links sometimes opened the marketing domain with only the
 * view token in the path: /{64-char-hex}. Forward to the SPA track page.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 1) {
    return NextResponse.next();
  }
  const seg = parts[0];
  if (!/^[a-f0-9]{64}$/i.test(seg)) {
    return NextResponse.next();
  }
  const base = webAppBase();
  return NextResponse.redirect(new URL(`${base}/track-job/${seg}`, request.url), 307);
}

// One path segment only (e.g. /{token}); avoids /track-job/foo (two segments — handled by App Router)
export const config = {
  matcher: ['/:segment'],
};
