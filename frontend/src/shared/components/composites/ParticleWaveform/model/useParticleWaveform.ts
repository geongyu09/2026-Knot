import { measureAnalyserLevel } from "@utils/measureAudioLevel";
import {
  advancePulses,
  clearLevelHistory,
  createLevelHistory,
  createPulse,
  levelHistoryPhase,
  nextPulseBoost,
  pointerRepulsion,
  prefersReducedMotion,
  pulseForce,
  pushLevel,
  sampleLevelHistory,
  smoothLevel,
  stepSpring,
  type PulseWave,
} from "@utils/particleMotion";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  WAVEFORM_AMPLITUDE_RATIO,
  WAVEFORM_COLUMNS,
  WAVEFORM_FLAT_AMPLITUDE,
  WAVEFORM_INTERVAL_MS,
  WAVEFORM_PARTICLE_RANGE,
  WAVEFORM_PARTICLES_PER_AREA,
  WAVEFORM_POINTER_RADIUS,
} from "../constants/particleWaveform";

interface WaveParticle {
  /** 가로 위치(0~1). 0이 왼쪽, 1이 오른쪽 끝(지금)이에요 */
  position: number;
  /** 세로 위치(-1~1). 가운데에 몰려 있어 파형 가운데가 빽빽하고 끝이 성겨요 */
  level: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface UseParticleWaveformParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  analyser: AnalyserNode | null;
  isActive: boolean;
  /** 진한, 보통, 옅은 잉크와 일시정지 색 */
  palette: [string, string, string, string];
}

/**
 * 소리 크기의 흐름을 입자 파형으로 캔버스에 매 프레임 그려요.
 *
 * 오른쪽 끝이 지금 소리이고 시간이 지나면 왼쪽으로 흘러가요. 조용하면 가운데에 가는 선만 남고,
 * 말하면 그 순간의 자리만 소리만큼 커져요. 입자는 가운데가 빽빽하고 세로 위치에 따라 잉크 세 단계로 그려요.
 * 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요.
 * 일시정지면 이력을 비워 옅은 색의 평평한 선으로 멈춰 있고, 이어서 녹음하면 오른쪽부터 다시 채워져요.
 * 움직임 줄이기 설정에서는 흔들림 없이 소리만 따라요.
 */
export const useParticleWaveform = ({ canvasRef, analyser, isActive, palette }: UseParticleWaveformParams) => {
  const paramsRef = useRef({ analyser, isActive, palette });
  paramsRef.current = { analyser, isActive, palette };
  const pointerRef = useRef({ x: -9999, y: -9999 });
  const pulsesRef = useRef<PulseWave[]>([]);
  const pulseBoostRef = useRef({ at: 0, boost: 1 });

  const setPointer = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y };
  }, []);
  const clearPointer = useCallback(() => {
    pointerRef.current = { x: -9999, y: -9999 };
  }, []);
  const pulse = useCallback((x: number, y: number, width: number, height: number) => {
    const now = Date.now();
    const boost = pulseBoostRef.current;
    boost.boost = nextPulseBoost({ lastPulseAt: boost.at, boost: boost.boost, now });
    boost.at = now;
    pulsesRef.current.push(createPulse({ x, y, width, height, boost: boost.boost }));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduced = prefersReducedMotion();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    const history = createLevelHistory(WAVEFORM_COLUMNS, WAVEFORM_INTERVAL_MS);
    const particles: WaveParticle[] = [];
    let width = 0;
    let height = 0;
    let level = 0;
    let animation = 0;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const count = Math.round(
        Math.min(WAVEFORM_PARTICLE_RANGE.max, Math.max(WAVEFORM_PARTICLE_RANGE.min, width * height * WAVEFORM_PARTICLES_PER_AREA)),
      );
      particles.length = 0;
      for (let i = 0; i < count; i++) {
        particles.push({
          position: Math.random(),
          level: Math.random() + Math.random() - 1,
          size: 0.9 + Math.random() * 0.9,
          x: Math.random() * width,
          y: height / 2 + (Math.random() - 0.5) * height * 0.2,
          vx: 0,
          vy: 0,
        });
      }
    };

    const tick = (now: number) => {
      resize();
      const { analyser: node, isActive: active, palette: colors } = paramsRef.current;
      // 일시정지거나 소리를 읽을 수 없으면 이력을 비워 평평한 선이에요. 소리는 빠르게 따라가고 조금 천천히 가라앉아요
      if (node && active) {
        level = smoothLevel({ previous: level, next: measureAnalyserLevel(node), attack: 0.6, release: 0.3 });
        pushLevel(history, level, now);
      } else {
        level = 0;
        clearLevelHistory(history);
      }
      const phase = levelHistoryPhase(history, now);
      const maxAmplitude = height * WAVEFORM_AMPLITUDE_RATIO;

      const pulses = pulsesRef.current;
      advancePulses(pulses);
      const pointer = pointerRef.current;
      const hasPointer = pointer.x > -1000;
      const centerY = height / 2;
      const buckets: WaveParticle[][] = [[], [], [], []];

      particles.forEach((particle) => {
        // 그 자리 시각의 소리만큼 퍼져요. 조용하면 가는 선, 말한 순간만 커져 왼쪽으로 흘러가요
        const amplitude =
          WAVEFORM_FLAT_AMPLITUDE + maxAmplitude * sampleLevelHistory({ history, position: particle.position, phase });
        const homeX = particle.position * width;
        const homeY = centerY + particle.level * amplitude;
        let forceX = 0;
        let forceY = 0;
        if (hasPointer) {
          const repulsion = pointerRepulsion({
            x: particle.x,
            y: particle.y,
            pointerX: pointer.x,
            pointerY: pointer.y,
            radius: WAVEFORM_POINTER_RADIUS,
          });
          forceX += repulsion.fx;
          forceY += repulsion.fy;
        }
        for (const wave of pulses) {
          const force = pulseForce({ x: particle.x, y: particle.y, pulse: wave });
          forceX += force.fx;
          forceY += force.fy;
        }
        stepSpring({
          particle,
          homeX,
          homeY,
          spring: reduced ? 0.3 : 0.12,
          damping: 0.84,
          // 조용할 땐 거의 멈춰 있고 소리가 들어올수록 조금 흔들려요. 일시정지면 전혀 움직이지 않아요
          jitter: reduced || !active ? 0 : 0.04 + level * 0.2,
          forceX,
          forceY,
        });
        const strength = Math.abs(particle.level);
        buckets[!active ? 3 : strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2].push(particle);
      });

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      buckets.forEach((bucket, index) => {
        if (!bucket.length) return;
        context.fillStyle = colors[index];
        bucket.forEach((particle) => context.fillRect(particle.x, particle.y, particle.size, particle.size));
      });
      animation = requestAnimationFrame(tick);
    };

    resize();
    animation = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animation);
  }, [canvasRef]);

  return { setPointer, clearPointer, pulse };
};
