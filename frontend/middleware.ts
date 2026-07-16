import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Client token lives in localStorage; cookie is optional fallback.
  const token =
    request.cookies.get("ke_token")?.value ||
    request.headers.get("authorization");

  // Dev: do not force auth so the shell is previewable. Set REQUIRE_AUTH=true in prod.
  if (process.env.REQUIRE_AUTH === "true" && !token) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
