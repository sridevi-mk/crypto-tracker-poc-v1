import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthCookieName, verifySessionToken } from "@/lib/auth";

const PROTECTED_PATHS = ["/portfolio", "/api/portfolio", "/api/user", "/api/alerts"];

function isProtectedPath(pathname: string) {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/alerts/dispatch") return NextResponse.next();
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(getAuthCookieName())?.value;
  const isAuthenticated = await verifySessionToken(token);
  if (isAuthenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/portfolio/:path*", "/api/portfolio/:path*", "/api/user/:path*", "/api/alerts/:path*"],
};

