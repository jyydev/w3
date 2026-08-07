"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { deleteCookie, getCookie, setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { TrashIcon } from "@/components/Shared";
import { getEditorFileHref } from "@/components/editorNavigation";
import {
  deleteLocalEditorFile,
  hasLocalEditorFile,
  listLocalEditorFiles,
  localEditorStorageEvent,
  readLocalEditorFile,
  rememberEditorHistory,
  removeEditorHistory,
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
  setCookie(editorFileCookie, file, {
    maxAge: editorCookieMaxAge,
    path: "/",
  });
}

function forgetEditorFile() {
  deleteCookie(editorFileCookie);
  deleteCookie(editorFileCookie, { path: "/" });
}

function getFileAfterDelete(previousFiles, nextFiles, deletedFile) {
  if (!nextFiles.length) return "";

  const previousIndex = previousFiles.indexOf(deletedFile);
  const nextIndex = Math.min(
    previousIndex < 0 ? 0 : previousIndex,
    nextFiles.length - 1,
  );

  return nextFiles[nextIndex];
}

function EditorClient({
  initialFiles,
  initialFile,
  initialContent,
  requestedFile = "",
}) {
  const router = useRouter();
  const [files, setFiles] = useState(initialFiles);
  const [file, setFile] = useState(initialFile);
  const [draftFile, setDraftFile] = useState(
    requestedFile || initialFile,
  );
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [resolvedFile, setResolvedFile] = useState("");
  const [useLocalEditorStore, setUseLocalEditorStore] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingFileRef = useRef("");
  const [isPending, startTransition] = useTransition();

  const busy = isPending || deleting;
  const dirty = content != savedContent || draftFile != file;
  const trimmedDraftFile = draftFile.trim();
  const isCoinFile = /^coins?\/[^/]+\.json$/i.test(trimmedDraftFile);
  const fileDeleteBlocked =
    useLocalEditorStore && initialFiles.includes(file);
  const fileOptions = useMemo(
    () => files.map((name) => ({ name, label: name })),
    [files],
  );

  function getSaveContent() {
    return /\.json$/i.test(trimmedDraftFile) && !String(content ?? "").trim()
      ? "{}"
      : content;
  }

  function updateEditorUrl(
    nextFile,
    { replace = false, refresh = false } = {},
  ) {
    if (!nextFile) return;

    let href = "";
    try {
      href = getEditorFileHref(nextFile);
    } catch {
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (currentUrl != href) {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    }
    if (refresh) router.refresh();
  }

  useEffect(() => {
    rememberEditorFile(file);
  }, [file]);

  useEffect(() => {
    if (resolvedFile) rememberEditorHistory(resolvedFile);
  }, [resolvedFile]);

  useEffect(() => {
    const useLocal = shouldUseLocalStorageEditor();
    setUseLocalEditorStore(useLocal);
    if (!useLocal) {
      setResolvedFile(initialFile);
      if (!requestedFile) updateEditorUrl(initialFile, { replace: true });
      return;
    }

    const nextFiles = listLocalEditorFiles(initialFiles);
    if (requestedFile && !nextFiles.includes(requestedFile)) {
      setFiles(nextFiles);
      setFile("");
      setDraftFile(requestedFile);
      setContent("");
      setSavedContent("");
      setResolvedFile("");
      return;
    }

    const cookieFile = String(getCookie(editorFileCookie) || "");
    const preferredFile =
      [requestedFile, cookieFile, file].find(
        (name) => name && nextFiles.includes(name),
      ) ||
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
    setResolvedFile(preferredFile);
    rememberEditorFile(preferredFile);
    updateEditorUrl(preferredFile, { replace: true });
  }, []);

  useEffect(() => {
    if (!useLocalEditorStore) return;

    function refreshLocalFiles() {
      const nextFiles = listLocalEditorFiles(initialFiles);
      setFiles(nextFiles);
      if (deletingFileRef.current) return;
      if (!file || nextFiles.includes(file)) return;

      const fallbackFile = nextFiles[0] || "";
      if (fallbackFile) {
        loadFile(fallbackFile, { replace: true });
        return;
      }

      setFile("");
      setDraftFile("");
      setContent("");
      setSavedContent("");
      setResolvedFile("");
      router.replace("/e", { scroll: false });
    }

    window.addEventListener(localEditorStorageEvent, refreshLocalFiles);
    window.addEventListener("storage", refreshLocalFiles);
    return () => {
      window.removeEventListener(localEditorStorageEvent, refreshLocalFiles);
      window.removeEventListener("storage", refreshLocalFiles);
    };
  }, [useLocalEditorStore, initialFiles, file]);

  function loadFile(nextFile, { replace = false } = {}) {
    setDraftFile(nextFile);
    if (useLocalEditorStore && hasLocalEditorFile(nextFile)) {
      const nextFiles = listLocalEditorFiles(initialFiles);
      const nextContent = readLocalEditorFile(nextFile, "");
      setFiles(nextFiles);
      setFile(nextFile);
      setDraftFile(nextFile);
      setContent(nextContent);
      setSavedContent(nextContent);
      setResolvedFile(nextFile);
      rememberEditorFile(nextFile);
      updateEditorUrl(nextFile, { replace });
      return;
    }

    startTransition(() => {
      editorRequest(`/e/api?file=${encodeURIComponent(nextFile)}`)
        .then((res) => {
          setFiles(res.files);
          setFile(res.file);
          setDraftFile(res.file);
          setContent(res.content);
          setSavedContent(res.content);
          setResolvedFile(res.file);
          rememberEditorFile(res.file);
          updateEditorUrl(res.file, { replace });
        })
        .catch((e) => toast.error(e.message));
    });
  }

  function cycleFile(direction = "next") {
    if (busy || files.length < 2) return;

    const index = files.indexOf(file);
    const currentIndex = index >= 0 ? index : 0;
    const nextIndex =
      direction == "prev"
        ? (currentIndex - 1 + files.length) % files.length
        : (currentIndex + 1) % files.length;
    loadFile(files[nextIndex]);
  }

  function saveFile() {
    if (busy || !trimmedDraftFile) return;

    if (useLocalEditorStore) {
      try {
        const saveContent = getSaveContent();
        if (/\.json$/i.test(trimmedDraftFile)) JSON.parse(saveContent);

        const res = saveLocalEditorFile(trimmedDraftFile, saveContent);
        setFiles(listLocalEditorFiles(initialFiles));
        setFile(res.file);
        setDraftFile(res.file);
        setContent(res.content);
        setSavedContent(res.content);
        setResolvedFile(res.file);
        rememberEditorFile(res.file);
        updateEditorUrl(res.file);
        toast.success(`saved local ${res.file}`);
      } catch (e) {
        toast.error(e.message);
      }
      return;
    }

    startTransition(() => {
      editorRequest("/e/api", {
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
          setResolvedFile(res.file);
          rememberEditorFile(res.file);
          updateEditorUrl(res.file, { refresh: true });
          toast.success(`saved ${res.file}`);
        })
        .catch((e) => toast.error(e.message));
    });
  }

  async function deleteFile() {
    const deletedFile = file;
    if (busy || !deletedFile) return;

    if (
      useLocalEditorStore &&
      initialFiles.includes(deletedFile)
    ) {
      toast.error("bundled files cannot be deleted in localStorage mode");
      return;
    }

    const dirtyWarning = dirty
      ? "\n\nUnsaved changes will be discarded."
      : "";
    if (!window.confirm(`Delete file?\n\n${deletedFile}${dirtyWarning}`)) {
      return;
    }

    setDeleting(true);
    deletingFileRef.current = deletedFile;

    try {
      let nextFiles = [];
      if (useLocalEditorStore) {
        const res = deleteLocalEditorFile(deletedFile);
        if (!res.ok) throw new Error(res.msg || "delete failed");
        nextFiles = listLocalEditorFiles(initialFiles);
      } else {
        const res = await editorRequest(
          `/e/api?file=${encodeURIComponent(deletedFile)}`,
          { method: "DELETE" },
        );
        nextFiles = res.files;
      }

      const nextFile = getFileAfterDelete(
        files,
        nextFiles,
        deletedFile,
      );
      removeEditorHistory(deletedFile);
      forgetEditorFile();
      setFiles(nextFiles);
      setFile("");
      setDraftFile("");
      setContent("");
      setSavedContent("");
      setResolvedFile("");
      toast.success(`deleted ${deletedFile}`);

      if (nextFile) {
        rememberEditorFile(nextFile);
        updateEditorUrl(nextFile, { replace: true, refresh: true });
      } else {
        router.replace("/e", { scroll: false });
        router.refresh();
      }
    } catch (error) {
      toast.error(error?.message || "delete failed");
    } finally {
      deletingFileRef.current = "";
      setDeleting(false);
    }
  }

  function storeGlobalCoins() {
    if (busy || !isCoinFile) return;
    const ok = window.confirm(
      "Save this editor coin file and append new coins into data/coins? You still need to git push after saving.",
    );
    if (!ok) return;

    if (useLocalEditorStore) {
      try {
        const saveContent = getSaveContent();
        if (/\.json$/i.test(trimmedDraftFile)) JSON.parse(saveContent);

        const res = saveLocalEditorFile(trimmedDraftFile, saveContent);
        setFiles(listLocalEditorFiles(initialFiles));
        setFile(res.file);
        setDraftFile(res.file);
        setContent(res.content);
        setSavedContent(res.content);
        setResolvedFile(res.file);
        rememberEditorFile(res.file);
        updateEditorUrl(res.file);
        toast.success(`saved local ${res.file}; global store is local-dev only`);
      } catch (e) {
        toast.error(e.message);
      }
      return;
    }

    startTransition(() => {
      editorRequest("/e/api", {
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
          setResolvedFile(res.file);
          rememberEditorFile(res.file);
          updateEditorUrl(res.file, { refresh: true });

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
          disabled={busy || files.length < 2}
          title="previous file"
        >
          {"<"}
        </button>
        <select
          value={file}
          onChange={(e) => loadFile(e.target.value)}
          disabled={busy || !files.length}
        >
          {!file && (
            <option value="" disabled>
              {trimmedDraftFile
                ? `new: ${trimmedDraftFile}`
                : files.length
                  ? "select file"
                  : "no files"}
            </option>
          )}
          {fileOptions.map((option) => (
            <option key={option.name} value={option.name}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn small bgGray"
          onClick={() => cycleFile("next")}
          disabled={busy || files.length < 2}
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
          disabled={busy}
        />

        <button
          className="btn small"
          onClick={saveFile}
          disabled={busy || !draftFile.trim()}
        >
          save
        </button>

        {!!file && (
          <button
            type="button"
            className="btn small bgGray editorDeleteButton"
            title={
              fileDeleteBlocked
                ? "bundled files cannot be deleted in localStorage mode"
                : `delete ${file}`
            }
            aria-label={`delete ${file}`}
            onClick={deleteFile}
            disabled={busy || fileDeleteBlocked}
          >
            <TrashIcon />
          </button>
        )}

        <span className={dirty ? "yellow" : "gray"}>
          {busy ? "working" : dirty ? "unsaved" : "saved"}
        </span>

        {isCoinFile && (
          <button
            className="btn small bgGray"
            onClick={storeGlobalCoins}
            disabled={busy || !trimmedDraftFile}
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
