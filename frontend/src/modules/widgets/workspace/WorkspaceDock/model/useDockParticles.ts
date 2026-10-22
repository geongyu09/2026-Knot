import { prefersReducedMotion, roundedRectPoint } from "@utils/particleMotion";
import { useCallback, useEffect, useRef, type RefObject } from "react";

/** 테두리에서 안쪽으로 들어갈 거리(px) */
const RIM_INSET = 4;

/** 누르거나 보낼 때만 잠깐 나타나는 입자 */
interface EventParticle {
  kind: "trace" | "burst";
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** trace: 둘레 위 위치와 속도, 벗어난 거리 */
  distance: number;
  speed: number;
  spread: number;
  size: number;
  alpha: number;
  bucket: number;
  life: number;
  maxLife: number;
}

interface UseDockParticlesParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 캔버스가 덮는 독. 크기와 모서리를 읽어요 */
  barRef: RefObject<HTMLElement | null>;
  /** 밝은 입자, 보통 입자, 실 머리 근처, 실 머리 순서의 색 */
  palette: [string, string, string, string];
}

/**
 * 독 위에 랜딩의 입자 반응을 그려요.
 *
 * 평소엔 아무것도 그리지 않아요. 옅은 입자를 늘 깔아 두면 장식인지 반응인지 애매해서, 누를 때만 확실하게 보여줘요.
 * `burst`는 누른 자리에서 입자가 터져 나와 가라앉고, `trace`는 랜딩 탐색 장면의 실처럼
 * 청록 머리가 달린 실 한 가닥이 테두리를 한 바퀴 돌고 흩어져요. 반응이 끝나면 그리기를 멈춰요.
 * 움직임 줄이기 설정에서는 반응이 생기지 않아요.
 */
export const useDockParticles = ({ canvasRef, barRef, palette }: UseDockParticlesParams) => {
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const eventsRef = useRef<EventParticle[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, radius: 30 });
  /** 멈춰 있던 그리기를 다시 돌려요. 반응이 생길 때 불러요 */
  const wakeRef = useRef<() => void>(() => {});
  /**
   * 독 크기를 지금 다시 재요. 평소엔 그리기가 멈춰 있어 크기가 마지막 반응 때 그대로라,
   * 독이 펼쳐진 뒤 반응을 일으키면 접혀 있던 크기로 테두리 자리를 계산해 실이 엉뚱한 곳에서 출발해요
   */
  const measureRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const bar = barRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !bar || !context) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let animation = 0;

    const resize = () => {
      const width = bar.clientWidth;
      const height = bar.clientHeight;
      const size = sizeRef.current;
      if (!width || !height || (width === size.width && height === size.height)) return;
      size.width = width;
      size.height = height;
      size.radius = parseFloat(getComputedStyle(bar).borderTopLeftRadius) || height / 2;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    };

    const pointOnRim = (distance: number) => {
      const { width, height, radius } = sizeRef.current;
      return roundedRectPoint({ width, height, radius, inset: RIM_INSET, distance });
    };

    const tick = () => {
      resize();
      const { width, height } = sizeRef.current;
      const colors = paletteRef.current;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const events = eventsRef.current;
      for (let i = events.length - 1; i >= 0; i--) {
        const particle = events[i];
        particle.life -= 1;
        if (particle.life <= 0) {
          events.splice(i, 1);
          continue;
        }
        const remaining = particle.life / particle.maxLife;
        if (particle.kind === "trace") {
          // 처음엔 빠르게 돌고 끝에 가서 느려져요
          particle.distance += particle.speed * (0.35 + 0.65 * remaining);
          const point = pointOnRim(particle.distance);
          particle.x += (point.x + point.nx * particle.spread - particle.x) * 0.3;
          particle.y += (point.y + point.ny * particle.spread - particle.y) * 0.3;
          context.globalAlpha = Math.min(1, remaining * 1.6) * particle.alpha;
        } else {
          particle.vx *= 0.9;
          particle.vy *= 0.9;
          particle.x += particle.vx;
          particle.y += particle.vy;
          context.globalAlpha = remaining * particle.alpha;
        }
        context.fillStyle = colors[particle.bucket];
        const dot = particle.size * (particle.bucket === 3 ? 1.6 : 1);
        context.fillRect(particle.x, particle.y, dot, dot);
      }
      context.globalAlpha = 1;
      // 반응이 다 끝나면 지운 채로 멈춰요
      animation = events.length ? requestAnimationFrame(tick) : 0;
    };

    resize();
    measureRef.current = resize;
    wakeRef.current = () => {
      if (!animation) animation = requestAnimationFrame(tick);
    };

    return () => {
      cancelAnimationFrame(animation);
      wakeRef.current = () => {};
      measureRef.current = () => {};
    };
  }, [barRef, canvasRef]);

  /** 독 안의 한 점에서 입자가 터져 나와요. 좌표는 독의 왼쪽 위 기준(px)이에요 */
  const burst = useCallback((x: number, y: number, count = 42) => {
    if (prefersReducedMotion()) return;
    measureRef.current();
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3;
      eventsRef.current.push({
        kind: "burst",
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6,
        distance: 0,
        speed: 0,
        spread: 0,
        size: 0.9 + Math.random() * 0.9,
        alpha: 0.4 + Math.random() * 0.5,
        bucket: Math.random() < 0.15 ? 2 : Math.random() < 0.5 ? 0 : 1,
        life: 36 + Math.random() * 20,
        maxLife: 56,
      });
    }
    wakeRef.current();
  }, []);

  /** 독 안의 한 점에서 가장 가까운 테두리에서 출발해 양쪽으로 갈라져 한 바퀴 도는 실 */
  const trace = useCallback((fromX: number, fromY: number, strength = 1) => {
    if (prefersReducedMotion()) return;
    measureRef.current();
    const { width, height, radius } = sizeRef.current;
    let nearest = 0;
    let nearestDistance = Infinity;
    for (let i = 0; i < 160; i++) {
      const point = roundedRectPoint({ width, height, radius, inset: RIM_INSET, distance: i / 160 });
      const distance = (point.x - fromX) ** 2 + (point.y - fromY) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i / 160;
      }
    }
    const count = Math.round(90 * strength);
    for (let i = 0; i < count; i++) {
      const direction = i % 2 ? 1 : -1;
      const lag = (i / count) * 0.06;
      const isHead = lag < 0.004;
      eventsRef.current.push({
        kind: "trace",
        x: fromX,
        y: fromY,
        vx: 0,
        vy: 0,
        distance: nearest - direction * lag,
        speed: direction * 0.0115 * (0.9 + Math.random() * 0.2),
        spread: (Math.random() - 0.5) * 4,
        size: 0.9 + Math.random() * 0.8,
        alpha: isHead ? 1 : 0.35 + Math.random() * 0.35,
        bucket: isHead ? 3 : lag < 0.015 ? 2 : Math.random() < 0.4 ? 0 : 1,
        life: 75 + Math.random() * 20,
        maxLife: 95,
      });
    }
    wakeRef.current();
  }, []);

  return { burst, trace };
};
