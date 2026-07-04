import Client from "./Client";
import { cookies } from "next/headers";
import { loginCookieName, verifyLoginSession } from "./session";
import Logo from "@/components/Logo";

async function Login() {
  console.log("render");
  let ck = await getNxCookies();
  const cookieStore = await cookies();
  ck.login = (await verifyLoginSession(cookieStore.get(loginCookieName)?.value))
    ? "1"
    : "";

  return (
    <div>
      {console.log("return")}
      <Logo page={"login"} />
      <Client {...{ ck }} />
    </div>
  );
}

export default Login;
