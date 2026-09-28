import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { HttpError } from "@/lib/errors";

/** Route Handler 공통 래퍼: HttpError → JSON 응답 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response | unknown>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const msg = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return NextResponse.json({ error: `입력값 오류: ${msg}`, code: "validation" }, { status: 400 });
  }
  // Next.js의 redirect/notFound 등 제어 흐름은 그대로 던짐
  if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string") {
    const digest = (err as { digest: string }).digest;
    if (digest.startsWith("NEXT_")) throw err;
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요." }, { status: 500 });
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "요청 본문(JSON)을 읽을 수 없어요.");
  }
}
