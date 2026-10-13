import { describe, expect, it } from "vitest";

import { sumDocumentCounts } from "./sumDocumentCounts";

describe("sumDocumentCounts", () => {
  it("주제별 문서 수를 모두 더한다", () => {
    expect(
      sumDocumentCounts([{ documentCount: 3 }, { documentCount: 4 }]),
    ).toBe(7);
  });

  it("주제가 하나면 그 주제의 문서 수다", () => {
    expect(sumDocumentCounts([{ documentCount: 2 }])).toBe(2);
  });

  it("주제가 없으면 0이다", () => {
    expect(sumDocumentCounts([])).toBe(0);
  });
});
