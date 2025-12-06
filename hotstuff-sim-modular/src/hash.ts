import { Digest } from "./types";

export function hashBytes(bytes: string): Digest {
  let h = 0;
  for (let i = 0; i < bytes.length; i++) {
    h = (h * 31 + bytes.charCodeAt(i)) | 0;
  }
  return `h${h >>> 0}`;
}

export function hashObject(obj: any): Digest {
  return hashBytes(JSON.stringify(obj));
}
