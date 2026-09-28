import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { audit } from "@/lib/services/audit";
import { updateModelConfig } from "@/lib/services/settings";
import { getModelStatus } from "@/lib/services/studio";
import { apiAdmin } from "@/lib/session";

export const GET = handle(async () => {
  await apiAdmin();
  return { status: await getModelStatus() };
});

const Body = z.object({
  modelId: z.string().min(1),
  enabled: z.boolean().optional(),
  priceOverrides: z.record(z.string(), z.number().min(0).max(1000)).optional(),
  notes: z.string().max(300).nullable().optional(),
});

export const PATCH = handle(async (req: Request) => {
  const admin = await apiAdmin();
  const b = Body.parse(await readJson(req));
  await updateModelConfig(b.modelId, { enabled: b.enabled, priceOverrides: b.priceOverrides, notes: b.notes }, admin.id);
  await audit(admin.id, "model.update", { type: "model", id: b.modelId }, b as Record<string, unknown>);
  return { ok: true };
});
