import { afterEach, describe, expect, it, vi } from "vitest";

import { formatReleaseDate } from "./formatReleaseDate";

describe("formatReleaseDate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("배포 날짜를 '월 일' 문구로 보여준다", () => {
    expect(formatReleaseDate("2026-10-20")).toBe("10월 20일");
  });

  it("한 자리 월·일은 앞에 0을 붙이지 않는다", () => {
    expect(formatReleaseDate("2027-01-05")).toBe("1월 5일");
  });

  it("브라우저 시간대와 관계없이 적은 날짜 그대로 보여준다", () => {
    vi.stubEnv("TZ", "America/Los_Angeles");

    expect(formatReleaseDate("2026-10-19")).toBe("10월 19일");
  });
});
