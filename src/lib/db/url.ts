/**
 * DB 접속 주소 고르기·정리.
 * - DATABASE_URL / DIRECT_DATABASE_URL 이 없으면 Vercel의 Supabase 연동이 넣어 주는
 *   POSTGRES_URL(풀러) / POSTGRES_URL_NON_POOLING 을 써요.
 * - postgres.js는 모르는 쿼리 파라미터를 서버 접속 파라미터로 보내요. 그래서 Prisma·풀러 전용 값
 *   (supa, pgbouncer 등)은 지워요. sslmode는 그대로 둬요.
 */
type Env = Record<string, string | undefined>;

const DROP_PARAMS = ["supa", "pgbouncer", "connection_limit", "pool_timeout", "schema", "statement_cache_size"];

export function normalizeDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  const drop = DROP_PARAMS.filter((p) => url.searchParams.has(p));
  if (!drop.length) return raw;
  for (const p of drop) url.searchParams.delete(p);
  return url.toString();
}

function pick(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

/** 앱이 쓸 주소 (Supabase는 Transaction pooler, 포트 6543) */
export function appDatabaseUrl(env: Env): string | undefined {
  const v = pick(env, "DATABASE_URL") ?? pick(env, "POSTGRES_URL");
  return v && normalizeDatabaseUrl(v);
}

/** 마이그레이션에 쓸 주소 후보 (앞에서부터 접속을 시도) */
export function migrationDatabaseUrls(env: Env): string[] {
  const list = ["DIRECT_DATABASE_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL", "POSTGRES_URL"]
    .map((n) => pick(env, n))
    .filter((v): v is string => !!v)
    .map(normalizeDatabaseUrl);
  return [...new Set(list)];
}

/** 로그에 남겨도 되는 주소 요약 (비밀번호 제외) */
export function describeDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "(주소 형식 오류)";
  }
}
