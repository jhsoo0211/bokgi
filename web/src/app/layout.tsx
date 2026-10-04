import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "복기",
  description: "실제 과거 사례로 먼저 판단하고, 결과를 되짚어 금융 개념을 배우는 투자 학습",
  robots: { index: false, follow: false }, // 초대 베타
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbfbf9",
  // 학습지 테마는 밝은 종이 하나뿐이다. 'only light'로 브라우저의 강제 어둡게 하기(안드로이드 크롬 등)를 막는다 —
  // 강제 반전되면 빨강·파랑 결과색과 빨간 펜 표시의 뜻이 흐려진다(2026-10-04 UX 감사)
  colorScheme: "only light",
};

/** 학습지 테마(docs/06 §8): <html data-theme="worksheet">, 본문은 .ds-root */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="worksheet">
      <body className="ds-root">{children}</body>
    </html>
  );
}
