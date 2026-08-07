import { cookies } from "next/headers";
import Logo from "@/components/Logo";
import { HoverInfoCard } from "@/components/Shared";
import { normalizeEditorFilePath } from "@/components/editorNavigation";
import EditorClient from "./EditorClient";
import { listEditorDataFiles, readEditorDataFile } from "./editorData";
import { editorFileCookie } from "./editorSettings";
import "./editor.css";

function normalizeRequestedFile(value) {
  const file = Array.isArray(value) ? value[0] : value;
  try {
    return normalizeEditorFilePath(file);
  } catch {
    return "";
  }
}

function getCookieFile(value, files) {
  if (!value) return "";

  const values = [value];
  try {
    values.push(decodeURIComponent(value));
  } catch {}

  return values
    .map(normalizeRequestedFile)
    .find((file) => files.includes(file)) || "";
}

async function EditorPage({ requestedFile = "" }) {
  const files = await listEditorDataFiles();
  const requestedPath = normalizeRequestedFile(requestedFile);
  const cookieStore = await cookies();
  const cookieFile = getCookieFile(
    cookieStore.get(editorFileCookie)?.value,
    files,
  );
  const selectedFile = requestedPath || cookieFile || files[0] || "";
  let initial = { files, file: "", content: "" };

  if (selectedFile) {
    try {
      initial = await readEditorDataFile(selectedFile);
    } catch (error) {
      if (requestedPath && error?.code == "ENOENT") {
        initial = { files, file: "", content: "" };
      } else if (requestedPath) {
        throw error;
      } else {
        initial = files[0]
          ? await readEditorDataFile(files[0])
          : initial;
      }
    }
  }

  return (
    <div>
      <div className="flex mb-1">
        <Logo page="editor" />
        <HoverInfoCard className="editorInfoIcon" tabIndex={0}>
          <span className="infoIcon">i</span>
          <span className="infoCard">
            <span className="infoCardTitle">Editor</span>
            <span>Cmd+S / Ctrl+S saves while editing.</span>
            <span>Saved files are under data/editor.</span>
            <span>Wallet files use JSON arrays with wallet, address, and ref.</span>
          </span>
        </HoverInfoCard>
      </div>
      <EditorClient
        key={requestedPath || `editor-root:${initial.file}`}
        initialFiles={initial.files}
        initialFile={initial.file}
        initialContent={initial.content}
        requestedFile={requestedPath}
      />
    </div>
  );
}

export default EditorPage;
