import { NextResponse } from "next/server";
import { loginCookieName, verifyLoginSession } from "./app/login/session";

export async function middleware(request) {
  const res = NextResponse.next();
  //res.headers.set("path", request.nextUrl.pathname); //pass browser url path into headers

  const login = await verifyLoginSession(
    request.cookies.get(loginCookieName)?.value,
  );
  if (!login && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api).*)"],
};
