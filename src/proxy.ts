import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 쿠키가 없으면 로그인 화면으로 보냅니다 (빠른 1차 확인).
 * 실제 권한 확인은 각 페이지/API에서 DB 기준으로 다시 합니다.
 */
const PUBLIC = ["/login", "/signup", "/api/auth", "/api/webhooks", "/api/cron", "/api/files", "/mock", "/brand"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const session = getSessionCookie(request);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + request.nextUrl.search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // media/: 로그인 화면에서도 쓰는 배경 영상·포스터 (미들웨어를 거치지 않고 CDN에서 바로)
  matcher: ["/((?!_next/static|_next/image|media/|favicon.ico|icon.svg|robots.txt).*)"],
};
