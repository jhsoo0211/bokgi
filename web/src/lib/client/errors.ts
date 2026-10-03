/** API 오류(서버 봉투 {error:{code,message}}를 옮긴 것). api.ts와 목 구현이 같이 쓴다. */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
