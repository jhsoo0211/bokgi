import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 배포(패키지 B): Docker 런너 이미지는 .next/standalone만 복사한다(Dockerfile 참고).
  output: "standalone",
};

export default nextConfig;
