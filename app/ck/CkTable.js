"use client";
import "ygb/react";
import toast from "react-hot-toast";
import { setCookie, deleteCookie } from "cookies-next";
const setCk = (ck, v, op = {}) => setCookie(ck, v, { maxAge: 365 * 24 * 60 * 60, ...op });

const getReactCookies = () =>
  Object.fromEntries(
    document.cookie.split("; ").map((c) => {
      const [k, ...v] = c.split("=");
      return [k, decodeURIComponent(v.join("="))];
    })
  ); //use in useEffect(()=>{},[]) and assign with setV using declared let [v,setV]=useState

function Ck({ ck, caption, rows, input = false, prefix }) {
  const [show, setShow] = useState(false);
  const [ckOn, setCkOn] = useState(Object.fromEntries(rows.map((e) => [e[0], ck[e[0]]]))); //[k, ck[k]] => {k:ck[k]} // ?? false: changing undefined to a value emit error
  const [ckInput, setCkInput] = useState(
    // Object.fromEntries(rows.map((e) => [e[0], ck[e[0]]])) //undefined if ck[e[0]] is undefined
    Object.fromEntries(rows.map((e) => [e[0], ""])) //initialize ckInput with all cookieNames with empty string
  );

  useEffect(() => {
    const cookieObj = getReactCookies();
    setCkInput(
      Object.fromEntries(
        rows.map((e) => [e[0], typeof ck[e[0]] === "object" ? cookieObj[e[0]] : ck[e[0]]])
      ) //undefined if ck[e[0]] is undefined
    );
  }, []);

  function updateInput(e, ckName) {
    let input = e.target.value;
    setCkInput((p) => {
      setCk(ckName, input);
      return { ...p, [ckName]: input };
    });
  }
  function ckDel(ckName) {
    input
      ? setCkInput((p) => {
          return { ...p, [ckName]: undefined };
        })
      : setCkOn((p) => {
          return { ...p, [ckName]: false };
        });
    deleteCookie(ckName);
    toast.success(`reset ${ckName}`, { duration: 4000 });
  }
  function Table() {
    return (
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th className="stickyA">
              <label className="switch" title="toggle extra info">
                <input
                  type="checkbox"
                  checked={show}
                  onChange={() => setShow((prev) => !prev)}
                />
                <span className="slider"></span>
              </label>
            </th>
            <th
              className={prefix ? "info" : undefined}
              title={prefix ? "gt_ prefix for all cookies" : undefined}
            >
              cookie
            </th>
            <th>title</th>
            {input && (
              <th className="info" title="hover each input for default value example">
                input
              </th>
            )}
            <th>info</th>
            <th>reset</th>
          </tr>
        </thead>
        <tbody>{Rows()}</tbody>
      </table>
    );
  }

  function Rows() {
    return rows.map((e) => {
      let ckName = e[0];
      let ckTitle = e[1];
      let ckInfo = e[2];
      let ckHint = e[3];
      return (
        <tr key={ckName}>
          <td>
            {input ? (
              <></>
            ) : (
              <label className="switch small" title={ckHint ?? ""}>
                <input
                  type="checkbox"
                  checked={ckOn[ckName] ?? false}
                  onChange={() =>
                    setCkOn((p) => {
                      setCk(ckName, !p[ckName]);
                      return { ...p, [ckName]: !p[ckName] };
                    })
                  }
                />
                <span className="slider"></span>
              </label>
            )}
          </td>

          <td>{ckName}</td>
          <td>{ckTitle}</td>
          {input && (
            <td>
              <input
                type="text"
                value={ckInput[ckName]?.toString() ?? ""}
                onChange={(e) => updateInput(e, ckName)}
                style={{ width: `${Math.max(ckInput[ckName]?.length ?? 0, 20)}ch` }}
                placeholder={
                  ckInput[ckName] == undefined
                    ? ["navFavs", "navLinks"].includes(ckName)
                      ? "   link, [link, title],.."
                      : "   space between items"
                    : ""
                }
                title={ckHint ?? ""}
              />
            </td>
          )}
          <td>
            {ckInfo}
            {show &&
              ckHint
                ?.split("\n")
                ?.map((line, i) => (i == 0 ? ` ${line}` : <div key={uid()}>{line}</div>))}
          </td>
          <td>
            <button className="btn small" onClick={() => ckDel(ckName)}>
              reset
            </button>
          </td>
        </tr>
      );
    });
  }
  return <>{Table()}</>;
}

export default Ck;
