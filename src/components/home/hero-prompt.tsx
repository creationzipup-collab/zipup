"use client";

import { ArrowRight, Clapperboard, ImagePlus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "A woman in a red silk dress walking through a neon-lit Seoul alley at night, light rain, cinematic 35mm",
  "투명한 유리 향수병 제품 사진, 부드러운 스튜디오 조명, 파스텔 그라디언트 배경",
  "Slow dolly-in on a dancer under red stage lights, haze, the camera circles around her",
  "夜晚霓虹街道上的人物特写，电影感，35毫米胶片颗粒",
  "Cute 3D mascot turnaround sheet, front, side and back views, white background",
];

/** 홈 히어로: 여기서 바로 프롬프트를 쓰고 스튜디오로 */
export function HeroPrompt({ recent }: { recent: { id: string; title: string; prompt: string; kind: "image" | "video" | "any" }[] }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [example, setExample] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (value) return;
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3800);
    return () => clearInterval(t);
  }, [value]);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 64), 220)}px`;
  }, [value]);

  function go(kind: "image" | "video", preset?: string) {
    if (preset) return router.push(`/create/${kind}?preset=${preset}`);
    const text = value.trim();
    router.push(text ? `/create/${kind}?prompt=${encodeURIComponent(text)}` : `/create/${kind}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("prompt-card rounded-[22px] p-px transition", focused && "shadow-[0_30px_80px_-30px_color-mix(in_oklab,var(--accent)_40%,transparent)]")}>
        <div className="relative rounded-[21px] bg-panel/90 backdrop-blur">
          <div className="relative">
            <textarea
              ref={ref}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  go(e.shiftKey ? "video" : "image");
                }
              }}
              rows={2}
              aria-label="프롬프트"
              className="relative z-10 block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[17px] leading-[1.7] outline-none"
            />
            {!value && (
              <div className="pointer-events-none absolute inset-x-5 top-4 text-[17px] leading-[1.7] text-fg-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={example}
                    initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
                    transition={{ duration: 0.35 }}
                    className="line-clamp-2"
                  >
                    {EXAMPLES[example]}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
            <span className="hidden px-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-fg-4 sm:inline">KO · EN · ZH</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => go("video")}
                className="flex h-10 items-center gap-2 rounded-xl border border-line-2 bg-panel-2 px-3.5 text-[13.5px] font-medium transition hover:border-line-3 hover:bg-panel-3"
              >
                <Clapperboard className="size-4" /> 영상 만들기
              </button>
              <button
                type="button"
                onClick={() => go("image")}
                className="group flex h-10 items-center gap-2 rounded-xl bg-inv px-4 text-[13.5px] font-semibold text-inv-fg shadow-[0_0_30px_-8px_var(--accent)] transition hover:opacity-90"
              >
                <ImagePlus className="size-4" /> 이미지 만들기
                <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-[12px] text-fg-4">
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> 이미지
        </span>
        <span className="mr-2 flex items-center gap-1">
          <Kbd>⇧</Kbd>
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> 영상
        </span>
        {recent.length > 0 && <span className="text-fg-4">최근 저장한 프롬프트</span>}
        {recent.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => go(p.kind === "video" ? "video" : "image", p.id)}
            className="max-w-[220px] truncate rounded-full border border-line-2 bg-panel/60 px-2.5 py-1 text-[12px] text-fg-3 transition hover:border-line-3 hover:text-fg"
            title={p.prompt}
          >
            {p.title}
          </button>
        ))}
      </div>
    </div>
  );
}
