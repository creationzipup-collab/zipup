"use client";

import Link from "next/link";

import { PromptLibrary, type LibraryItem } from "@/components/prompts/library";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * 스튜디오의 프롬프트 라이브러리 — /prompts와 같은 곳이에요.
 * 저장 · 받은 · 팀·전사 · 보낸 중에서 골라 바로 쓰고, 오른쪽에서 대화도 이어가요.
 */
export function PromptLibraryDialog({
  open,
  onOpenChange,
  kind,
  onUse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "image" | "video";
  onUse: (p: LibraryItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" title="프롬프트 라이브러리" description="저장한 것, 받은 것, 팀에 공유된 것, 내가 보낸 것. 고르면 오른쪽에서 내용과 대화를 볼 수 있어요." className="max-w-[1180px]">
        {open && (
          <PromptLibrary
            mode="picker"
            kind={kind}
            className="h-[min(72vh,760px)] px-4 pt-2"
            onUse={(p) => {
              onUse(p);
              onOpenChange(false);
            }}
            toolbarEnd={
              <Link href="/prompts" className="hidden pb-2 text-[12px] text-fg-3 hover:text-fg sm:block sm:pb-0" onClick={() => onOpenChange(false)}>
                전체 화면 →
              </Link>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
