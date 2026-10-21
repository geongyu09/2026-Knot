import { measureAnalyserLevel } from "@utils/measureAudioLevel";
import {
  advancePulses,
  createPulse,
  nextPulseBoost,
  pointerRepulsion,
  prefersReducedMotion,
  pulseForce,
  smoothLevel,
  stepSpring,
  waveAmplitude,
  waveBreath,
  type PulseWave,
} from "@utils/particleMotion";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  WAVEFORM_AMPLITUDE_RATIO,
  WAVEFORM_COLUMNS,
  WAVEFORM_PARTICLE_RANGE,
  WAVEFORM_PARTICLES_PER_AREA,
  WAVEFORM_POINTER_RADIUS,
  WAVEFORM_VOICE_GAIN,
} from "../constants/particleWaveform";

interface WaveParticle {
  column: number;
  /** 막대 안의 세로 위치(-1~1). 랜딩 파형과 같아요 */
  level: number;
  jitter: number;
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
 * 랜딩 녹음 장면의 파형을 캔버스에 매 프레임 그려요.
 *
 * 96칸 막대가 저마다 다른 박자로 출렁이고 양 끝으로 갈수록 낮아지는 랜딩 공식 그대로예요.
 * 파형 전체는 랜딩처럼 숨 쉬고, 분석기의 소리 크기만큼 더 크게 퍼져요. 입자는 가운데가 빽빽하고
 * 세로 위치에 따라 잉크 세 단계로 그려요. 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요.
 * 일시정지면 숨을 멈추고 옅은 색으로 멈춰 있어요. 움직임 줄이기 설정에서는 흔들림과 숨쉬기 없이 소리만 따라요.
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
    const amplitudes = new Float32Array(WAVEFORM_COLUMNS);
    const particles: WaveParticle[] = [];
    let width = 0;
    let height = 0;
    let frame = Math.random() * 1000;
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
          column: i % WAVEFORM_COLUMNS,
          level: Math.random() * 2 - 1,
          jitter: (Math.random() - 0.5) * 0.42,
          size: 0.9 + Math.random() * 0.9,
          x: Math.random() * width,
          y: height / 2 + (Math.random() - 0.5) * height * 0.2,
          vx: 0,
          vy: 0,
        });
      }
    };

    const tick = () => {
      frame++;
      resize();
      const { analyser: node, isActive: active, palette: colors } = paramsRef.current;
      const measured = node && active ? measureAnalyserLevel(node) : 0;
      level = smoothLevel({ previous: level, next: measured, attack: 0.4, release: 0.08 });

      // 랜딩 녹음 장면의 숨쉬기 그대로. 목소리가 들어오면 그만큼 더 퍼지고, 일시정지면 숨도 멈춰요
      const breath = reduced || !active ? 0.7 : waveBreath(frame);
      const scale = Math.min(1.25, breath * (1 + WAVEFORM_VOICE_GAIN * level));
      const maxAmplitude = height * WAVEFORM_AMPLITUDE_RATIO;
      for (let column = 0; column < WAVEFORM_COLUMNS; column++) {
        amplitudes[column] = waveAmplitude({ column, columns: WAVEFORM_COLUMNS, frame, maxAmplitude, scale });
      }

      const pulses = pulsesRef.current;
      advancePulses(pulses);
      const pointer = pointerRef.current;
      const hasPointer = pointer.x > -1000;
      const columnWidth = width / WAVEFORM_COLUMNS;
      const centerY = height / 2;
      const buckets: WaveParticle[][] = [[], [], [], []];

      particles.forEach((particle) => {
        const homeX = (particle.column + 0.5 + particle.jitter) * columnWidth;
        const homeY = centerY + particle.level * amplitudes[particle.column];
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
          spring: reduced ? 0.3 : 0.09,
          damping: 0.84,
          jitter: reduced || !active ? 0 : 0.18,
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
