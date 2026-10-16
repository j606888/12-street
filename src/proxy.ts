import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // A LIFF URL (liff.line.me/<id>/order) opens the endpoint as
  // `/?liff.state=/order`, and liff.init() would only replace it with /order
  // after the landing page has loaded. Redirect up front instead; the browser
  // carries the URL fragment (LIFF's tokens) over to the target page. Leave the
  // external-browser login callback (`code`) to liff.init().
  if (pathname === "/") {
    const state = searchParams.get("liff.state");
    if (state && !searchParams.has("code")) {
      const target = state.startsWith("/") ? state : `/${state}`;
      const url = new URL(target, request.url);
      // Only same-site paths
      if (!target.startsWith("//") && url.origin === request.nextUrl.origin) {
        return NextResponse.redirect(url);
      }
    }
    // There is no landing page; keep the query for liff.init() on /order
    const url = request.nextUrl.clone();
    url.pathname = "/order";
    return NextResponse.redirect(url);
  }

  // Optimistic check only: admin role is verified again in every admin page/action.
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // /order is members only; guests order through /guest
  matcher: ["/", "/order", "/admin/:path*", "/orders/mine"],
};
