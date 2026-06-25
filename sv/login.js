"use server";
import "ygb";
import { revalidatePath } from "next/cache";

async function login({ pass, path }) {
  let r = { ok: 1, msg: "ok" };
  if (!process.env?.login?.split(",")?.includes(pass))
    r = { ok: 0, msg: "invalid login" };
  return r;
}
export default login;
