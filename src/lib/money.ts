/** 금액은 DB에 micro-USD(1 USD = 1,000,000) 정수로 저장합니다. */
export const MICROS = 1_000_000;

export function usdToMicros(usd: number): number {
  return Math.round(usd * MICROS);
}

export function microsToUsd(micros: number | null | undefined): number {
  return (micros ?? 0) / MICROS;
}

export function formatUsd(micros: number | null | undefined, opts: { precise?: boolean } = {}): string {
  const usd = microsToUsd(micros);
  if (opts.precise || (usd > 0 && usd < 1)) {
    const digits = usd >= 0.1 ? 2 : usd >= 0.01 ? 3 : 4;
    return `$${usd.toFixed(digits)}`;
  }
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 한국 시간 기준 이번 달 1일 00:00 (UTC Date) */
export function monthStartKst(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3600_000);
}

/** 한국 시간 기준 오늘 00:00 (UTC Date) */
export function dayStartKst(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000);
}
