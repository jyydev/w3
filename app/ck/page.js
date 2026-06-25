import Logo from "@/components/Logo";
import CkTable from "./CkTable";

async function Ck() {
  console.log("render");
  let prefix = "w3_"; //4 other domains: gt_
  let ck = await getNxCookies();
  let cookies = {
    navbar: [["eg", "", "info"]],
    navInput: [
      [
        "navFavs", //cookieName
        "links", //title
        "eg: linkOnly, ['link', 'txt']", //info
        "\n - comma space (, ) for next link; use quotes inside array\n - fav dropdown links in navbar",
      ],
      [
        "navLinks", //cookieName
        "links", //title
        "eg: linkOnly, ['link', 'txt']", //info
        "\n - eg for new dropdown: [ ['linkOnly', ['link','title'] ], 'txt']",
      ],
    ],
  };

  for (let cat in cookies) {
    cookies[cat].forEach((e) => {
      e[0] = prefix + e[0];
    });
  } //add prefix to all cookies

  return (
    <div>
      {console.log("return")}
      <Logo page="cookies" />
      {Object.keys(cookies).map((cat) => (
        <CkTable
          key={uid()}
          {...{
            ck,
            rows: cookies[cat],
            caption: cat,
            input: /Input$/i.test(cat),
            prefix,
          }}
        />
      ))}
    </div>
  );
}

export default Ck;
