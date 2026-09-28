import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { audit } from "@/lib/services/audit";
import { updateSettings } from "@/lib/services/settings";
import { saveTranslationKeys, translationStatus } from "@/lib/services/translate";
import { apiAdmin } from "@/lib/session";

export const maxDuration = 30;

export const GET = handle(async () => {
  await apiAdmin();
  return translationStatus();
});

const key = z.string().trim().min(8).max(300);
const Body = z.object({
  mode: z.enum(["auto", "azure", "papago", "google", "deepl", "llm", "off"]).optional(),
  keys: z
    .object({
      azure: z.object({ key, region: z.string().trim().max(40).nullish() }).nullable().optional(),
      papago: z.object({ id: key, key }).nullable().optional(),
      google: z.object({ key }).nullable().optional(),
      deepl: z.object({ key }).nullable().optional(),
    })
    .optional(),
});

/** 번역 엔진 선택·키 저장 (키는 암호화해 보관하고, 저장 전에 짧은 번역으로 확인) */
export const PATCH = handle(async (req: Request) => {
  const admin = await apiAdmin();
  const b = Body.parse(await readJson(req));
  if (b.keys) await saveTranslationKeys(b.keys, admin.id);
  if (b.mode) await updateSettings({ mtProvider: b.mode }, admin.id);
  await audit(admin.id, "settings.translation", null, {
    mode: b.mode ?? null,
    keys: b.keys ? Object.fromEntries(Object.entries(b.keys).map(([k, v]) => [k, v === null ? "removed" : "updated"])) : null,
  });
  return translationStatus();
});
