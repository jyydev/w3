"use server";
import "ygb";
import { cookies } from "next/headers";
import {
  createLoginSession,
  getLoginCookieOptions,
  isValidLoginPassword,
  loginCookieName,
} from "../app/login/session";

async function login({ pass, path }) {
  let r = { ok: 1, msg: "ok" };
  if (!isValidLoginPassword(pass)) {
    r = { ok: 0, msg: "invalid login" };
  } else {
    const cookieStore = await cookies();
    cookieStore.set(
      loginCookieName,
      await createLoginSession(),
      getLoginCookieOptions(),
    );
  }
  return r;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.set(loginCookieName, "", {
    ...getLoginCookieOptions(),
    maxAge: 0,
  });

  return { ok: 1 };
}

export default login;
