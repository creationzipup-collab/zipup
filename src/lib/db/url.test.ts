import { describe, expect, it } from "vitest";

import { appDatabaseUrl, describeDatabaseUrl, migrationDatabaseUrls, normalizeDatabaseUrl } from "./url";

const POOLED = "postgres://postgres.abc:p%40ss@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
const SESSION = "postgres://postgres.abc:p%40ss@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require";

describe("normalizeDatabaseUrl", () => {
  it("drops pooler-only params and keeps sslmode and credentials", () => {
    const out = normalizeDatabaseUrl(POOLED);
    const u = new URL(out);
    expect(u.searchParams.get("supa")).toBeNull();
    expect(u.searchParams.get("sslmode")).toBe("require");
    expect(u.username).toBe("postgres.abc");
    expect(u.password).toBe("p%40ss");
    expect(u.port).toBe("6543");
  });

  it("leaves clean URLs untouched", () => {
    expect(normalizeDatabaseUrl(SESSION)).toBe(SESSION);
    expect(normalizeDatabaseUrl("not a url")).toBe("not a url");
  });
});

describe("database env fallbacks", () => {
  it("prefers DATABASE_URL, then the Vercel–Supabase POSTGRES_URL", () => {
    expect(appDatabaseUrl({ DATABASE_URL: SESSION, POSTGRES_URL: POOLED })).toBe(SESSION);
    expect(appDatabaseUrl({ POSTGRES_URL: POOLED })).not.toContain("supa=");
    expect(appDatabaseUrl({ DATABASE_URL: "  " })).toBeUndefined();
  });

  it("tries direct URLs before pooled ones for migrations, without duplicates", () => {
    expect(migrationDatabaseUrls({ POSTGRES_URL: POOLED, POSTGRES_URL_NON_POOLING: SESSION })).toEqual([SESSION, normalizeDatabaseUrl(POOLED)]);
    expect(migrationDatabaseUrls({ DATABASE_URL: SESSION, DIRECT_DATABASE_URL: SESSION })).toEqual([SESSION]);
    expect(migrationDatabaseUrls({})).toEqual([]);
  });

  it("describes a URL without the password", () => {
    expect(describeDatabaseUrl(POOLED)).toBe("aws-0-ap-northeast-2.pooler.supabase.com:6543");
  });
});
