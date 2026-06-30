export function parseJson(text = "") {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
}

export function getTimeoutSignal(timeoutMs = 0) {
  if (!timeoutMs) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export function getArrayPayload(data, keys = []) {
  if (Array.isArray(data)) return data;

  for (const key of keys) {
    if (Array.isArray(data?.[key])) return data[key];
  }

  return [];
}
