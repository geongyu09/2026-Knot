import { prefersReducedMotion, roundedRectPoint } from "@utils/particleMotion";
import { useCallback, useEffect, useRef, type RefObject } from "react";

/** 테두리를 따라 늘 흐르는 입자 수와 안쪽에 아주 옅게 떠 있는 입자 수 */
const RIM_COUNT = 120;
const INNER_COUNT = 28;
/** 테두리에서 안쪽으로 들어갈 거리(px) */
const RIM_INSET = 4;

interface RimParticle {
  /** 둘레 위 위치(0~1)와 매 프레임 움직이는 거리 */
  distance: number;
  speed: number;
  /** 둘레에서 바깥쪽으로 벗어난 거리(px) */
  spread: number;
  size: number;
  alpha: number;
  x: number;
  y: number;
  bucket: number;
}

interface InnerParticle {
  ratioX: number;
  ratioY: number;
  seed: number;
  size: number;
  alpha: number;
  x: number;
  y: number;
}

/** 누르거나 펼칠 때만 잠깐 나타나는 입자 */
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
 * 평소엔 테두리를 따라 아주 옅은 입자 실이 천천히 흐르고 안쪽에 먼지 몇 알이 떠 있을 뿐이에요.
 * `burst`는 누른 자리에서 입자가 터져 나와 가라앉고, `trace`는 랜딩 탐색 장면의 실처럼
 * 청록 머리가 달린 실 한 가닥이 테두리를 한 바퀴 돌고 흩어져요. 독이 늘고 줄면 입자가 새 테두리로 옮겨 가요.
 * 움직임 줄이기 설정에서는 실이 멈추고 반응도 생기지 않아요.
 */
export const useDockParticles = ({ canvasRef, barRef, palette }: UseDockParticlesParams) => {
  const paletteRef = useRef(palette);
  paletteRef.current = palette;
  const eventsRef = useRef<EventParticle[]>([]);
  const sizeRef = useRef({ width: 0, height: 0, radius: 30 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const bar = barRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !bar || !context) return;

    const reduced = prefersReducedMotion();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const rim: RimParticle[] = Array.from({ length: RIM_COUNT }, (_, i) => ({
      distance: i / RIM_COUNT + Math.random() * 0.01,
      speed: 0.00018 * (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6),
      spread: (Math.random() - 0.5) * 4,
      size: 0.8 + Math.random() * 0.7,
      alpha: 0.18 + Math.random() * 0.2,
      x: 0,
      y: 0,
      bucket: Math.random() < 0.3 ? 0 : 1,
    }));
    const inner: InnerParticle[] = Array.from({ length: INNER_COUNT }, () => ({
      ratioX: Math.random(),
      ratioY: Math.random(),
      seed: Math.random(),
      size: 0.8 + Math.random() * 0.5,
      alpha: 0.07 + Math.random() * 0.07,
      x: 0,
      y: 0,
    }));
    let frame = 0;
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

    let isOddFrame = false;
    const tick = () => {
      // 실만 흐를 때는 30fps로 충분해요. 터짐·실 지나감이 있을 때만 60fps예요
      isOddFrame = !isOddFrame;
      if (eventsRef.current.length === 0 && isOddFrame) {
        animation = requestAnimationFrame(tick);
        return;
      }
      frame++;
      resize();
      const { width, height } = sizeRef.current;
      const colors = paletteRef.current;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      inner.forEach((particle) => {
        const homeX = 12 + particle.ratioX * (width - 24) + (reduced ? 0 : Math.cos(frame * 0.006 + particle.seed * 6.28) * 6);
        const homeY = 8 + particle.ratioY * (height - 16) + (reduced ? 0 : Math.sin(frame * 0.008 + particle.seed * 6.28) * 4);
        particle.x += (homeX - particle.x) * 0.1;
        particle.y += (homeY - particle.y) * 0.1;
        context.globalAlpha = particle.alpha;
        context.fillStyle = colors[1];
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      });

      rim.forEach((particle) => {
        if (!reduced) particle.distance += particle.speed;
        const point = pointOnRim(particle.distance);
        particle.x += (point.x + point.nx * particle.spread - particle.x) * 0.12;
        particle.y += (point.y + point.ny * particle.spread - particle.y) * 0.12;
        context.globalAlpha = particle.alpha;
        context.fillStyle = colors[particle.bucket];
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      });

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
      animation = requestAnimationFrame(tick);
    };

    resize();
    animation = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animation);
  }, [barRef, canvasRef]);

  /** 독 안의 한 점에서 입자가 터져 나와요. 좌표는 독의 왼쪽 위 기준(px)이에요 */
  const burst = useCallback((x: number, y: number, count = 42) => {
    if (prefersReducedMotion()) return;
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
  }, []);

  /** 독 안의 한 점에서 가장 가까운 테두리에서 출발해 양쪽으로 갈라져 한 바퀴 도는 실 */
  const trace = useCallback((fromX: number, fromY: number, strength = 1) => {
    if (prefersReducedMotion()) return;
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
  }, []);

  return { burst, trace };
};
