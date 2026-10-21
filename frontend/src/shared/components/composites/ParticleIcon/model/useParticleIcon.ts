import { prefersReducedMotion } from "@utils/particleMotion";
import { sampleShapeTargets } from "@utils/sampleShapeTargets";
import { useCallback, useEffect, useRef, type RefObject } from "react";

interface IconParticle {
  targetX: number;
  targetY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 위에서 떨어지는 중인지. 자리 근처에 닿으면 스프링으로 바뀌어요 */
  isFalling: boolean;
  /** 이 프레임부터 움직여요. 입자마다 조금씩 늦게 출발해요 */
  startFrame: number;
  size: number;
  shade: number;
}

type Mode = "idle" | "gather" | "settle";

interface UseParticleIconParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 진짜 아이콘. 입자가 모이는 동안 숨겼다가 자리를 잡으면 보여 줘요 */
  iconRef: RefObject<HTMLElement | null>;
  draw: (context: CanvasRenderingContext2D) => void;
  size: number;
  /** 진한 입자, 보통 입자 색 */
  palette: [string, string];
}

/** 자리에 닿지 않은 입자가 이 비율보다 적으면 다 모였다고 봐요 */
const SETTLED_RATIO = 0.05;
/** 다 모인 뒤 진짜 아이콘으로 바뀌는 동안 입자가 사라지는 프레임 수 */
const SETTLE_FRAMES = 10;

/**
 * 아이콘 자리에 캔버스를 덮고, 입자가 아이콘 모양으로 모이면 진짜 아이콘을 보여 줘요.
 *
 * 랜딩이 입자로 글자를 만든 뒤 진짜 글자로 바꾸는 방식과 같아요. 평소엔 아무것도 그리지 않아
 * 아이콘이 그대로 보이고, `assemble`이나 `wake`를 부를 때만 잠깐 움직여요.
 * 움직임 줄이기 설정이나 캔버스를 못 쓰는 환경에서는 바로 진짜 아이콘만 보여요.
 */
export const useParticleIcon = ({ canvasRef, iconRef, draw, size, palette }: UseParticleIconParams) => {
  const paramsRef = useRef({ draw, size, palette });
  paramsRef.current = { draw, size, palette };
  const startRef = useRef<(fromScatter: boolean) => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const reduced = prefersReducedMotion();
    if (!canvas || !context || reduced) {
      startRef.current = () => {};
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    let particles: IconParticle[] = [];
    let mode: Mode = "idle";
    let frame = 0;
    let settledAt = 0;
    let animation = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    };

    const showIcon = (isVisible: boolean) => {
      const icon = iconRef.current;
      if (icon) icon.style.opacity = isVisible ? "" : "0";
    };

    const tick = () => {
      frame++;
      resize();
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      let moving = 0;

      particles.forEach((particle) => {
        if (mode === "gather") {
          if (frame < particle.startFrame) {
            moving++;
            return;
          }
          if (particle.isFalling) {
            // 랜딩의 fall처럼 중력으로 떨어지다 자리 근처에서 멈춰요
            particle.vy += 0.5;
            particle.x += (particle.targetX - particle.x) * 0.08;
            particle.y += particle.vy;
            if (particle.y >= particle.targetY - 1.5) {
              particle.isFalling = false;
              particle.vy *= 0.1;
            }
          } else {
            particle.vx = (particle.vx + (particle.targetX - particle.x) * 0.12) * 0.78;
            particle.vy = (particle.vy + (particle.targetY - particle.y) * 0.12) * 0.78;
            particle.x += particle.vx;
            particle.y += particle.vy;
          }
          if (particle.isFalling || Math.abs(particle.targetX - particle.x) + Math.abs(particle.targetY - particle.y) > 0.9) moving++;
          context.globalAlpha = 1;
        } else {
          context.globalAlpha = Math.max(0, 1 - (frame - settledAt) / SETTLE_FRAMES);
        }
        context.fillStyle = paramsRef.current.palette[particle.shade];
        context.fillRect(particle.x, particle.y, particle.size, particle.size);
      });
      context.globalAlpha = 1;

      if (mode === "gather" && particles.length && moving < particles.length * SETTLED_RATIO) {
        mode = "settle";
        settledAt = frame;
        showIcon(true);
      }
      if (mode === "settle" && frame - settledAt > SETTLE_FRAMES) {
        mode = "idle";
        particles = [];
        context.clearRect(0, 0, width, height);
      }
      if (mode !== "idle") animation = requestAnimationFrame(tick);
      else animation = 0;
    };

    startRef.current = (fromScatter: boolean) => {
      if (fromScatter && mode !== "idle") return;
      resize();
      const targets = sampleShapeTargets({ draw: paramsRef.current.draw, size: paramsRef.current.size, step: 1.5 });
      if (!targets.length) return;
      particles = targets.map((target, index) => {
        const targetX = width / 2 + target.x;
        const targetY = height / 2 + target.y;
        const shade = index % 5 === 0 ? 1 : 0;
        const particleSize = 0.9 + Math.random() * 0.7;
        return fromScatter
          ? { targetX, targetY, x: targetX + (Math.random() - 0.5) * 18, y: targetY + (Math.random() - 0.5) * 18, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, isFalling: false, startFrame: 0, size: particleSize, shade }
          : { targetX, targetY, x: targetX + (Math.random() - 0.5) * 14, y: -4 - Math.random() * 26, vx: 0, vy: 0.5 + Math.random() * 1.5, isFalling: true, startFrame: frame + Math.floor(Math.random() * 8), size: particleSize, shade };
      });
      showIcon(false);
      mode = "gather";
      if (!animation) animation = requestAnimationFrame(tick);
    };

    return () => {
      cancelAnimationFrame(animation);
      showIcon(true);
    };
  }, [canvasRef, iconRef]);

  const assemble = useCallback(() => startRef.current(false), []);
  const wake = useCallback(() => startRef.current(true), []);

  return { assemble, wake };
};
