import { desc, eq } from "drizzle-orm";

import { SectionHead } from "@/components/brand/hud";
import { ActiveCuts, HomeHero, TakeGrid } from "@/components/home/board";
import { db } from "@/lib/db";
import { promptPresets } from "@/lib/db/schema";
import { homeBoard } from "@/lib/services/home";
import { requireActiveUser } from "@/lib/session";

/** 홈: 영상 한 장면 위에 프롬프트, 아래에 진행 중인 컷과 최근 OK */
export default async function HomePage() {
  const u = await requireActiveUser();
  const [board, recentPrompts] = await Promise.all([
    homeBoard(u),
    db
      .select({ id: promptPresets.id, title: promptPresets.title, prompt: promptPresets.prompt, kind: promptPresets.kind })
      .from(promptPresets)
      .where(eq(promptPresets.userId, u.id))
      .orderBy(desc(promptPresets.updatedAt))
      .limit(8),
  ]);

  return (
    <div className="flex flex-col">
      <HomeHero date={board.today} recent={recentPrompts} generating={board.stats.generating} />

      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-16 px-4 pb-24 pt-14 sm:px-8">
        <section className="flex min-w-0 flex-col gap-4">
          <SectionHead index="01" title="진행 중인 컷" href="/projects" hrefLabel="프로젝트" />
          <ActiveCuts cuts={board.cuts} />
        </section>

        <section className="flex flex-col gap-4">
          <SectionHead index="02" title="최근 OK" href="/library?q=is%3Aok" hrefLabel="OK 모아 보기" />
          {board.ok.length ? (
            <TakeGrid takes={board.ok.slice(0, 7)} big />
          ) : (
            <p className="border-t border-line py-6 text-[13px] text-fg-3">아직 OK로 고른 테이크가 없어요. 클립을 열고 P를 누르면 OK가 돼요.</p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHead index="03" title="내 최근 작업" href="/library?mine=1" />
          {board.mine.length ? <TakeGrid takes={board.mine} /> : <p className="border-t border-line py-6 text-[13px] text-fg-3">아직 만든 결과물이 없어요.</p>}
        </section>
      </div>
    </div>
  );
}
