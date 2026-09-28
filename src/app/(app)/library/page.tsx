import type { Metadata } from "next";
import { Suspense } from "react";

import { AssetBrowser } from "@/components/assets/asset-browser";
import { requireActiveUser } from "@/lib/session";

export const metadata: Metadata = { title: "라이브러리" };

export default async function LibraryPage() {
  const u = await requireActiveUser();
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-8 sm:py-8">
      <Suspense>
        <AssetBrowser
          title="라이브러리"
          label="Archive"
          accent="Every take, kept."
          subtitle="접근 가능한 모든 프로젝트의 이미지·영상을 한곳에서 검색하고 셀렉하세요."
          canEdit={u.role !== "viewer"}
        />
      </Suspense>
    </div>
  );
}
