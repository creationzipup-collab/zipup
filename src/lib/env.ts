import "server-only";

/**
 * 서버 환경 변수. 값이 없을 때의 기본 동작:
 * - Higgsfield / fal 키가 없으면 해당 모델은 "모의(mock) 생성"으로 동작합니다(개발용).
 * - S3/R2 설정이 없으면 로컬 디스크(.data/storage)에 저장합니다.
 */
function str(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function parseHiggsfieldCredentials() {
  const combined = str("HF_CREDENTIALS") ?? str("HF_KEY");
  if (combined && combined.includes(":")) {
    const idx = combined.indexOf(":");
    return { keyId: combined.slice(0, idx), keySecret: combined.slice(idx + 1) };
  }
  const keyId = str("HF_API_KEY_ID") ?? str("HF_API_KEY");
  const keySecret = str("HF_API_KEY_SECRET") ?? str("HF_API_SECRET");
  if (keyId && keySecret) return { keyId, keySecret };
  return undefined;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  databaseUrl: str("DATABASE_URL") ?? "postgresql://zipup:zipup@localhost:5432/zipup",
  authSecret:
    str("BETTER_AUTH_SECRET") ?? (isProd ? undefined : "dev-only-secret-change-me-please-0123456789"),
  appUrl: (str("APP_URL") ?? str("BETTER_AUTH_URL") ?? (str("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${str("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined) ?? "http://localhost:3000").replace(/\/$/, ""),
  adminEmails: (str("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  cronSecret: str("CRON_SECRET"),
  /** 강제 모의 생성 모드 */
  mockGeneration: str("MOCK_GENERATION") === "1" || str("MOCK_GENERATION") === "true",
  higgsfield: {
    credentials: parseHiggsfieldCredentials(),
    baseUrl: (str("HF_BASE_URL") ?? "https://api.higgsfield.ai").replace(/\/$/, ""),
  },
  fal: {
    key: str("FAL_KEY"),
    queueUrl: (str("FAL_QUEUE_URL") ?? "https://queue.fal.run").replace(/\/$/, ""),
  },
  storage: {
    driver: (str("STORAGE_DRIVER") ?? (str("S3_BUCKET") ? "s3" : "local")) as "s3" | "local",
    localDir: str("LOCAL_STORAGE_DIR") ?? ".data/storage",
    s3: {
      endpoint: str("S3_ENDPOINT"),
      region: str("S3_REGION") ?? "auto",
      bucket: str("S3_BUCKET") ?? "",
      accessKeyId: str("S3_ACCESS_KEY_ID") ?? "",
      secretAccessKey: str("S3_SECRET_ACCESS_KEY") ?? "",
      forcePathStyle: str("S3_FORCE_PATH_STYLE") === "true",
    },
  },
  google: {
    clientId: str("GOOGLE_CLIENT_ID"),
    clientSecret: str("GOOGLE_CLIENT_SECRET"),
  },
  /**
   * 번역·단어 추천용 LLM
   * - LLM_BASE_URL + LLM_API_KEY: OpenAI 호환 API (Google Gemini 무료 키, OpenRouter, Groq 등)
   * - 없으면 FAL_KEY로 fal.ai의 OpenRouter 라우터 사용
   */
  llm: {
    baseUrl: str("LLM_BASE_URL")?.replace(/\/$/, ""),
    apiKey: str("LLM_API_KEY"),
    model: str("LLM_MODEL"),
    /** "off"면 LLM 기능 끔, "mock"이면 모의 응답(개발·시연용) */
    mode: (str("LLM_PROVIDER") ?? "auto") as "auto" | "openai" | "fal" | "mock" | "off",
  },
};

export function requireAuthSecret(): string {
  if (!env.authSecret) {
    throw new Error("BETTER_AUTH_SECRET 환경 변수가 필요합니다.");
  }
  return env.authSecret;
}
