import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleBubbleTargets, samplePillTargets } from ".";

describe("sampleBubbleTargets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("캔버스를 못 쓰면 비어 있다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(sampleBubbleTargets({ text: "방금 뭐라고 하셨죠?", fontSize: 20, fontFamily: "sans-serif" })).toEqual({
      targets: [],
      width: 0,
      height: 0,
    });
  });

  it("글자 폭에 여백을 더한 말풍선 크기와 글자·윤곽 자리를 돌려준다", () => {
    const fake = {
      measureText: () => ({ width: 100 }),
      fillText: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(130 * 38 * 4).fill(255) }),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fake);

    const { targets, width, height } = sampleBubbleTargets({ text: "x", fontSize: 20, fontFamily: "sans-serif", step: 10 });

    expect(width).toBe(130);
    expect(height).toBe(38);
    expect(targets.some((t) => t.kind === "text")).toBe(true);
    expect(targets.some((t) => t.kind === "outline")).toBe(true);
    // 자리는 가운데가 원점이라 절반을 넘지 않아요(윤곽 흔들림만큼은 넘을 수 있어요)
    expect(Math.max(...targets.map((t) => Math.abs(t.x)))).toBeLessThan(width / 2 + 4);
  });
});

describe("samplePillTargets", () => {
  it("윤곽과 가운데 점 자리를 돌려준다", () => {
    const { targets } = samplePillTargets({ width: 26, height: 40, dotRadius: 4 });

    const dots = targets.filter((t) => t.kind === "text");
    expect(dots.length).toBeGreaterThan(0);
    expect(Math.max(...dots.map((t) => Math.hypot(t.x, t.y)))).toBeLessThanOrEqual(4);
    expect(targets.filter((t) => t.kind === "outline").length).toBeGreaterThan(dots.length);
  });
});
