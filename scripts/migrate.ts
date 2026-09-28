/**
 * DB 마이그레이션 실행: pnpm db:migrate
 * (Vercel에서는 vercel-build가 빌드 전에 자동으로 실행해요)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { describeDatabaseUrl, migrationDatabaseUrls } from "../src/lib/db/url";

// .env.local → .env 순서로 읽기 (이미 설정된 환경변수가 우선)
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // 파일 없음
  }
}

async function connect(): Promise<postgres.Sql> {
  const configured = migrationDatabaseUrls(process.env);
  const candidates = configured.length ? configured : ["postgresql://zipup:zipup@localhost:5432/zipup"];
  for (const [i, url] of candidates.entries()) {
    const client = postgres(url, { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 });
    try {
      await client`select 1`;
      return client;
    } catch (err) {
      await client.end({ timeout: 1 }).catch(() => {});
      // 직접 연결(IPv6 전용 등)이 안 되면 다음 주소(풀러)로
      if (i === candidates.length - 1) throw err;
      console.warn(`⚠ ${describeDatabaseUrl(url)}에 접속하지 못해 다음 주소로 시도해요. (${(err as Error).message})`);
    }
  }
  throw new Error("DB 주소가 없어요.");
}

async function main() {
  if (!migrationDatabaseUrls(process.env).length && process.env.VERCEL) {
    // Vercel 빌드인데 DB 주소가 없으면 마이그레이션만 건너뛰고 빌드는 계속
    console.warn("⚠ DB 주소(DATABASE_URL 또는 POSTGRES_URL)가 없어 마이그레이션을 건너뛰어요. Vercel 환경 변수를 확인해 주세요.");
    return;
  }
  const client = await connect();
  try {
    // 검색용 트라이그램 확장 (Supabase에서도 사용 가능)
    await client.unsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
