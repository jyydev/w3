import Client from "./Client";
import { cookies } from "next/headers";
import { loginCookieName, verifyLoginSession } from "./session";

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
      <div className="flex mb-1">
        <span className="orange">Aster</span>
        <span className="grey">login</span>
      </div>
      <Client {...{ ck }} />
    </div>
  );
}

export default Login;
