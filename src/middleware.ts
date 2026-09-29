import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const path = req.nextUrl.pathname;
  const publicPath =
    path.startsWith("/login") ||
    path.startsWith("/api/auth") ||
    path.startsWith("/_next") ||
    path === "/favicon.ico";

  if (!isLoggedIn && !publicPath) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/documents";
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$).*)"],
};
