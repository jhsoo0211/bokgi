import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fromDbDate, isDateString, localDate, monthDays, toDbDate } from "@/lib/server/time";
import { streakFrom } from "@/server/rules";

describe("하루 경계는 서버가 tz로 계산한다", () => {
  it("UTC 15:00 = 서울 자정: 앞뒤로 날짜가 바뀐다", () => {
    expect(localDate(new Date("2026-10-03T14:59:59Z"), "Asia/Seoul")).toBe("2026-10-03");
    expect(localDate(new Date("2026-10-03T15:00:00Z"), "Asia/Seoul")).toBe("2026-10-04");
  });

  it("같은 순간도 tz에 따라 다른 날", () => {
    const t = new Date("2026-10-03T15:30:00Z");
    expect(localDate(t, "Asia/Seoul")).toBe("2026-10-04");
    expect(localDate(t, "America/Los_Angeles")).toBe("2026-10-03");
    expect(localDate(t, "UTC")).toBe("2026-10-03");
  });

  it("서머타임 시작일에도 날짜가 하루씩 움직인다", () => {
    expect(localDate(new Date("2026-03-08T06:59:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDate(new Date("2026-03-08T07:00:00Z"), "America/New_York")).toBe("2026-03-08");
    expect(localDate(new Date("2026-03-09T04:00:00Z"), "America/New_York")).toBe("2026-03-09");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("잘못된 tz는 서울로", () => {
    expect(localDate(new Date("2026-10-03T15:30:00Z"), "Mars/Base")).toBe("2026-10-04");
  });
});

describe("달력 계산", () => {
  it("달·해·윤년 경계", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-25", "2026-10-04")).toBe(21);
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2026-10")[0]).toBe("2026-10-01");
    expect(monthDays("2026-10").at(-1)).toBe("2026-10-31");
  });

  it("DB date 왕복", () => {
    expect(fromDbDate(toDbDate("2026-10-04"))).toBe("2026-10-04");
    expect(isDateString("2026-02-30")).toBe(false);
    expect(isDateString("2026-02-28")).toBe(true);
  });
});

describe("스트릭은 사용자 tz의 날짜로 센다", () => {
  // 같은 두 판단 시각: 서울에서는 이틀(23시·다음 날 1시), LA에서는 같은 날 하루
  const instants = [new Date("2026-10-03T14:00:00Z"), new Date("2026-10-03T16:00:00Z")];
  const now = new Date("2026-10-03T17:00:00Z");

  it("서울: 2일", () => {
    const tz = "Asia/Seoul";
    expect(streakFrom(instants.map((d) => localDate(d, tz)), localDate(now, tz))).toBe(2);
  });

  it("LA: 1일", () => {
    const tz = "America/Los_Angeles";
    expect(streakFrom(instants.map((d) => localDate(d, tz)), localDate(now, tz))).toBe(1);
  });
});
