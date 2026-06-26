import { NextResponse } from "next/server";

export function middleware(request) {
  const res = NextResponse.next();
  //res.headers.set("path", request.nextUrl.pathname); //pass browser url path into headers

  const login = Number(request.cookies.get("login")?.value);
  if (!login && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};
