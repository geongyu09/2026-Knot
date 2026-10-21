import { describe, expect, it } from "vitest";

import { roundedRectPoint, smoothLevel, stepSpring } from ".";

describe("stepSpring", () => {
  it("자리에서 떨어진 입자를 자리 쪽으로 움직인다", () => {
    const particle = { x: 0, y: 0, vx: 0, vy: 0 };

    stepSpring({ particle, homeX: 10, homeY: 0, spring: 0.1, damping: 1, jitter: 0 });

    expect(particle.x).toBeCloseTo(1);
    expect(particle.y).toBe(0);
  });

  it("감쇠가 속도를 줄인다", () => {
    const particle = { x: 0, y: 0, vx: 10, vy: 0 };

    stepSpring({ particle, homeX: 0, homeY: 0, spring: 0, damping: 0.5, jitter: 0 });

    expect(particle.vx).toBe(5);
    expect(particle.x).toBe(5);
  });
});

describe("roundedRectPoint", () => {
  const rect = { width: 100, height: 40, radius: 20 };

  it("0은 윗변의 왼쪽 끝이고 바깥은 위쪽이다", () => {
    expect(roundedRectPoint({ ...rect, distance: 0 })).toEqual({ x: 20, y: 0, nx: 0, ny: -1 });
  });

  it("절반은 아랫변의 오른쪽 끝이고 바깥은 아래쪽이다", () => {
    const point = roundedRectPoint({ ...rect, distance: 0.5 });

    expect(point.x).toBeCloseTo(80);
    expect(point.y).toBeCloseTo(40);
    expect(point.ny).toBe(1);
  });

  it("범위를 벗어난 거리는 한 바퀴를 돌아 같은 자리다", () => {
    expect(roundedRectPoint({ ...rect, distance: 1.25 })).toEqual(roundedRectPoint({ ...rect, distance: 0.25 }));
  });

  it("안쪽으로 들어가면 둘레가 그만큼 작아진다", () => {
    const point = roundedRectPoint({ ...rect, inset: 5, distance: 0 });

    expect(point.y).toBe(5);
    expect(point.x).toBe(20);
  });
});

describe("smoothLevel", () => {
  it("커질 때는 attack, 작아질 때는 release 비율로 따라간다", () => {
    expect(smoothLevel({ previous: 0, next: 1, attack: 0.5, release: 0.1 })).toBe(0.5);
    expect(smoothLevel({ previous: 1, next: 0, attack: 0.5, release: 0.1 })).toBe(0.9);
  });
});
