import { describe, expect, it } from "vitest";

import {
  advancePulses,
  clearLevelHistory,
  createLevelHistory,
  createPulse,
  levelHistoryPhase,
  nextPulseBoost,
  pointerRepulsion,
  pulseForce,
  pushLevel,
  roundedRectPoint,
  sampleLevelHistory,
  smoothLevel,
  stepSpring,
  waveAmplitude,
} from ".";

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

describe("소리 이력", () => {
  it("한 칸이 맡는 시간 안에서는 가장 큰 값을 남긴다", () => {
    const history = createLevelHistory(4, 100);
    pushLevel(history, 0.8, 0);
    pushLevel(history, 0.2, 30);
    expect(Array.from(history.values).map((v) => Number(v.toFixed(2)))).toEqual([0, 0, 0, 0.8]);
  });

  it("시간이 지나면 한 칸씩 왼쪽으로 밀리고 오른쪽 끝이 지금이다", () => {
    const history = createLevelHistory(4, 100);
    pushLevel(history, 0.8, 0);
    pushLevel(history, 0.3, 100);
    pushLevel(history, 0.5, 200);
    // 0~100ms 칸은 0.8, 100~200ms 칸은 0.5, 새로 시작한 지금 칸도 0.5에서 시작해요
    expect(Array.from(history.values).map((v) => Number(v.toFixed(2)))).toEqual([0, 0.8, 0.5, 0.5]);
  });

  it("오래 멈췄다 돌아오면 이력을 비우고 다시 시작한다", () => {
    const history = createLevelHistory(4, 100);
    pushLevel(history, 0.8, 0);
    pushLevel(history, 0.1, 5000);
    expect(Array.from(history.values).map((v) => Number(v.toFixed(2)))).toEqual([0, 0, 0, 0.1]);
  });

  it("비우면 평평해지고 다시 넣으면 그 시각부터 센다", () => {
    const history = createLevelHistory(4, 100);
    pushLevel(history, 0.8, 0);
    clearLevelHistory(history);
    expect(Array.from(history.values)).toEqual([0, 0, 0, 0]);
    expect(levelHistoryPhase(history, 50)).toBe(0);
    pushLevel(history, 0.4, 1000);
    expect(levelHistoryPhase(history, 1050)).toBe(0.5);
  });

  it("가로 위치의 크기는 칸 사이를 매끄럽게 잇고 흘러간 만큼 왼쪽으로 당겨 읽는다", () => {
    const history = createLevelHistory(3, 100);
    history.values.set([0, 1, 0]);
    expect(sampleLevelHistory({ history, position: 0.5, phase: 0 })).toBe(1);
    expect(sampleLevelHistory({ history, position: 0.25, phase: 0 })).toBe(0.5);
    expect(sampleLevelHistory({ history, position: 0, phase: 1 })).toBe(1);
    expect(sampleLevelHistory({ history, position: 1, phase: 0.7 })).toBe(0);
  });
});

describe("waveAmplitude", () => {
  it("배율이 0이어도 가장 낮은 높이 2.5는 남는다", () => {
    expect(waveAmplitude({ column: 10, columns: 96, frame: 0, maxAmplitude: 100, scale: 0 })).toBe(2.5);
  });

  it("양 끝 막대는 가운데 막대보다 낮다", () => {
    const edge = waveAmplitude({ column: 0, columns: 96, frame: 7, maxAmplitude: 100, scale: 1 });
    const middle = waveAmplitude({ column: 48, columns: 96, frame: 7, maxAmplitude: 100, scale: 1 });
    expect(edge).toBeLessThan(middle);
  });
});

describe("pointerRepulsion", () => {
  it("반지름 밖이면 힘이 없다", () => {
    expect(pointerRepulsion({ x: 200, y: 0, pointerX: 0, pointerY: 0 })).toEqual({ fx: 0, fy: 0 });
  });

  it("포인터 반대쪽으로 민다", () => {
    const { fx, fy } = pointerRepulsion({ x: 10, y: 0, pointerX: 0, pointerY: 0 });
    expect(fx).toBeGreaterThan(0);
    expect(fy).toBe(0);
  });
});

describe("파동", () => {
  it("1.5초 안에 다시 누르면 세지고 3.2배를 넘지 않는다", () => {
    expect(nextPulseBoost({ lastPulseAt: 0, boost: 1, now: 1000 })).toBeCloseTo(1.6);
    expect(nextPulseBoost({ lastPulseAt: 0, boost: 3, now: 1000 })).toBe(3.2);
    expect(nextPulseBoost({ lastPulseAt: 0, boost: 3, now: 2000 })).toBe(1);
  });

  it("무대 큰 변의 55%까지 퍼지고 다 퍼지면 지워진다", () => {
    const pulses = [createPulse({ x: 0, y: 0, width: 100, height: 40 })];
    expect(pulses[0].max).toBeCloseTo(55);
    advancePulses(pulses, 60);
    expect(pulses).toHaveLength(0);
  });

  it("파동 테두리 위의 입자만 밀린다", () => {
    const pulse = createPulse({ x: 0, y: 0, width: 400, height: 400 });
    pulse.radius = 100;
    expect(pulseForce({ x: 100, y: 0, pulse }).fx).toBeGreaterThan(0);
    expect(pulseForce({ x: 300, y: 0, pulse })).toEqual({ fx: 0, fy: 0 });
  });
});
