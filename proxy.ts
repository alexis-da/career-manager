import { NextResponse, type NextRequest } from "next/server";
import { appPassword, isValidSession, SESSION_COOKIE } from "@/src/lib/auth";

/**
 * The « closed » mode: with APP_PASSWORD set, every request needs a valid session cookie, or goes to /login and comes
 * back afterwards. Without it, the game is open to everyone and nothing is redirected. Runs on the Node.js runtime (the default for
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
  // Everything but the login page, Auth.js's endpoints (Google comes back to /api/auth/callback), the maintenance
  // endpoints (their own secret, app/api/maintenance), Next's assets, the static files of /public and the share image,
  // which link previews fetch without a session.
  matcher: ["/((?!login|api/auth/|api/maintenance/|opengraph-image|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
