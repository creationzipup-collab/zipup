import { handle } from "@/lib/api";
import { apiUser } from "@/lib/session";

/**
 * 캔버스 실시간 공유(Supabase Realtime) 연결 정보 — 로그인한 사람에게만.
 * 공개용(publishable/anon) 키라서 브라우저에 보내도 되는 값이에요.
 */
export const GET = handle(async () => {
  await apiUser();
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  // 설정이 없으면 꺼진 상태로 (브라우저 콘솔에 404가 남지 않게 200으로)
  if (!url || !key) return { url: null, key: null };
  return { url, key };
});
