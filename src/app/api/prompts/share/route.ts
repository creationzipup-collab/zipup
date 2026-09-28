import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { sendPrompt } from "@/lib/services/prompt-docs";
import { apiUser } from "@/lib/session";

const Body = z
  .object({
    presetId: z.string().uuid().nullish(),
    assetId: z.string().uuid().nullish(),
    title: z.string().trim().max(80).nullish(),
    message: z.string().trim().max(500).nullish(),
    to: z.object({
      users: z.array(z.string().min(1)).max(50).optional(),
      team: z.boolean().optional(),
      company: z.boolean().optional(),
    }),
  })
  .refine((b) => b.presetId || b.assetId, { message: "보낼 프롬프트나 클립이 필요해요." });

/** 프롬프트 보내기 — 사람·팀·전사. 받은 사람에게 알림이 가요. */
export const POST = handle(async (req: Request) => {
  const u = await apiUser();
  const b = Body.parse(await readJson(req));
  return sendPrompt(u, b);
});
