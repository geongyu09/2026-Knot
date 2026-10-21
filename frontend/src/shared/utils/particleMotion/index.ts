/**
 * 입자 애니메이션에서 함께 쓰는 작은 계산.
 *
 * 랜딩의 입자 엔진과 같은 규칙(스프링 복귀, 감쇠, 둥근 사각형 둘레)을 작은 캔버스에서도 쓰려고 모았어요.
 */

export interface SpringParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface StepSpringParams {
  particle: SpringParticle;
  /** 돌아갈 자리 */
  homeX: number;
  homeY: number;
  /** 자리로 당기는 힘(0~1). 랜딩은 0.05~0.09를 써요 */
  spring: number;
  /** 속도가 남는 비율(0~1). 랜딩은 0.84예요 */
  damping: number;
  /** 매 프레임 더하는 흔들림의 크기 */
  jitter: number;
  /** 밀어내기·파동처럼 바깥에서 더하는 힘 */
  forceX?: number;
  forceY?: number;
}

/** 입자를 제자리로 당기며 한 프레임 움직여요. 입자를 직접 바꿔요. */
export const stepSpring = ({
  particle,
  homeX,
  homeY,
  spring,
  damping,
  jitter,
  forceX = 0,
  forceY = 0,
}: StepSpringParams) => {
  const ax = (homeX - particle.x) * spring + (Math.random() - 0.5) * jitter + forceX;
  const ay = (homeY - particle.y) * spring + (Math.random() - 0.5) * jitter + forceY;
  particle.vx = (particle.vx + ax) * damping;
  particle.vy = (particle.vy + ay) * damping;
  particle.x += particle.vx;
  particle.y += particle.vy;
};

interface RoundedRectPointParams {
  width: number;
  height: number;
  /** 모서리 반지름. 높이의 절반보다 크면 알약 모양으로 잘라요 */
  radius: number;
  /** 둘레에서 안쪽으로 들어갈 거리 */
  inset?: number;
  /** 윗변 왼쪽 모서리 끝에서 시계 방향으로 잰 둘레 비율(0~1). 범위를 벗어나면 한 바퀴를 돌아요 */
  distance: number;
}

/** 둥근 사각형 둘레 위의 한 점과 바깥을 향하는 방향. 랜딩의 `roundedRectPoint`와 같은 계산이에요. */
export const roundedRectPoint = ({
  width,
  height,
  radius,
  inset = 0,
  distance,
}: RoundedRectPointParams) => {
  const x = inset;
  const y = inset;
  const w = Math.max(0, width - inset * 2);
  const h = Math.max(0, height - inset * 2);
  const r = Math.max(0, Math.min(radius - inset, h / 2, w / 2));
  const straightX = w - 2 * r;
  const straightY = h - 2 * r;
  const arc = (Math.PI * r) / 2;
  const segments = [straightX, arc, straightY, arc, straightX, arc, straightY, arc];
  const total = segments.reduce((sum, segment) => sum + segment, 0);

  let rest = (((distance % 1) + 1) % 1) * total;
  let index = 0;
  while (index < 7 && rest > segments[index]) {
    rest -= segments[index];
    index++;
  }
  const t = segments[index] > 0 ? Math.min(1, rest / segments[index]) : 0;

  if (index === 0) return { x: x + r + straightX * t, y, nx: 0, ny: -1 };
  if (index === 2) return { x: x + w, y: y + r + straightY * t, nx: 1, ny: 0 };
  if (index === 4) return { x: x + w - r - straightX * t, y: y + h, nx: 0, ny: 1 };
  if (index === 6) return { x, y: y + h - r - straightY * t, nx: -1, ny: 0 };

  const corners: Record<number, [number, number, number]> = {
    1: [x + w - r, y + r, -Math.PI / 2],
    3: [x + w - r, y + h - r, 0],
    5: [x + r, y + h - r, Math.PI / 2],
    7: [x + r, y + r, Math.PI],
  };
  const [cx, cy, start] = corners[index];
  const angle = start + (t * Math.PI) / 2;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, nx: Math.cos(angle), ny: Math.sin(angle) };
};

interface SmoothLevelParams {
  previous: number;
  next: number;
  /** 커질 때 따라가는 비율(0~1). 목소리가 들어오면 바로 반응하게 크게 둬요 */
  attack: number;
  /** 작아질 때 따라가는 비율(0~1). 소리가 끊겨도 천천히 가라앉게 작게 둬요 */
  release: number;
}

/** 소리 크기를 빠르게 따라가고 천천히 가라앉게 다듬어요. */
export const smoothLevel = ({ previous, next, attack, release }: SmoothLevelParams) =>
  previous + (next - previous) * (next > previous ? attack : release);

/** 움직임 줄이기 설정을 켰는지. 캔버스 애니메이션은 CSS 미디어 쿼리를 못 쓰므로 직접 읽어요. */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
