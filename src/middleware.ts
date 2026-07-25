import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, verifySession } from "@/lib/session";

/**
 * Первый рубеж защиты: отсекает неавторизованных ещё до рендеринга страницы.
 * Это не заменяет проверки внутри страниц и серверных действий — там роль
 * проверяется повторно по базе, потому что middleware видит только токен.
 */

const RULES: { prefix: string; roles: string[] }[] = [
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/referee", roles: ["ADMIN", "REFEREE"] },
  { prefix: "/captain", roles: ["ADMIN", "CAPTAIN"] },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!rule.roles.includes(session.role)) {
    return NextResponse.redirect(new URL("/403", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/referee/:path*", "/captain/:path*"],
};
