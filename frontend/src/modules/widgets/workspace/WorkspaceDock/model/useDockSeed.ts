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
import { sampleBubbleTargets, samplePillTargets, type BubbleTarget } from "@utils/sampleBubbleTargets";
import { sampleShapeTargets } from "@utils/sampleShapeTargets";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  SEED_BUBBLE_FONT_SIZE,
  SEED_BUBBLE_TEXT,
  SEED_FADE_DELAY_MS,
  SEED_FONT_FAMILY,
  SEED_MOBILE_BREAKPOINT,
  SEED_PARTICLE_COUNT,
  SEED_PILL,
  SEED_SLOW_FRAME_MS,
  SEED_WAVE_AMPLITUDE,
  SEED_WAVE_BOTTOM,
  SEED_WAVE_COLUMNS,
  SEED_WAVE_MAX_WIDTH,
  SEED_WAVE_WIDTH_RATIO,
} from "../constants/dockSeed";
import { drawSpeechBubbleIcon } from "../utils/drawDockIcons";

/** 대기 상태에서 입자가 이루는 모양의 묶음. 색을 달리 그려요 */
type IdleKind = "text" | "outline" | "pillOutline" | "pillDot";

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
  /** 대기 상태의 자리(캔버스 가로 가운데·독 자리 세로 가운데 기준)와 묶음 */
  idleX: number;
  idleY: number;
  idleKind: IdleKind;
  /** 갈라질 때 채팅 묶음인지. 대기 상태에서 말풍선을 이루던 입자가 채팅 쪽이에요 */
  isChatSide: boolean;
  /** 독의 말풍선 아이콘 모양에서의 자리 */
  iconX: number;
  iconY: number;
}

export type DockSeedTone = "idle" | "recording";

/** 갈라졌을 때 입자가 갈 자리. 캔버스 가로 가운데를 기준으로 한 거리(px)예요 */
export interface SeedSplitTargets {
  chatOffsetX: number;
  /** 녹음 쪽이 없는 화면(녹음 화면)이면 `null` */
  recordOffsetX: number | null;
}

export interface DockSeedPalette {
  /** 잉크 세 단계(진한, 보통, 옅은). 대기 말풍선과 파형에 써요 */
  ink: [string, string, string];
  /** 청록 세 단계. 녹음 중 파형에 써요 */
  teal: [string, string, string];
  /** 붉은 두 단계(점, 윤곽). 대기 녹음 알약에 써요 */
  red: [string, string];
  /** 어두운 독 위에 올라간 뒤의 밝은 세 단계와 붉은 세 단계 */
  light: [string, string, string];
  orb: [string, string, string];
}

interface UseDockSeedParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** `true`면 입자가 독 자리로 갈라져 가고, 곧 사라져요 */
  isOpen: boolean;
  tone: DockSeedTone;
  analyser: AnalyserNode | null;
  isActive: boolean;
  /** 녹음 쪽이 없는 화면이면 대기 상태에도 녹음 알약을 두지 않아요 */
  hasRecordSide: boolean;
  splitTargets: SeedSplitTargets;
  palette: DockSeedPalette;
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
 * 독이 접혀 있을 때 독 자리에 떠 있는 입자를 그려요.
 *
 * 대기 상태에서는 랜딩 문제 장면처럼 입자가 「무엇이든 요청하세요」 말풍선과 붉은 점이 든 녹음 알약을 이루어,
 * 이 자리에서 채팅과 녹음을 할 수 있다는 것을 바로 보여 줘요. 녹음 중에는 랜딩 녹음 장면과 같은 청록 파형이
 * 소리 크기를 따라요. 둘 다 올리면 입자가 포인터를 피하고(95px), 누르면 파동이 퍼져요.
 * `isOpen`이 되면 말풍선 입자는 독의 말풍선 아이콘으로, 알약 입자는 구슬 자리로 모이고, 진짜 독이 나타나면 사라져요.
 * 다시 닫히면 그 자리에서 대기 모양으로 돌아와요. 숨어 있는 동안은 그리지 않아요.
 * 프레임이 자주 느려지면 입자 절반만 그리고 흔들림을 빼서 어느 기기에서도 버벅이지 않게 해요.
 * 움직임 줄이기 설정에서는 이 입자를 쓰지 않으므로 여기서는 고려하지 않아요.
 */
export const useDockSeed = ({
  canvasRef,
  isOpen,
  tone,
  analyser,
  isActive,
  hasRecordSide,
  splitTargets,
  palette,
}: UseDockSeedParams) => {
  const paramsRef = useRef({ isOpen, tone, analyser, isActive, hasRecordSide, splitTargets, palette });
  paramsRef.current = { isOpen, tone, analyser, isActive, hasRecordSide, splitTargets, palette };

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
    let isMobile = false;
    let frame = Math.random() * 1000;
    let level = 0;
    let blend = 0;
    let alpha = 1;
    let alphaGoal = 1;
    let fadeTimer = 0;
    let animation = 0;
    let isIconAssigned = false;
    let idleLayoutKey = "";
    let lastFrameAt = 0;
    let slowFrames = 0;
    let isLite = false;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      isMobile = width < SEED_MOBILE_BREAKPOINT;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const count = isMobile ? SEED_PARTICLE_COUNT.mobile : SEED_PARTICLE_COUNT.desktop;
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
        idleX: 0,
        idleY: 0,
        idleKind: "text",
        isChatSide: index % 2 === 0,
        iconX: 0,
        iconY: 0,
      }));
      isIconAssigned = false;
      idleLayoutKey = "";
    };

    /** 대기 모양(말풍선·녹음 알약)의 자리를 뽑아 입자에 나눠 줘요. 말풍선 입자가 채팅 쪽, 알약 입자가 녹음 쪽이에요 */
    const assignIdle = () => {
      const withRecord = paramsRef.current.hasRecordSide;
      const key = `${width}:${withRecord}`;
      if (key === idleLayoutKey) return;
      const bubble = sampleBubbleTargets({
        text: SEED_BUBBLE_TEXT,
        fontSize: isMobile ? SEED_BUBBLE_FONT_SIZE.mobile : SEED_BUBBLE_FONT_SIZE.desktop,
        fontFamily: SEED_FONT_FAMILY,
        step: isMobile ? 2 : 1,
      });
      if (!bubble.targets.length) return;
      const pill = withRecord ? samplePillTargets(SEED_PILL) : { targets: [] as BubbleTarget[], width: 0 };
      const total = bubble.width + (withRecord ? SEED_PILL.gap + pill.width : 0);
      const bubbleCenterX = -total / 2 + bubble.width / 2;
      const pillCenterX = total / 2 - pill.width / 2;
      const all = [
        ...bubble.targets.map((t) => ({ x: bubbleCenterX + t.x, y: t.y, kind: t.kind as IdleKind, isChat: true })),
        ...pill.targets.map((t) => ({ x: pillCenterX + t.x, y: t.y, kind: (t.kind === "text" ? "pillDot" : "pillOutline") as IdleKind, isChat: false })),
      ];
      // 자리가 입자보다 많으면 고르게 골라 쓰고, 적으면 둘레에 살짝 흩어 채워요(랜딩 fitTargets와 같은 생각)
      particles.forEach((particle, index) => {
        const target = all[Math.floor((index * all.length) / particles.length) % all.length];
        const spread = all.length < particles.length ? 1.2 : 0;
        particle.idleX = target.x + (Math.random() - 0.5) * spread;
        particle.idleY = target.y + (Math.random() - 0.5) * spread;
        particle.idleKind = target.kind;
        particle.isChatSide = target.isChat;
      });
      idleLayoutKey = key;
      isIconAssigned = false;
    };

    /** 채팅 묶음을 x 순서로 줄 세워 독의 말풍선 아이콘 자리에 배정해요. 랜딩의 morph 배정과 같아요 */
    const assignIcon = () => {
      const targets = sampleShapeTargets({ draw: drawSpeechBubbleIcon, size: 26, step: 1 });
      if (!targets.length) return;
      const withRecord = paramsRef.current.hasRecordSide;
      const chat = particles.filter((p) => p.isChatSide || !withRecord).sort((a, b) => a.x - b.x);
      const sorted = targets.sort((a, b) => a.x - b.x);
      chat.forEach((particle, rank) => {
        const target = sorted[Math.floor((rank * sorted.length) / chat.length)];
        particle.iconX = target.x + (Math.random() - 0.5) * 0.4;
        particle.iconY = target.y + (Math.random() - 0.5) * 0.4;
      });
      isIconAssigned = true;
    };

    /** 랜딩 `updateWaveAmplitudes`와 같아요. 녹음 중엔 숨쉬기 대신 소리 크기가 높이를 정해요 */
    const updateAmplitudes = () => {
      const scale = paramsRef.current.tone === "idle" ? waveBreath(frame) : 0.25 + 0.75 * level;
      for (let column = 0; column < SEED_WAVE_COLUMNS; column++) {
        amplitudes[column] = waveAmplitude({ column, columns: SEED_WAVE_COLUMNS, frame, maxAmplitude: SEED_WAVE_AMPLITUDE, scale });
      }
    };

    const placeParticles = () => {
      const { splitTargets: targets, tone: nextTone, hasRecordSide: withRecord } = paramsRef.current;
      const centerX = width / 2;
      const centerY = height - SEED_WAVE_BOTTOM;
      const slotY = height - SLOT_CENTER_BOTTOM;
      const isWave = nextTone === "recording";
      if (isWave) updateAmplitudes();
      else assignIdle();
      if (blend > 0 && !isIconAssigned) assignIcon();

      const waveWidth = Math.min(SEED_WAVE_MAX_WIDTH, width * SEED_WAVE_WIDTH_RATIO);
      const startX = centerX - waveWidth / 2;
      const columnWidth = waveWidth / SEED_WAVE_COLUMNS;
      // 숨 쉬듯 아주 살짝 떠 있어요. 랜딩 말 조각이 떠다니는 폭보다 작게
      const drift = isWave ? 0 : Math.sin(frame * 0.017) * 2;

      particles.forEach((particle) => {
        let restX: number;
        let restY: number;
        if (isWave) {
          restX = startX + (particle.column + 0.5 + particle.jitter) * columnWidth;
          restY = centerY + particle.level * amplitudes[particle.column];
        } else {
          restX = centerX + particle.idleX;
          restY = centerY + particle.idleY + drift;
        }
        if (blend <= 0) {
          particle.homeX = restX;
          particle.homeY = restY;
          return;
        }
        let splitX: number;
        let splitY: number;
        if (particle.isChatSide || !withRecord) {
          splitX = centerX + targets.chatOffsetX + particle.iconX;
          splitY = slotY + particle.iconY;
        } else {
          // 구슬 자리: 가운데가 빽빽한 구름
          const r = 12 * Math.pow(particle.seed, 0.42);
          const angle = particle.seed * 97 + frame * 0.01;
          splitX = centerX + (targets.recordOffsetX ?? 0) + Math.cos(angle) * r;
          splitY = slotY + Math.sin(angle) * r * 0.9;
        }
        particle.homeX = restX + (splitX - restX) * blend;
        particle.homeY = restY + (splitY - restY) * blend;
      });
    };

    /** 입자 하나의 색. 대기 모양은 묶음마다, 파형은 랜딩처럼 세로 위치마다, 갈라진 뒤엔 독 위의 밝은색·붉은색이에요 */
    const colorOf = (particle: SeedParticle, colors: DockSeedPalette, isWave: boolean, withRecord: boolean) => {
      if (blend >= 0.55) {
        if (!particle.isChatSide && withRecord) {
          const shade = particle.seed < 0.5 ? 0 : particle.seed < 0.8 ? 1 : 2;
          return (paramsRef.current.tone === "idle" ? colors.orb : colors.teal)[shade];
        }
        const strength = Math.abs(particle.level);
        return colors.light[strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2];
      }
      if (isWave) {
        const strength = Math.abs(particle.level);
        return colors.teal[strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2];
      }
      switch (particle.idleKind) {
        case "text":
          return colors.ink[particle.seed < 0.7 ? 0 : 1];
        case "outline":
          return colors.ink[particle.seed < 0.5 ? 1 : 2];
        case "pillDot":
          return colors.red[0];
        default:
          return colors.red[1];
      }
    };

    const tick = (now: number) => {
      frame++;
      resize();
      // 느린 프레임이 잦으면 가볍게 그려요. 한 번 가벼워지면 그 세션에선 되돌리지 않아 깜빡이지 않아요
      if (lastFrameAt && now - lastFrameAt > SEED_SLOW_FRAME_MS) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (!isLite && slowFrames > 12) isLite = true;
      lastFrameAt = now;

      const { isOpen: open, tone: nextTone, analyser: node, isActive: active, hasRecordSide: withRecord, palette: colors } = paramsRef.current;
      const isWave = nextTone === "recording";
      const measured = node && active && isWave ? measureRms(node) : 0;
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
        context.globalAlpha = alpha;
        const step = isLite ? 2 : 1;
        let lastColor = "";
        for (let i = 0; i < particles.length; i += step) {
          const particle = particles[i];
          let forceX = 0;
          let forceY = 0;
          if (hasPointer) {
            const repulsion = pointerRepulsion({ x: particle.x, y: particle.y, pointerX: pointer.x, pointerY: pointer.y });
            forceX += repulsion.fx;
            forceY += repulsion.fy;
          }
          if (blend < 0.5) {
            for (const wave of pulses) {
              const force = pulseForce({ x: particle.x, y: particle.y, pulse: wave });
              forceX += force.fx;
              forceY += force.fy;
            }
          }
          stepSpring({
            particle,
            homeX: particle.homeX,
            homeY: particle.homeY,
            spring: isWave ? 0.09 : 0.05,
            damping: 0.84,
            jitter: isLite ? 0 : 0.18,
            forceX,
            forceY,
          });
          const color = colorOf(particle, colors, isWave, withRecord);
          if (color !== lastColor) {
            context.fillStyle = color;
            lastColor = color;
          }
          context.fillRect(particle.x, particle.y, particle.size, particle.size);
        }
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
      if (!animation) {
        lastFrameAt = 0;
        animation = requestAnimationFrame(tick);
      }
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
