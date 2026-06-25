"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { setCookie } from "cookies-next";
import toast from "react-hot-toast";
import { editorCookieMaxAge, editorFileCookie } from "./editorSettings";

async function editorRequest(url, op) {
  const res = await fetch(url, op);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Editor request failed");
  return data;
}

function rememberEditorFile(file) {
  if (!file) return;
  setCookie(editorFileCookie, file, { maxAge: editorCookieMaxAge });
}

function EditorClient({ initialFiles, initialFile, initialContent }) {
  const [files, setFiles] = useState(initialFiles);
  const [file, setFile] = useState(initialFile);
  const [draftFile, setDraftFile] = useState(initialFile);
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();

  const dirty = content != savedContent || draftFile != file;
  const trimmedDraftFile = draftFile.trim();
  const isCoinFile = /^coins?\/[^/]+\.json$/i.test(trimmedDraftFile);
  const fileOptions = useMemo(
    () => files.map((name) => ({ name, label: name })),
    [files],
  );

  useEffect(() => {
    rememberEditorFile(file);
  }, [file]);

  function loadFile(nextFile) {
    setDraftFile(nextFile);
    startTransition(() => {
      editorRequest(`/editor/api?file=${encodeURIComponent(nextFile)}`)
        .then((res) => {
          setFiles(res.files);
          setFile(res.file);
          setDraftFile(res.file);
          setContent(res.content);
          setSavedContent(res.content);
          rememberEditorFile(res.file);
        })
        .catch((e) => toast.error(e.message));
    });
  }

  function cycleFile(direction = "next") {
    if (isPending || files.length < 2) return;

    const index = files.indexOf(file);
    const currentIndex = index >= 0 ? index : 0;
    const nextIndex =
      direction == "prev"
        ? (currentIndex - 1 + files.length) % files.length
        : (currentIndex + 1) % files.length;
    loadFile(files[nextIndex]);
  }

  function saveFile() {
    if (isPending || !trimmedDraftFile) return;

    startTransition(() => {
      editorRequest("/editor/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: trimmedDraftFile, content }),
      })
        .then((res) => {
          setFiles(res.files);
          setFile(res.file);
          setDraftFile(res.file);
          setContent(res.content);
          setSavedContent(res.content);
          rememberEditorFile(res.file);
          toast.success(`saved ${res.file}`);
        })
        .catch((e) => toast.error(e.message));
    });
  }

  function storeGlobalCoins() {
    if (isPending || !isCoinFile) return;
    const ok = window.confirm(
      "Save this editor coin file and append new coins into data/coins? You still need to git push after saving.",
    );
    if (!ok) return;

    startTransition(() => {
      editorRequest("/editor/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storeGlobalCoins",
          file: trimmedDraftFile,
          content,
        }),
      })
        .then((res) => {
          setFiles(res.files);
          setFile(res.file);
          setDraftFile(res.file);
          setContent(res.content);
          setSavedContent(res.content);
          rememberEditorFile(res.file);

          const added = res.added || [];
          const skipped = res.skipped || [];
          const storeText = added.length
            ? `stored ${added.length} to ${res.targetFile}`
            : `no new coins for ${res.targetFile}`;
          toast.success(`saved ${res.file}; ${storeText}; git push needed`);
          if (skipped.length) toast(`skipped existing: ${skipped.join(", ")}`);
        })
        .catch((e) => toast.error(e.message));
    });
  }

  return (
    <div className="editorPage">
      <div className="editorBar">
        <button
          className="btn small bgGray"
          onClick={() => cycleFile("prev")}
          disabled={isPending || files.length < 2}
          title="previous file"
        >
          {"<"}
        </button>
        <select
          value={file}
          onChange={(e) => loadFile(e.target.value)}
          disabled={isPending || !files.length}
        >
          {!files.length && <option value="">no files</option>}
          {fileOptions.map((option) => (
            <option key={option.name} value={option.name}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn small bgGray"
          onClick={() => cycleFile("next")}
          disabled={isPending || files.length < 2}
          title="next file"
        >
          {">"}
        </button>

        <input
          type="text"
          value={draftFile}
          onChange={(e) => setDraftFile(e.target.value)}
          placeholder="file.json"
          className="editorFileInput"
          disabled={isPending}
        />

        <button
          className="btn small"
          onClick={saveFile}
          disabled={isPending || !draftFile.trim()}
        >
          save
        </button>

        <span className={dirty ? "yellow" : "gray"}>
          {isPending ? "working" : dirty ? "unsaved" : "saved"}
        </span>

        {isCoinFile && (
          <button
            className="btn small bgGray"
            onClick={storeGlobalCoins}
            disabled={isPending || !trimmedDraftFile}
          >
            store globally
          </button>
        )}
      </div>

      <textarea
        className="editorText"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() == "s") {
            e.preventDefault();
            saveFile();
          }
        }}
        spellCheck={false}
      />
    </div>
  );
}

export default EditorClient;
