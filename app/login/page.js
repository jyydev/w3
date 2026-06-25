import Client from "./Client";

async function Login() {
  console.log("render");
  let ck = await getNxCookies();

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
