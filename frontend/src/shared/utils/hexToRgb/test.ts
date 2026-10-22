import { describe, expect, it } from "vitest";

import { hexToRgb } from ".";

describe("hexToRgb", () => {
  it("여섯 자리 색상 토큰을 r,g,b 꼴로 바꾼다", () => {
    expect(hexToRgb("#3C3B39")).toBe("60,59,57");
    expect(hexToRgb("#FFFFFF")).toBe("255,255,255");
  });
});
