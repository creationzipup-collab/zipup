export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "로그인이 필요해요.") => new HttpError(401, msg, "unauthorized");
export const forbidden = (msg = "권한이 없어요.") => new HttpError(403, msg, "forbidden");
export const notFound = (msg = "찾을 수 없어요.") => new HttpError(404, msg, "not_found");
export const badRequest = (msg: string, details?: Record<string, unknown>) =>
  new HttpError(400, msg, "bad_request", details);

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : "알 수 없는 오류가 발생했어요.";
}
