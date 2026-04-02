import { deflateRawSync, inflateRawSync } from "zlib";

const COMPRESSED_PREFIX = "v1:";

export function encodeCookiePayload(value: unknown) {
  const json = JSON.stringify(value);
  const compressed = deflateRawSync(Buffer.from(json, "utf8"));
  return `${COMPRESSED_PREFIX}${compressed.toString("base64url")}`;
}

export function decodeCookiePayload<T>(raw: string | null | undefined): T | null {
  if (!raw) {
    return null;
  }

  try {
    if (raw.startsWith(COMPRESSED_PREFIX)) {
      const compressed = Buffer.from(raw.slice(COMPRESSED_PREFIX.length), "base64url");
      return JSON.parse(inflateRawSync(compressed).toString("utf8")) as T;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
