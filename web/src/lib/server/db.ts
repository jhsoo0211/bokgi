import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/server/generated/prisma/client";

export { Prisma };
export type { PrismaClient };
/** 트랜잭션 안에서도 밖에서도 쓰는 클라이언트 모양 */
export type Db = PrismaClient | Prisma.TransactionClient;

const holder = globalThis as unknown as { __bokgiPrisma?: PrismaClient };

/** Prisma 7은 드라이버 어댑터가 필수다. 연결은 첫 쿼리 때 맺는다(빌드 단계에서 import만 해도 안전). */
export function db(): PrismaClient {
  if (!holder.__bokgiPrisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    holder.__bokgiPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10 }) });
  }
  return holder.__bokgiPrisma;
}

/** 시험·스크립트 정리용 */
export async function disconnectDb(): Promise<void> {
  if (holder.__bokgiPrisma) {
    await holder.__bokgiPrisma.$disconnect();
    holder.__bokgiPrisma = undefined;
  }
}

/** 유일 키 위반(P2002)인지 */
export function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
