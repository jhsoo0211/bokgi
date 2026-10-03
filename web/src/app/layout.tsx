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
};

/** 학습지 테마(docs/06 §8): <html data-theme="worksheet">, 본문은 .ds-root */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-theme="worksheet">
      <body className="ds-root">{children}</body>
    </html>
  );
}
