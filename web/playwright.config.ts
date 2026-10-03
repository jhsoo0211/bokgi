import { defineConfig, devices } from "@playwright/test";

/**
 * 복기 e2e (패키지 D). 380×760 모바일 화면, Asia/Seoul.
 * - 기본(npm run e2e): `next dev`를 목 모드(NEXT_PUBLIC_USE_MOCK=1)로 띄워 tests/e2e 전체를 돈다. canary.spec.ts는 건너뛴다.
 * - 실제 API(E2E_REAL_API=1 npm run e2e:real): 목 없이 띄우고 canary.spec.ts만 돈다(패키지 A가 CANARY 카드를 시드한 DB 필요).
 *   PUBLIC_ORIGIN은 시험 주소로 맞춘다(비GET Origin 검사). 이미 떠 있는 서버를 쓰려면 E2E_BASE_URL.
 * `next dev`는 한 폴더에 하나만 뜬다(.next/dev/lock) — 다른 dev 서버가 떠 있으면 먼저 내린다.
 */
const PORT = Number(process.env.E2E_PORT ?? 3210);
const REAL = process.env.E2E_REAL_API === "1";
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: REAL ? /canary\.spec\.ts$/ : /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 7_000 },
  reporter: [["list"]],
  outputDir: "./.next/e2e-results",   // .next는 git 제외 — 실패 때만 추적·스크린샷이 남는다
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    viewport: { width: 380, height: 760 },
    deviceScaleFactor: 1,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
        env: REAL ? { PUBLIC_ORIGIN: BASE_URL, NEXT_PUBLIC_USE_MOCK: "0" } : { NEXT_PUBLIC_USE_MOCK: "1" },
      },
});
