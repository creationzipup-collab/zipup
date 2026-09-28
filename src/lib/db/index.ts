import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/env";
import * as schema from "./schema";

type Db = ReturnType<typeof createDb>;

function createDb() {
  const client = postgres(env.databaseUrl, {
    // Supabase 트랜잭션 풀러(6543) 사용 시 prepared statement를 쓰지 않아야 합니다.
    prepare: false,
    max: env.isProd ? 5 : 10,
    idle_timeout: 20,
  });
  return drizzle(client, { schema, casing: "snake_case" });
}

const globalForDb = globalThis as unknown as { __zipupDb?: Db };

export const db: Db = globalForDb.__zipupDb ?? createDb();
if (!env.isProd) globalForDb.__zipupDb = db;

export { schema };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
