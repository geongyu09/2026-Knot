import type { ParticleTarget, StageRect, StageSize } from "../types/particle";

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** 같은 번호에는 늘 같은 값을 주는 0~1 난수. 새로 그려도 연결망 모양이 바뀌지 않게 써요. */
export const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** 가운데에 몰린 -1~1 난수. 입자를 선 둘레에 자연스럽게 퍼뜨릴 때 써요. */
export const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export const shuffle = <T,>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

interface FitTargetsParams {
  targets: ParticleTarget[];
  size: StageSize;
}

/**
 * 모양에서 뽑은 자리 수를 입자 수에 맞춰요.
 *
 * 모자라면 있는 자리 둘레에 살짝 흩어 채우고, 남으면 고르게 골라 버립니다.
 */
export const fitTargets = ({ targets, size }: FitTargetsParams) => {
  const { count, width, height } = size;
  const length = targets.length;
  const fitted: ParticleTarget[] = new Array(count);

  if (!length) {
    for (let i = 0; i < count; i++) {
      fitted[i] = { x: Math.random() * width, y: Math.random() * height, kind: 6, phase: 0 };
    }
    return fitted;
  }

  if (length >= count) {
    for (let i = 0; i < count; i++) fitted[i] = targets[Math.floor((i * length) / count)];
    return fitted;
  }

  for (let i = 0; i < count; i++) {
    const base = targets[i % length];
    if (i < length) {
      fitted[i] = base;
      continue;
    }
    const copy = { ...base, x: base.x + gaussian() * 1.2, y: base.y + gaussian() * 1.2 };
    if (copy.baseX !== undefined) {
      copy.baseX = copy.x;
      copy.baseY = copy.y;
    }
    fitted[i] = copy;
  }
  return fitted;
};

interface RoundedRectPointParams {
  rect: StageRect;
  radius: number;
  /** 윗변 왼쪽 모서리 끝에서 시계 방향으로 잰 거리 */
  distance: number;
}

/** 둥근 사각형의 둘레 위 한 점과 그 점에서 바깥을 향하는 방향을 구해요. */
export const roundedRectPoint = ({ rect, radius, distance }: RoundedRectPointParams) => {
  const { x, y, w, h } = rect;
  const straightX = w - 2 * radius;
  const straightY = h - 2 * radius;
  const arc = (Math.PI * radius) / 2;
  const segments = [straightX, arc, straightY, arc, straightX, arc, straightY, arc];

  let index = 0;
  let rest = distance;
  while (index < 7 && rest > segments[index]) {
    rest -= segments[index];
    index++;
  }
  const t = segments[index] > 0 ? Math.min(1, rest / segments[index]) : 0;

  if (index === 0) return { x: x + radius + straightX * t, y, nx: 0, ny: -1 };
  if (index === 2) return { x: x + w, y: y + radius + straightY * t, nx: 1, ny: 0 };
  if (index === 4) return { x: x + w - radius - straightX * t, y: y + h, nx: 0, ny: 1 };
  if (index === 6) return { x, y: y + h - radius - straightY * t, nx: -1, ny: 0 };

  const corners: Record<number, [number, number, number]> = {
    1: [x + w - radius, y + radius, -Math.PI / 2],
    3: [x + w - radius, y + h - radius, 0],
    5: [x + radius, y + h - radius, Math.PI / 2],
    7: [x + radius, y + radius, Math.PI],
  };
  const [cx, cy, start] = corners[index];
  const angle = start + (t * Math.PI) / 2;
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, nx: Math.cos(angle), ny: Math.sin(angle) };
};

type Point = { x: number; y: number };

/** 3차 베지어 곡선 위의 점 */
export const bezierPoint = (points: Point[], s: number) => {
  const u = 1 - s;
  return {
    x: u * u * u * points[0].x + 3 * u * u * s * points[1].x + 3 * u * s * s * points[2].x + s * s * s * points[3].x,
    y: u * u * u * points[0].y + 3 * u * u * s * points[1].y + 3 * u * s * s * points[2].y + s * s * s * points[3].y,
  };
};

/** 무대 왼쪽 위를 원점으로 한 요소의 위치와 크기 */
export const rectInStage = (stage: HTMLElement, element: Element): StageRect => {
  const stageRect = stage.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { x: rect.left - stageRect.left, y: rect.top - stageRect.top, w: rect.width, h: rect.height };
};
