import { afterEach, describe, expect, it, vi } from "vitest";

import { sampleShapeTargets } from ".";

/** 왼쪽 위 2×2 픽셀만 칠해진 것처럼 답하는 가짜 캔버스 문맥 */
const createFakeContext = (side: number) =>
  ({
    scale: vi.fn(),
    getImageData: () => {
      const data = new Uint8ClampedArray(side * side * 4);
      [0, 1, side, side + 1].forEach((index) => {
        data[index * 4 + 3] = 255;
      });
      return { data };
    },
  }) as unknown as CanvasRenderingContext2D;

describe("sampleShapeTargets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("캔버스를 못 쓰면 빈 배열이다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    expect(sampleShapeTargets({ draw: () => {}, size: 24 })).toEqual([]);
  });

  it("칠해진 픽셀의 위치를 모양 가운데 기준으로 돌려준다", () => {
    const size = 24;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(createFakeContext(size * 3));
    const draw = vi.fn();

    const targets = sampleShapeTargets({ draw, size, step: 1 / 3 });

    expect(draw).toHaveBeenCalled();
    expect(targets).toEqual([
      { x: -12, y: -12 },
      { x: -12 + 1 / 3, y: -12 },
      { x: -12, y: -12 + 1 / 3 },
      { x: -12 + 1 / 3, y: -12 + 1 / 3 },
    ]);
  });
});
