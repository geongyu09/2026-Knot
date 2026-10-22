import { describe, expect, it } from "vitest";

import { RELEASE_NOTES } from ".";

// 기획자가 손으로 쓰는 파일이라, 릴리즈 PR CI와 패널이 기대는 규칙을 여기서 막아요
describe("RELEASE_NOTES", () => {
  it("노트 id는 릴리즈 버전(vX.Y.Z) 형식이다", () => {
    RELEASE_NOTES.forEach(({ id }) => {
      expect(id).toMatch(/^v\d+\.\d+\.\d+$/);
    });
  });

  it("노트 id는 겹치지 않는다", () => {
    const ids = RELEASE_NOTES.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("배포 날짜는 YYYY-MM-DD 형식이다", () => {
    RELEASE_NOTES.forEach(({ releasedAt }) => {
      expect(releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("최신 노트가 맨 위에 있도록 배포 날짜가 최신부터 놓인다", () => {
    const dates = RELEASE_NOTES.map(({ releasedAt }) => releasedAt);
    // YYYY-MM-DD는 글자 순서가 날짜 순서와 같아요
    const newestFirst = [...dates].sort().reverse();

    expect(dates).toEqual(newestFirst);
  });

  it("큰 변화는 노트마다 하나까지만 둔다", () => {
    RELEASE_NOTES.forEach(({ items }) => {
      const highlights = items.filter(({ isHighlight }) => isHighlight);

      expect(highlights.length).toBeLessThanOrEqual(1);
    });
  });

  it("노트마다 항목이 하나 이상 있다", () => {
    RELEASE_NOTES.forEach(({ items }) => {
      expect(items.length).toBeGreaterThan(0);
    });
  });
});
