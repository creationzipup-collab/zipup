"use client";

import { motion } from "motion/react";

/**
 * 페이지가 바뀔 때: 위쪽을 셔터 라인이 스치고 화면이 페이드 인 (컷 전환 느낌).
 * transform을 쓰지 않아 fixed·sticky 요소에 영향 없음.
 */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }} className="flex min-h-0 flex-1 flex-col">
      <div aria-hidden className="pointer-events-none sticky top-14 z-30 h-0">
        <span className="shutter-line" />
      </div>
      {children}
    </motion.div>
  );
}
