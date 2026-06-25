import { cookies } from "next/headers";
import Logo from "@/components/Logo";
import EditorClient from "./EditorClient";
import { listEditorDataFiles, readEditorDataFile } from "./editorData";
import { editorFileCookie } from "./editorSettings";
import "./editor.css";

export const dynamic = "force-dynamic";

function getCookieFile(value, files) {
  if (!value) return "";

  const values = [value];
  try {
    values.push(decodeURIComponent(value));
  } catch {}

  return values.find((file) => files.includes(file)) || "";
}

async function App({ searchParams }) {
  console.log("render");
  const params = await searchParams;
  const files = await listEditorDataFiles();
  const requestedFile = Array.isArray(params?.file) ? params.file[0] : params?.file;
  const cookieStore = await cookies();
  const cookieFile = getCookieFile(cookieStore.get(editorFileCookie)?.value, files);
  const selectedFile = requestedFile || cookieFile || files[0] || "";
  let initial = { files, file: "", content: "" };

  if (selectedFile) {
    try {
      initial = await readEditorDataFile(selectedFile);
    } catch {
      initial = files[0] ? await readEditorDataFile(files[0]) : initial;
    }
  }

  return (
    <div>
      {console.log("return")}
      <div className="flex mb-1">
        <Logo page={"editor"} />
        <span className="infoHover editorInfoIcon" tabIndex={0}>
          <span className="infoIcon">i</span>
          <span className="infoCard">
            <span className="infoCardTitle">Editor</span>
            <span>Cmd+S / Ctrl+S saves while editing.</span>
            <span>Saved files are under data/editor.</span>
            <span>Lines starting with // are comments for wallet files.</span>
          </span>
        </span>
      </div>
      <EditorClient
        initialFiles={initial.files}
        initialFile={initial.file}
        initialContent={initial.content}
      />
    </div>
  );
}

export default App;
