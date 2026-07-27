import { NextResponse, type NextRequest } from "next/server";

// Middleware SATU ARAH: hanya redirect "no cookie → /login" untuk path protected.
// Reverse redirect ("already logged in → /") sengaja TIDAK di sini — bakal loop
// kalau cookie tampered/expired. Lihat plan §5 + memory feedback-nextjs-auth-patterns.
// Reverse ada di server component /login/page.tsx yang bisa decrypt session beneran.

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/register",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/healthz",
]);

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "genc_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const hasCookie = req.cookies.has(COOKIE_NAME);
  if (hasCookie) return NextResponse.next();

  // No cookie: redirect ke login dengan next param
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Semua route kecuali:
    // - _next/*, favicon, static assets by extension
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
