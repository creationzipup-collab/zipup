import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

/**
 * 관리자 화면에서 입력한 외부 API 키를 DB에 암호화해 보관 (AES-256-GCM).
 * 암호화 키는 BETTER_AUTH_SECRET에서 파생해요. 이 값을 바꾸면 저장된 키를 다시 입력해야 해요.
 */
function key(): Buffer {
  const secret = env.authSecret;
  if (!secret) throw new Error("BETTER_AUTH_SECRET 환경 변수가 필요합니다.");
  return createHash("sha256").update(`zipup-settings-v1|${secret}`).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unseal<T>(sealed: string): T | null {
  try {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const out = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** 화면에 보여 줄 때: 앞 4자와 끝 4자만 */
export function maskSecret(s: string | undefined | null): string | null {
  if (!s) return null;
  if (s.length <= 10) return "••••";
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}
