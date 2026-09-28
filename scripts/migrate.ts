/**
 * DB 마이그레이션 실행: pnpm db:migrate
 * (Vercel 배포 전/후에 DATABASE_URL을 지정해서 한 번 실행하세요)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url =
    process.env.DIRECT_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://zipup:zipup@localhost:5432/zipup";
  const client = postgres(url, { max: 1, prepare: false });
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
