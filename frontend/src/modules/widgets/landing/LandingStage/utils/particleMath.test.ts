import { describe, expect, it } from "vitest";

import { fitTargets, roundedRectPoint } from "./particleMath";

const size = { width: 800, height: 600, isMobile: false, count: 10 };

describe("fitTargets", () => {
  it("자리가 입자보다 적으면 있는 자리를 돌려 써서 입자 수만큼 채운다", () => {
    const targets = fitTargets({
      targets: [
        { x: 10, y: 10, kind: 3, phase: 0 },
        { x: 20, y: 20, kind: 3, phase: 0 },
      ],
      size,
    });

    expect(targets).toHaveLength(10);
    expect(targets[0]).toEqual({ x: 10, y: 10, kind: 3, phase: 0 });
  });

  it("자리가 입자보다 많으면 고르게 골라 입자 수만큼 남긴다", () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, kind: 3, phase: 0 }));

    const targets = fitTargets({ targets: many, size });

    expect(targets).toHaveLength(10);
    expect(targets.map((target) => target.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("자리가 하나도 없으면 무대 안에 흩어 둔다", () => {
    const targets = fitTargets({ targets: [], size });

    expect(targets).toHaveLength(10);
    targets.forEach((target) => {
      expect(target.x).toBeGreaterThanOrEqual(0);
      expect(target.x).toBeLessThanOrEqual(800);
    });
  });
});

describe("roundedRectPoint", () => {
  it("둘레의 시작점은 윗변의 왼쪽 모서리가 끝나는 곳이다", () => {
    const point = roundedRectPoint({ rect: { x: 0, y: 0, w: 100, h: 50 }, radius: 10, distance: 0 });

    expect(point).toEqual({ x: 10, y: 0, nx: 0, ny: -1 });
  });

  it("윗변 길이만큼 가면 윗변의 오른쪽 끝에 닿는다", () => {
    const point = roundedRectPoint({ rect: { x: 0, y: 0, w: 100, h: 50 }, radius: 10, distance: 80 });

    expect(point.x).toBeCloseTo(90);
    expect(point.y).toBe(0);
  });
});

