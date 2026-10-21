import { prefersReducedMotion, stepSpring } from "@utils/particleMotion";
import { useEffect, useRef, type RefObject } from "react";

import { WAVEFORM_DAMPING, WAVEFORM_PARTICLES_PER_PX, WAVEFORM_SPRING } from "../constants/particleWaveform";

interface WaveParticle {
  /** 막대 안의 가로 위치(0~1)와 세로 위치(-1~1). 세로는 소리가 클수록 더 멀리 나가요 */
  columnOffset: number;
  level: number;
  /** 어느 막대 사이(0~1)에 있는지. 막대가 왼쪽으로 흐르는 동안 자리를 보간해요 */
  position: number;
  seed: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface UseParticleWaveformParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 막대마다 소리 크기(0~1). 오른쪽이 가장 새 소리예요 */
  levels: number[];
  /** 끝의 이만큼은 아직 소리가 들어오지 않은 자리라 가장 낮게 둬요 */
  pendingCount: number;
  isActive: boolean;
  /** 막대 최소·최대 높이(px) */
  minHeight: number;
  maxHeight: number;
  /** 진한 입자, 보통 입자, 옅은 입자, 일시정지 입자 순서의 색 */
  palette: [string, string, string, string];
}

/**
 * 소리 크기 목록을 랜딩 녹음 장면 같은 입자 파형으로 그려요.
 *
 * 막대마다 입자가 세로로 퍼져 있고, 소리가 클수록 높이 퍼져요. 새 소리가 오른쪽에 들어오면
 * 입자가 한 칸씩 왼쪽으로 스프링처럼 흘러가요. 일시정지면 흐름을 멈추고 옅은 색으로 그려요.
 * 움직임 줄이기 설정에서는 흔들림 없이 자리만 따라가요.
 */
export const useParticleWaveform = ({
  canvasRef,
  levels,
  pendingCount,
  isActive,
  minHeight,
  maxHeight,
  palette,
}: UseParticleWaveformParams) => {
  const paramsRef = useRef({ levels, pendingCount, isActive, minHeight, maxHeight, palette });
  paramsRef.current = { levels, pendingCount, isActive, minHeight, maxHeight, palette };

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduced = prefersReducedMotion();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const particles: WaveParticle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let animation = 0;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      const count = Math.round(width * WAVEFORM_PARTICLES_PER_PX);
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        const level = Math.random() * 2 - 1;
        particles.push({
          columnOffset: Math.random(),
          level,
          position: i / count,
          seed: Math.random(),
          size: 0.9 + Math.random() * 0.8,
          x: width * (i / count),
          y: height / 2 + level * (minHeight / 2),
          vx: 0,
          vy: 0,
        });
      }
    };

    const tick = () => {
      frame++;
      resize();
      const { levels: nextLevels, pendingCount: pending, isActive: active, minHeight: min, maxHeight: max, palette: colors } =
        paramsRef.current;
      const columnCount = nextLevels.length + pending;
      const columnWidth = width / columnCount;
      const centerY = height / 2;

      const buckets: WaveParticle[][] = [[], [], [], []];
      particles.forEach((particle) => {
        const column = Math.min(columnCount - 1, Math.floor(particle.position * columnCount));
        const level = column < nextLevels.length ? nextLevels[column] : 0;
        // 막대 높이는 소리 크기를 따르고, 입자는 그 높이 안에 가운데가 빽빽하게 퍼져요
        const barHeight = min + level * (max - min);
        const wobble = reduced || !active ? 0 : Math.sin(frame * 0.08 + particle.seed * 6.28) * 0.6;
        const homeX = (column + particle.columnOffset) * columnWidth;
        const homeY = centerY + particle.level * (barHeight / 2) + wobble;
        stepSpring({
          particle,
          homeX,
          homeY,
          spring: reduced ? 0.3 : WAVEFORM_SPRING,
          damping: WAVEFORM_DAMPING,
          jitter: reduced || !active ? 0 : 0.14,
        });
        const strength = Math.abs(particle.level);
        const bucket = !active || column >= nextLevels.length ? 3 : strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2;
        buckets[bucket].push(particle);
      });

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      buckets.forEach((bucket, index) => {
        context.fillStyle = colors[index];
        bucket.forEach((particle) => context.fillRect(particle.x, particle.y, particle.size, particle.size));
      });
      animation = requestAnimationFrame(tick);
    };

    resize();
    animation = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animation);
  }, [canvasRef]);
};
