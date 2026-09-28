import { z } from "zod";

import { handle, readJson } from "@/lib/api";
import { audit } from "@/lib/services/audit";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { apiAdmin } from "@/lib/session";

export const GET = handle(async () => {
  await apiAdmin();
  return { settings: await getSettings() };
});

const Body = z.object({
  filenameTemplate: z.string().trim().min(3).max(200).optional(),
  concurrency: z
    .object({ higgsfield: z.number().int().min(1).max(100), fal: z.number().int().min(1).max(100), mock: z.number().int().min(1).max(100) })
    .partial()
    .optional(),
  defaultVisibility: z.enum(["private", "team", "company"]).optional(),
  allowSignup: z.boolean().optional(),
  signupDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(20).optional(),
  budgetWarnPercent: z.number().int().min(10).max(100).optional(),
});

export const PATCH = handle(async (req: Request) => {
  const admin = await apiAdmin();
  const b = Body.parse(await readJson(req));
  const current = await getSettings();
  const { concurrency, ...rest } = b;
  await updateSettings(
    {
      ...rest,
      ...(concurrency
        ? {
            concurrency: {
              higgsfield: concurrency.higgsfield ?? current.concurrency.higgsfield,
              fal: concurrency.fal ?? current.concurrency.fal,
              mock: concurrency.mock ?? current.concurrency.mock,
            },
          }
        : {}),
    },
    admin.id,
  );
  await audit(admin.id, "settings.update", null, b as Record<string, unknown>);
  return { settings: await getSettings() };
});
