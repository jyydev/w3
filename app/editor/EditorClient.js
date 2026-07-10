"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { getCookie, setCookie } from "cookies-next";
import toast from "react-hot-toast";
import {
  hasLocalEditorFile,
  listLocalEditorFiles,
  localEditorStorageEvent,
  readLocalEditorFile,
  saveLocalEditorFile,
  shouldUseLocalStorageEditor,
} from "../_editorData/browserEditorStorage";
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
  const [useLocalEditorStore, setUseLocalEditorStore] = useState(false);
  const [isPending, startTransition] = useTransition();

  const dirty = content != savedContent || draftFile != file;
  const trimmedDraftFile = draftFile.trim();
  const isCoinFile = /^coins?\/[^/]+\.json$/i.test(trimmedDraftFile);
  const fileOptions = useMemo(
    () => files.map((name) => ({ name, label: name })),
    [files],
  );

  function getSaveContent() {
    return /\.json$/i.test(trimmedDraftFile) && !String(content ?? "").trim()
      ? "{}"
      : content;
  }

  useEffect(() => {
    rememberEditorFile(file);
  }, [file]);

  useEffect(() => {
    const useLocal = shouldUseLocalStorageEditor();
    setUseLocalEditorStore(useLocal);
    if (!useLocal) return;

    const nextFiles = listLocalEditorFiles(initialFiles);
    const queryFile = new URLSearchParams(window.location.search).get("file") || "";
    const cookieFile = String(getCookie(editorFileCookie) || "");
    const preferredFile =
      [queryFile, cookieFile, file].find((name) => name && nextFiles.includes(name)) ||
      nextFiles[0] ||
      "";
    const nextContent = preferredFile
      ? readLocalEditorFile(
          preferredFile,
          preferredFile == file ? content : "",
        )
      : "";
    setFiles(nextFiles);
    setFile(preferredFile);
    setDraftFile(preferredFile);
    setContent(nextContent);
    setSavedContent(nextContent);
    rememberEditorFile(preferredFile);
  }, []);

  useEffect(() => {
    if (!useLocalEditorStore) return;

    function refreshLocalFiles() {
      setFiles(listLocalEditorFiles(initialFiles));
    }

    window.addEventListener(localEditorStorageEvent, refreshLocalFiles);
    window.addEventListener("storage", refreshLocalFiles);
    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalFiles);
      window.removeEventListener("storage", refreshLocalFiles);
    };
  }, [useLocalEditorStore, initialFiles]);

  function loadFile(nextFile) {
    setDraftFile(nextFile);
    if (useLocalEditorStore && hasLocalEditorFile(nextFile)) {
      const nextFiles = listLocalEditorFiles(files);
      const nextContent = readLocalEditorFile(nextFile, "");
      setFiles(nextFiles);
      setFile(nextFile);
      setDraftFile(nextFile);
      setContent(nextContent);
      setSavedContent(nextContent);
      rememberEditorFile(nextFile);
      return;
    }

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

    if (useLocalEditorStore) {
      try {
        const saveContent = getSaveContent();
        if (/\.json$/i.test(trimmedDraftFile)) JSON.parse(saveContent);

        const res = saveLocalEditorFile(trimmedDraftFile, saveContent);
        setFiles(res.files);
        setFile(res.file);
        setDraftFile(res.file);
        setContent(res.content);
        setSavedContent(res.content);
        rememberEditorFile(res.file);
        toast.success(`saved local ${res.file}`);
      } catch (e) {
        toast.error(e.message);
      }
      return;
    }

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

    if (useLocalEditorStore) {
      try {
        const saveContent = getSaveContent();
        if (/\.json$/i.test(trimmedDraftFile)) JSON.parse(saveContent);

        const res = saveLocalEditorFile(trimmedDraftFile, saveContent);
        setFiles(res.files);
        setFile(res.file);
        setDraftFile(res.file);
        setContent(res.content);
        setSavedContent(res.content);
        rememberEditorFile(res.file);
        toast.success(`saved local ${res.file}; global store is local-dev only`);
      } catch (e) {
        toast.error(e.message);
      }
      return;
    }

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
