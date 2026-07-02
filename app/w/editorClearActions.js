"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { projectFileWriteBlockedResult } from "../projectFileWrites";

const editorDataDir = path.join(process.cwd(), "data", "editor");

function cleanEditorClearTarget(target = "ALL") {
  const clean = String(target || "ALL").trim();
  if (!clean || clean.toUpperCase() == "ALL") return "ALL";
  if (
    clean.includes("\0") ||
    clean.includes("/") ||
    clean.includes("\\") ||
    clean == "." ||
    clean == ".."
  ) {
    throw new Error("invalid data folder");
  }

  return clean;
}

async function clearEditorDataFolder(target = "ALL") {
  const cleanTarget = cleanEditorClearTarget(target);
  const stat = await fs.stat(editorDataDir).catch((e) => {
    if (e.code == "ENOENT") return null;
    throw e;
  });
  if (!stat?.isDirectory()) return 0;

  if (cleanTarget == "ALL") {
    const entries = await fs.readdir(editorDataDir);
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(editorDataDir, entry), { recursive: true, force: true }),
      ),
    );
    return entries.length;
  }

  const targetPath = path.resolve(editorDataDir, cleanTarget);
  const relative = path.relative(editorDataDir, targetPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid data folder");
  }

  const existed = await fs
    .stat(targetPath)
    .then(() => true)
    .catch((e) => {
      if (e.code == "ENOENT") return false;
      throw e;
    });
  await fs.rm(targetPath, { recursive: true, force: true });
  return existed ? 1 : 0;
}

export async function clearEditorData({ target = "ALL" } = {}) {
  if (process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES) {
    return projectFileWriteBlockedResult();
  }

  const cleanTarget = cleanEditorClearTarget(target);
  const removed = await clearEditorDataFolder(cleanTarget);
  revalidatePath("/w");
  revalidatePath("/t");
  revalidatePath("/editor");

  return { ok: true, target: cleanTarget, removed };
}
