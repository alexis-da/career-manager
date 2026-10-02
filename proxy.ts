import { NextResponse, type NextRequest } from "next/server";
import { appPassword, isValidSession, SESSION_COOKIE } from "@/src/lib/auth";

/**
 * Password protection: every request needs a valid session cookie, or goes to /login and comes back afterwards.
 * Without APP_PASSWORD (local development), everything is open. Runs on the Node.js runtime (the default for
 * proxy.ts since Next 16).
 */
export default function proxy(request: NextRequest): NextResponse {
  const password = appPassword();
  // Not simulation code: the session's expiry is real time.
  if (password === null || isValidSession(request.cookies.get(SESSION_COOKIE)?.value, password, Date.now())) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") {
    login.searchParams.set("next", `${pathname}${search}`);
  }
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but the login page, Next's assets and the static files of /public.
  matcher: ["/((?!login|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
