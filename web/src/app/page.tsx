import { BokgiApp } from "@/components/app/BokgiApp";

/**
 * 복기 한 화면 앱. 서버 컴포넌트는 틀만 그리고, 카드·결과 자료는 클라이언트가 /api에서 받는다
 * (HTML·RSC 페이로드에 판단 전·후 자료가 들어가지 않는다 — ADR-0001, 카나리 시험).
 */
export default function Page() {
  return <BokgiApp />;
}
