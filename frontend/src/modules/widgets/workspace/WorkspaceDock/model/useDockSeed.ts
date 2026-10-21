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
import { sampleShapeTargets } from "@utils/sampleShapeTargets";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  SEED_FADE_DELAY_MS,
  SEED_MOBILE_BREAKPOINT,
  SEED_PARTICLE_COUNT,
  SEED_WAVE_AMPLITUDE,
  SEED_WAVE_BOTTOM,
  SEED_WAVE_COLUMNS,
  SEED_WAVE_MAX_WIDTH,
  SEED_WAVE_WIDTH_RATIO,
} from "../constants/dockSeed";
import { drawSpeechBubbleIcon } from "../utils/drawDockIcons";

interface SeedParticle {
  column: number;
  /** 막대 안의 세로 위치(-1~1). 랜딩 파형과 같아요 */
  level: number;
  jitter: number;
  seed: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  /** 갈라질 때 왼쪽(채팅) 묶음인지 */
  isChatSide: boolean;
  /** 말풍선 아이콘 모양에서의 자리 */
  ghostX: number;
  ghostY: number;
}

export type DockSeedTone = "idle" | "recording";

/** 갈라졌을 때 입자가 갈 자리. 캔버스 가로 가운데를 기준으로 한 거리(px)예요 */
export interface SeedSplitTargets {
  chatOffsetX: number;
  /** 녹음 쪽이 없는 화면(녹음 화면)이면 `null` */
  recordOffsetX: number | null;
}

interface UseDockSeedParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** `true`면 파형이 두 묶음으로 갈라져 독 자리로 가고, 곧 사라져요 */
  isOpen: boolean;
  tone: DockSeedTone;
  analyser: AnalyserNode | null;
  isActive: boolean;
  splitTargets: SeedSplitTargets;
  /** 파형 색 세 단계(진한, 보통, 옅은)의 잉크·청록, 갈라진 뒤의 밝은색·붉은색·청록 */
  palette: {
    ink: [string, string, string];
    teal: [string, string, string];
    light: [string, string, string];
    red: [string, string, string];
  };
}

/** 독 자리의 세로 가운데가 캔버스 아래에서 떨어진 거리(px). 접힌 독 높이의 절반이에요 */
const SLOT_CENTER_BOTTOM = 30;

const measureRms = (analyser: AnalyserNode) => {
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 6);
};

/**
 * 독이 접혀 있을 때 독 자리에 떠 있는 입자 파형을 그려요.
 *
 * 랜딩 녹음 장면과 같은 규칙이에요. 96칸 파형이 숨 쉬고, 올리면 입자가 포인터를 피하고(95px), 누르면 파동이 퍼져요.
 * 녹음 중이면 청록으로 바뀌어 분석기의 소리 크기를 따라요.
 * `isOpen`이 되면 입자가 왼쪽은 말풍선 아이콘, 오른쪽은 구슬 자리로 갈라져 가고, 그 뒤에서 진짜 독이 나타나면 사라져요.
 * 다시 닫히면 그 자리에서 파형으로 모여요. 숨어 있는 동안은 그리지 않아 비용이 들지 않아요.
 * 움직임 줄이기 설정에서는 이 파형을 쓰지 않으므로 여기서는 고려하지 않아요.
 */
export const useDockSeed = ({ canvasRef, isOpen, tone, analyser, isActive, splitTargets, palette }: UseDockSeedParams) => {
  const paramsRef = useRef({ isOpen, tone, analyser, isActive, splitTargets, palette });
  paramsRef.current = { isOpen, tone, analyser, isActive, splitTargets, palette };

  const pointerRef = useRef({ x: -9999, y: -9999 });
  const pulsesRef = useRef<PulseWave[]>([]);
  const pulseBoostRef = useRef({ at: 0, boost: 1 });
  const wakeRef = useRef<() => void>(() => {});

  const setPointer = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y };
  }, []);
  const clearPointer = useCallback(() => {
    pointerRef.current = { x: -9999, y: -9999 };
  }, []);
  /** 랜딩 `addPulse`와 같아요 */
  const pulse = useCallback((x: number, y: number, canvasWidth: number, canvasHeight: number) => {
    const now = Date.now();
    const boost = pulseBoostRef.current;
    boost.boost = nextPulseBoost({ lastPulseAt: boost.at, boost: boost.boost, now });
    boost.at = now;
    pulsesRef.current.push(createPulse({ x, y, width: canvasWidth, height: canvasHeight, boost: boost.boost }));
    wakeRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || prefersReducedMotion()) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const amplitudes = new Float32Array(SEED_WAVE_COLUMNS);
    let particles: SeedParticle[] = [];
    let width = 0;
    let height = 0;
    let frame = Math.random() * 1000;
    let level = 0;
    let blend = 0;
    let alpha = 1;
    let alphaGoal = 1;
    let fadeTimer = 0;
    let animation = 0;
    let isGhostAssigned = false;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const count = width < SEED_MOBILE_BREAKPOINT ? SEED_PARTICLE_COUNT.mobile : SEED_PARTICLE_COUNT.desktop;
      particles = Array.from({ length: count }, (_, index) => ({
        column: index % SEED_WAVE_COLUMNS,
        level: Math.random() * 2 - 1,
        jitter: (Math.random() - 0.5) * 0.42,
        seed: Math.random(),
        size: 0.9 + Math.random() * 0.9,
        x: width / 2 + (Math.random() - 0.5) * 300,
        y: height - SEED_WAVE_BOTTOM + (Math.random() - 0.5) * 40,
        vx: 0,
        vy: 0,
        homeX: 0,
        homeY: 0,
        isChatSide: index % 2 === 0,
        ghostX: 0,
        ghostY: 0,
      }));
      isGhostAssigned = false;
    };

    /** 채팅 묶음을 x 순서로 줄 세워 말풍선 아이콘 자리에 배정해요. 랜딩의 morph 배정과 같아요 */
    const assignGhost = () => {
      const hasRecordSide = paramsRef.current.splitTargets.recordOffsetX !== null;
      const targets = sampleShapeTargets({ draw: drawSpeechBubbleIcon, size: 26, step: 1 });
      if (!targets.length) return;
      const chat = particles.filter((p) => p.isChatSide || !hasRecordSide).sort((a, b) => a.x - b.x);
      const sorted = targets.sort((a, b) => a.x - b.x);
      chat.forEach((particle, rank) => {
        const target = sorted[Math.floor((rank * sorted.length) / chat.length)];
        particle.ghostX = target.x + (Math.random() - 0.5) * 0.4;
        particle.ghostY = target.y + (Math.random() - 0.5) * 0.4;
      });
      isGhostAssigned = true;
    };

    /** 랜딩 `updateWaveAmplitudes`와 같아요. 녹음 중엔 숨쉬기 대신 소리 크기가 높이를 정해요 */
    const updateAmplitudes = () => {
      const scale = paramsRef.current.tone === "idle" ? waveBreath(frame) : 0.25 + 0.75 * level;
      for (let column = 0; column < SEED_WAVE_COLUMNS; column++) {
        amplitudes[column] = waveAmplitude({ column, columns: SEED_WAVE_COLUMNS, frame, maxAmplitude: SEED_WAVE_AMPLITUDE, scale });
      }
    };

    const placeParticles = () => {
      const { splitTargets: targets } = paramsRef.current;
      const hasRecordSide = targets.recordOffsetX !== null;
      const centerX = width / 2;
      const centerY = height - SEED_WAVE_BOTTOM;
      const slotY = height - SLOT_CENTER_BOTTOM;
      const waveWidth = Math.min(SEED_WAVE_MAX_WIDTH, width * SEED_WAVE_WIDTH_RATIO);
      const startX = centerX - waveWidth / 2;
      const columnWidth = waveWidth / SEED_WAVE_COLUMNS;
      updateAmplitudes();
      if (blend > 0 && !isGhostAssigned) assignGhost();

      particles.forEach((particle) => {
        const waveX = startX + (particle.column + 0.5 + particle.jitter) * columnWidth;
        const waveY = centerY + particle.level * amplitudes[particle.column];
        if (blend <= 0) {
          particle.homeX = waveX;
          particle.homeY = waveY;
          return;
        }
        let splitX: number;
        let splitY: number;
        if (particle.isChatSide || !hasRecordSide) {
          splitX = centerX + targets.chatOffsetX + particle.ghostX;
          splitY = slotY + particle.ghostY;
        } else {
          // 구슬 자리: 가운데가 빽빽한 구름
          const r = 12 * Math.pow(particle.seed, 0.42);
          const angle = particle.seed * 97 + frame * 0.01;
          splitX = centerX + (targets.recordOffsetX ?? 0) + Math.cos(angle) * r;
          splitY = slotY + Math.sin(angle) * r * 0.9;
        }
        particle.homeX = waveX + (splitX - waveX) * blend;
        particle.homeY = waveY + (splitY - waveY) * blend;
      });
    };

    const tick = () => {
      frame++;
      resize();
      const { isOpen: open, tone: nextTone, analyser: node, isActive: active, splitTargets: targets, palette: colors } = paramsRef.current;
      const hasRecordSide = targets.recordOffsetX !== null;
      const measured = node && active && nextTone === "recording" ? measureRms(node) : 0;
      level = smoothLevel({ previous: level, next: measured, attack: 0.35, release: 0.08 });
      blend += ((open ? 1 : 0) - blend) * 0.2;
      if (blend < 0.01) blend = 0;
      alpha += (alphaGoal - alpha) * 0.16;
      placeParticles();

      const pulses = pulsesRef.current;
      advancePulses(pulses);
      const pointer = pointerRef.current;
      const hasPointer = pointer.x > -1000 && blend < 0.5;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const isHidden = alpha < 0.02;
      if (!isHidden) {
        const wavePalette = nextTone === "idle" ? colors.ink : colors.teal;
        const buckets: SeedParticle[][] = [[], [], [], [], [], []];
        particles.forEach((particle) => {
          let forceX = 0;
          let forceY = 0;
          if (hasPointer) {
            const repulsion = pointerRepulsion({ x: particle.x, y: particle.y, pointerX: pointer.x, pointerY: pointer.y });
            forceX += repulsion.fx;
            forceY += repulsion.fy;
          }
          if (blend < 0.5) {
            pulses.forEach((pulse) => {
              const force = pulseForce({ x: particle.x, y: particle.y, pulse });
              forceX += force.fx;
              forceY += force.fy;
            });
          }
          stepSpring({ particle, homeX: particle.homeX, homeY: particle.homeY, spring: 0.09, damping: 0.84, jitter: 0.18, forceX, forceY });
          const strength = Math.abs(particle.level);
          const waveShade = strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2;
          const isRecordSide = !particle.isChatSide && hasRecordSide;
          const splitShade = isRecordSide ? (particle.seed < 0.5 ? 0 : particle.seed < 0.8 ? 1 : 2) : waveShade;
          // 파형일 땐 잉크(녹음 중 청록), 갈라져 어두운 독 위에 오르면 밝은색과 붉은(녹음 중 청록) 구슬
          const bucket = blend < 0.55 ? waveShade : 3 + splitShade;
          buckets[bucket].push(particle);
        });
        const splitPalette = (isRecord: boolean) => (isRecord ? (nextTone === "idle" ? colors.red : colors.teal) : colors.light);
        context.globalAlpha = alpha;
        buckets.forEach((bucket, index) => {
          if (!bucket.length) return;
          if (index < 3) {
            context.fillStyle = wavePalette[index];
            bucket.forEach((p) => context.fillRect(p.x, p.y, p.size, p.size));
            return;
          }
          // 갈라진 뒤에는 묶음 안에서 채팅 쪽과 녹음 쪽 색이 달라요
          bucket.forEach((p) => {
            context.fillStyle = splitPalette(!p.isChatSide && hasRecordSide)[index - 3];
            context.fillRect(p.x, p.y, p.size, p.size);
          });
        });
        context.globalAlpha = 1;
      }

      // 숨어서 할 일이 없으면 멈춰요. 파동이나 열림·닫힘이 생기면 다시 깨워요
      const isSettled = isHidden && pulses.length === 0;
      animation = isSettled ? 0 : requestAnimationFrame(tick);
    };

    /** 열림 상태에 맞춰 보일지 정하고, 멈춰 있던 반복을 다시 돌려요 */
    const wake = () => {
      clearTimeout(fadeTimer);
      if (paramsRef.current.isOpen) {
        fadeTimer = window.setTimeout(() => {
          alphaGoal = 0;
        }, SEED_FADE_DELAY_MS);
      } else {
        alphaGoal = 1;
      }
      if (!animation) animation = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;

    resize();
    wake();

    return () => {
      cancelAnimationFrame(animation);
      clearTimeout(fadeTimer);
      wakeRef.current = () => {};
    };
  }, [canvasRef]);

  // 열리고 닫힐 때 엔진을 깨워 갈라지거나 모이게 해요
  useEffect(() => {
    wakeRef.current();
  }, [isOpen]);

  return { setPointer, clearPointer, pulse };
};
