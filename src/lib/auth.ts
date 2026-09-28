import "server-only";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { count, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { account, session, teams, user, verification } from "@/lib/db/schema";
import { env } from "@/lib/env";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function shouldBootstrapAdmin(email: string): Promise<boolean> {
  if (env.adminEmails.includes(email.toLowerCase())) return true;
  const [{ value }] = await db.select({ value: count() }).from(user).where(eq(user.role, "admin"));
  return value === 0;
}

async function validTeamId(teamId: unknown): Promise<string | null> {
  if (typeof teamId !== "string" || !UUID_RE.test(teamId)) return null;
  const row = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId)).limit(1);
  return row[0]?.id ?? null;
}

export const auth = betterAuth({
  appName: "ZIPUP AI",
  baseURL: env.appUrl,
  secret: env.authSecret,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  socialProviders:
    env.google.clientId && env.google.clientSecret
      ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret, prompt: "select_account" } }
      : {},
  user: {
    additionalFields: {
      status: { type: "string", required: false, defaultValue: "pending", input: false },
      role: { type: "string", required: false, defaultValue: "member", input: false },
      teamId: { type: "string", required: false, input: false },
      requestedTeamId: { type: "string", required: false, input: true },
      jobTitle: { type: "string", required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const email = String(data.email ?? "").toLowerCase();
          const bootstrap = await shouldBootstrapAdmin(email);
          if (!bootstrap) {
            const { getSettings } = await import("@/lib/services/settings");
            const settings = await getSettings();
            if (!settings.allowSignup) {
              throw new APIError("FORBIDDEN", { message: "현재 회원가입이 닫혀 있어요. 관리자에게 문의하세요." });
            }
            const domain = email.split("@")[1] ?? "";
            if (settings.signupDomains.length && !settings.signupDomains.includes(domain)) {
              throw new APIError("FORBIDDEN", {
                message: `회사 이메일(${settings.signupDomains.map((d) => "@" + d).join(", ")})로만 가입할 수 있어요.`,
              });
            }
          }
          const requestedTeamId = await validTeamId(data.requestedTeamId);
          const jobTitle = typeof data.jobTitle === "string" ? data.jobTitle.slice(0, 40) : null;
          if (bootstrap) {
            return {
              data: {
                ...data,
                email,
                status: "active",
                role: "admin",
                teamId: requestedTeamId,
                requestedTeamId,
                jobTitle,
              },
            };
          }
          return {
            data: { ...data, email, status: "pending", role: "member", teamId: null, requestedTeamId, jobTitle },
          };
        },
        after: async (created) => {
          // 순환 import 방지를 위해 지연 로드
          const { onUserSignedUp } = await import("@/lib/services/users");
          await onUserSignedUp(created.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
