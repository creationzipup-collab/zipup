"use client";

import { motion } from "motion/react";

/** 페이지 이동 시 부드럽게 나타나기 (transform을 쓰지 않아 fixed·sticky 요소에 영향 없음) */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }} className="flex min-h-0 flex-1 flex-col">
      {children}
    </motion.div>
  );
}
