import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PAGE_PROTECTED = ["/owner", "/barber", "/customer", "/staff", "/inventory", "/ai", "/admin", "/services", "/settings"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Admin login is always public
  if (pathname === "/admin/login") return NextResponse.next();

  const isPageProtected = PAGE_PROTECTED.some((p) => pathname.startsWith(p));
  const isApiRoute = pathname.startsWith("/api/");

  // Pass through public non-API paths (landing, shops, etc.)
  if (!isPageProtected && !isApiRoute) return NextResponse.next();

  const token =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    req.cookies.get("access_token")?.value;

  if (!token) {
    if (isApiRoute) return NextResponse.next(); // API routes handle their own 401
    if (pathname.startsWith("/admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? "your-super-secret-jwt-key-change-in-production"
    );
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string;
    const userId = ((payload.userId ?? payload.sub) as string) ?? "";

    // Page-level role guards (not applied to API routes)
    if (!isApiRoute) {
      if (pathname.startsWith("/admin") && role !== "ADMIN") {
        return NextResponse.redirect(new URL("/admin/login", req.url));
      }
      if (pathname.startsWith("/owner") && !["OWNER", "ADMIN"].includes(role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      if (pathname.startsWith("/barber") && !["BARBER", "OWNER", "ADMIN"].includes(role)) {
        return NextResponse.redirect(new URL("/", req.url));
      }
      if (
        (pathname.startsWith("/staff") ||
          pathname.startsWith("/inventory") ||
          pathname.startsWith("/ai") ||
          pathname.startsWith("/services") ||
          pathname.startsWith("/settings")) &&
        !["OWNER", "ADMIN"].includes(role)
      ) {
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    // Inject identity headers for both page and API routes
    const headers = new Headers(req.headers);
    headers.set("x-user-id", userId);
    headers.set("x-user-role", role);
    return NextResponse.next({ request: { headers } });
  } catch {
    if (isApiRoute) return NextResponse.next();
    if (pathname.startsWith("/admin")) return NextResponse.redirect(new URL("/admin/login", req.url));
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public|api/auth|api/dev).*)"],
};
