"use client";
import "ygb/react";
import sv from "@/sv";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";

function Client({ ck }) {
  const router = useRouter();
  const [pass, setPass] = useState("");

  async function run({ e }) {
    e.target.disabled = true;
    let r = await toast.promise(
      sv.login({
        pass,
        path: window.location.pathname,
      }),
      {
        loading: `authenticating...`,
        error: "error",
      },
      {
        success: {
          duration: 1,
          icon: "",
        },
      }
    );
    if (!r.ok) toast.error(r.msg); // if (["below min qty"].includes(r)) toast.error(r);
    else {
      toast.success("Welcome, JY");
      router.push("/");
      router.refresh();
    }
    e.target.disabled = false;
  }
  async function logout() {
    await sv.logout();
    toast.success("logged out");
    router.refresh();
  }

  async function keyPress(e) {
    if (e.key === "Enter") {
      await run({ e });
    }
  }

  return (
    <>
      <div className="flex">
        {ck.login ? (
          <>
            Welcome, JY
            <button className="btn" onClick={logout}>
              log out
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              value={pass}
              onKeyDown={keyPress}
              onChange={(e) => setPass(e.target.value)}
            />
            <button className="btn" onClick={(e) => run({ e })}>
              login
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default Client;
