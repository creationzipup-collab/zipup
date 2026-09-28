/** 프롬프트 언어 추정 (문자 종류 비율 기준) */
export type PromptLang = "ko" | "zh" | "en" | "mixed" | "empty";

export const LANG_LABEL: Record<PromptLang, string> = {
  ko: "한국어",
  zh: "中文",
  en: "English",
  mixed: "혼합",
  empty: "",
};

export function detectLang(text: string): PromptLang {
  let ko = 0;
  let zh = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3131 && c <= 0x318e)) ko++;
    else if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) zh++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  // 한글 1자 ≈ 영문 3자 정도의 정보량으로 보정
  const scores = { ko: ko * 3, zh: zh * 3, en: latin };
  const total = scores.ko + scores.zh + scores.en;
  if (!total) return "empty";
  const [top, value] = (Object.entries(scores) as [PromptLang, number][]).sort((a, b) => b[1] - a[1])[0];
  return value / total >= 0.7 ? top : "mixed";
}
