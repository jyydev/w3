export const projectFileWriteMsg =
  "Project file writes are disabled on this deployment. Use localStorage mode or persistent storage.";

export function projectFileWritesDisabled() {
  return Boolean(process.env.VERCEL || process.env.W3_DISABLE_FILE_WRITES);
}

export function assertProjectFileWrites() {
  if (projectFileWritesDisabled()) {
    throw new Error(projectFileWriteMsg);
  }
}

export function projectFileWriteBlockedResult() {
  return { ok: false, msg: projectFileWriteMsg };
}
