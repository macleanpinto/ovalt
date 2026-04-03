import { NextResponse } from "next/server";

/**
 * Lambda / SSR HTML must not be cached: stale shell HTML + new hashed chunks causes blank pages after deploy.
 * Long-cache immutable assets stay under `/_next/static` (matcher excludes them).
 */
export function middleware() {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export const config = {
  matcher: [
    /*
     * Apply only to document / RSC / data — not hashed immutable bundles.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
