import { NextRequest, NextResponse } from "next/server";
import { resolveLocalAbsOrigin } from "@/lib/resolveLocalAbsOrigin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOP_BY_HOP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "host",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function isUnreachable(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${error.cause ?? ""}` : String(error);
  return /ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed|network/i.test(message);
}

function copyRequestHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

function forwardResponse(upstream: Response): NextResponse {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function proxy(req: NextRequest, path: string[]) {
  const search = req.nextUrl.search;
  const apiPath = `/api/${path.map(encodeURIComponent).join("/")}${search}`;
  const method = req.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();
  const headers = copyRequestHeaders(req);

  const attempt = async (origin: string) =>
    fetch(`${origin}${apiPath}`, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

  let origin = await resolveLocalAbsOrigin();
  try {
    return forwardResponse(await attempt(origin));
  } catch (error) {
    if (!isUnreachable(error)) {
      console.error(`[sabito-app] Proxy ${method} ${apiPath} → ${origin} failed:`, error);
      return NextResponse.json(
        { success: false, message: "ABS API request failed." },
        { status: 502 }
      );
    }
    const nextOrigin = await resolveLocalAbsOrigin({ force: true });
    if (nextOrigin !== origin) {
      console.warn(`[sabito-app] Retargeted /api proxy ${origin} → ${nextOrigin}`);
    }
    try {
      return forwardResponse(await attempt(nextOrigin));
    } catch (retryError) {
      console.error(
        `[sabito-app] Local ABS API not reachable (${nextOrigin}). Start Backend (npm run dev) and retry.`,
        retryError
      );
      return NextResponse.json(
        {
          success: false,
          message:
            "Cannot reach the local ABS backend. Start it with npm run dev in Backend/, then retry.",
        },
        { status: 502 }
      );
    }
  }
}

type RouteContext = { params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  return proxy(req, path || []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
