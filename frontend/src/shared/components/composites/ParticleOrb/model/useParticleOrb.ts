import { prefersReducedMotion, smoothLevel, stepSpring, waveAmplitude } from "@utils/particleMotion";
import { measureAnalyserLevel } from "@utils/measureAudioLevel";
import { sampleShapeTargets } from "@utils/sampleShapeTargets";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import {
  ARROW_ICON_PATH,
  BUBBLE_DOTS,
  BUBBLE_ICON_PATH,
  BUBBLE_OUTLINE_SHARE,
  MIC_ICON_PATHS,
  MIC_SHAPE_SCALE,
  ORB_DAMPING,
  ORB_DOT_MIN,
  ORB_DOT_RANGE,
  ORB_PARTICLE_COUNT,
  ORB_SPRING,
  ORB_WAVE_COLUMNS,
} from "../constants/particleOrb";
import type { ParticleOrbPalette, ParticleOrbShape, ParticleOrbTone } from "../types/particleOrb";

interface OrbParticle {
  /** 구 위의 각도. 구름 모양일 때의 자리를 정해요 */
  u: number;
  v: number;
  /** 입자마다 고정된 0~1 난수. 안쪽·바깥쪽, 색, 파형 참여 여부를 정해요 */
  seed: number;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 이번 프레임에 돌아갈 자리 */
  homeX: number;
  homeY: number;
  /** 앞뒤 깊이(-1~1). 뒤쪽은 작고 옅게 그려요 */
  depth: number;
  /** 가운데에서 얼마나 떨어졌는지(0~1). 가장자리는 작게 그려요 */
  edge: number;
  bucket: number;
  /** 파형의 몇 번째 막대, 막대 안의 세로 위치(-1~1), 가로 흔들림 */
  column: number;
  level: number;
  jitter: number;
  /** 마이크 모양에서의 자리 */
  micX: number;
  micY: number;
  micBucket: number;
  /** 말풍선 모양에서 점 몇 번째를 맡는지(-1이면 윤곽)와 점 안에서의 흩어짐 */
  dot: number;
  dotX: number;
  dotY: number;
}

interface Pulse {
  radius: number;
  max: number;
  strength: number;
}

interface UseParticleOrbParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  radius: number;
  shape: ParticleOrbShape;
  tone: ParticleOrbTone;
  analyser: AnalyserNode | null;
  isActive: boolean;
  /** `true`면 무언가를 기다리는 중이라 구슬이 빠르게 돌며 모였다 풀렸다 해요 */
  isWaiting: boolean;
  idlePalette: ParticleOrbPalette;
  recordingPalette: ParticleOrbPalette;
  neutralPalette: ParticleOrbPalette;
  /** 녹음 중 빛무리 색. `r,g,b` 꼴이에요 */
  haloRgb: string;
}

/** 구가 보는 사람 쪽으로 기울어진 각도. 위쪽이 조금 보이게 해요 */
const TILT = 0.38;

/** 목소리가 이만큼이면 입자 전부가 파형으로 나가요 */
const WAVE_SHARE_PER_LEVEL = 1.7;
const MAX_WAVE_SHARE = 0.9;

const createParticles = (count: number): OrbParticle[] =>
  Array.from({ length: count }, (_, index) => ({
    u: Math.random() * Math.PI * 2,
    v: Math.acos(2 * Math.random() - 1),
    seed: Math.random(),
    size: ORB_DOT_MIN + Math.random() * ORB_DOT_RANGE,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    homeX: 0,
    homeY: 0,
    depth: 0,
    edge: 0,
    bucket: 1,
    column: index % ORB_WAVE_COLUMNS,
    level: Math.random() * 2 - 1,
    jitter: (Math.random() - 0.5) * 0.42,
    micX: 0,
    micY: 0,
    micBucket: 0,
    dot: -1,
    // 점 안에서는 가운데가 빽빽한 동그란 구름이 되도록 극좌표로 흩어요
    ...(() => {
      const r = Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      return { dotX: Math.cos(a) * r, dotY: Math.sin(a) * r };
    })(),
  }));

const drawMic = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.05;
  MIC_ICON_PATHS.forEach((path) => context.stroke(new Path2D(path)));
};

const drawArrow = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.6;
  context.stroke(new Path2D(ARROW_ICON_PATH));
};

const drawBubble = (context: CanvasRenderingContext2D) => {
  context.lineWidth = 1.3;
  context.stroke(new Path2D(BUBBLE_ICON_PATH));
};

/**
 * 입자 구슬을 캔버스에 매 프레임 그려요.
 *
 * 입자 수백 개가 구름 같은 구를 이루고, `shape`가 `mic`면 마이크, `arrow`면 오른쪽 화살표, `bubble`이면 점 세 개가 든 말풍선으로 모여요.
 * `typing`은 말풍선의 점들이 입력 중처럼 차례로 튀어요.
 * 녹음 톤에서는 분석기의 소리 크기만큼 입자가 가운데를 가로지르는 파형으로 나가고, 조용하면 구름으로 돌아와요.
 * `isWaiting`이면 구름이 빠르게 돌며 모였다 풀렸다 해요. 누른 뒤 결과를 기다리는 동안 멈춰 보이지 않게 해요.
 * 매 프레임 바뀌는 값이라 React 상태로 다루지 않고, 바뀌는 props는 ref로 받아 다음 프레임부터 반영해요.
 * 움직임 줄이기 설정에서는 회전·숨쉬기·흔들림을 멈추고 소리와 모양만 반영해요.
 */
export const useParticleOrb = ({
  canvasRef,
  radius,
  shape,
  tone,
  analyser,
  isActive,
  isWaiting,
  idlePalette,
  recordingPalette,
  neutralPalette,
  haloRgb,
}: UseParticleOrbParams) => {
  const paramsRef = useRef({ radius, shape, tone, analyser, isActive, isWaiting, idlePalette, recordingPalette, neutralPalette, haloRgb });
  paramsRef.current = { radius, shape, tone, analyser, isActive, isWaiting, idlePalette, recordingPalette, neutralPalette, haloRgb };

  const pulsesRef = useRef<Pulse[]>([]);
  const pulse = useCallback(() => {
    const { radius: r } = paramsRef.current;
    pulsesRef.current.push({ radius: 0, max: r * 2.4, strength: 2.2 });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reduced = prefersReducedMotion();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const particles = createParticles(ORB_PARTICLE_COUNT);
    const amplitudes = new Float32Array(ORB_WAVE_COLUMNS);
    let width = 0;
    let height = 0;
    let frame = Math.random() * 1000;
    let level = 0;
    let hover = 0;
    let wait = 0;
    let spin = 0;
    let assignedShape: ParticleOrbShape | null = null;
    let animation = 0;

    const resize = () => {
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (!nextWidth || !nextHeight || (nextWidth === width && nextHeight === height)) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      particles.forEach((particle) => {
        particle.x = width / 2 + (Math.random() - 0.5) * width;
        particle.y = height / 2 + (Math.random() - 0.5) * height;
      });
    };

    /** 입자를 x 순서로 줄 세워 아이콘 자리에 배정해요. 랜딩의 morph 배정과 같아 가까운 자리로 자연스럽게 흘러요. */
    const assignShape = (shape: Exclude<ParticleOrbShape, "cloud">) => {
      const isBubble = shape === "bubble" || shape === "typing";
      const targets = sampleShapeTargets({
        draw: shape === "mic" ? drawMic : shape === "arrow" ? drawArrow : drawBubble,
        size: paramsRef.current.radius * 2 * (shape === "mic" ? MIC_SHAPE_SCALE : isBubble ? 1.25 : 1.1),
        step: 1 / 3,
      });
      if (!targets.length) return;
      // 말풍선은 윤곽을 맡는 입자와 점 세 개를 맡는 입자로 나눠요
      const members = isBubble ? particles.filter((p) => p.seed < BUBBLE_OUTLINE_SHARE) : particles;
      particles.forEach((p) => {
        p.dot = isBubble && p.seed >= BUBBLE_OUTLINE_SHARE ? Math.min(2, Math.floor(((p.seed - BUBBLE_OUTLINE_SHARE) / (1 - BUBBLE_OUTLINE_SHARE)) * 3)) : -1;
      });
      const order = members.map((_, i) => i).sort((a, b) => members[a].x - members[b].x);
      const targetOrder = targets.map((_, i) => i).sort((a, b) => targets[a].x - targets[b].x);
      order.forEach((memberIndex, rank) => {
        const particle = members[memberIndex];
        const target = targets[targetOrder[Math.floor((rank * targets.length) / order.length)]];
        particle.micX = target.x + (Math.random() - 0.5) * 0.2;
        particle.micY = target.y + (Math.random() - 0.5) * 0.2;
        particle.micBucket = particle.seed < 0.8 * BUBBLE_OUTLINE_SHARE || !isBubble ? 0 : 1;
      });
    };

    const updateAmplitudes = (orbRadius: number) => {
      // 랜딩 파형과 같은 공식. 구슬이 작아 바닥값 2.5가 크므로 1/4로 줄여 써요
      const maxAmplitude = orbRadius * 4 * (0.25 + 0.75 * level);
      for (let column = 0; column < ORB_WAVE_COLUMNS; column++) {
        amplitudes[column] = waveAmplitude({ column, columns: ORB_WAVE_COLUMNS, frame: frame * 1.8, maxAmplitude, scale: 1 }) / 4;
      }
    };

    const placeParticles = () => {
      const { radius: baseRadius, shape: nextShape, tone: nextTone } = paramsRef.current;
      const centerX = width / 2;
      const centerY = height / 2;
      const isRecording = nextTone === "recording";

      if (nextShape !== "cloud") {
        // 말풍선과 입력 중은 같은 자리라 서로 바뀔 때 다시 배정하지 않아요
        const isBubble = nextShape === "bubble" || nextShape === "typing";
        const assignKey = isBubble ? "bubble" : nextShape;
        if (assignedShape !== assignKey) {
          assignShape(nextShape);
          assignedShape = assignKey;
        }
        const wobble = reduced ? 0 : Math.sin(frame * 0.05) * 0.4;
        const dotScale = (baseRadius * 2 * 1.25) / 24;
        particles.forEach((particle) => {
          if (particle.dot >= 0) {
            // 점 세 개: 가운데가 빽빽한 작은 구름. 입력 중이면 차례로 통통 튀어요
            const dot = BUBBLE_DOTS[particle.dot];
            const bounce = nextShape === "typing" && !reduced ? Math.max(0, Math.sin(frame * 0.16 - particle.dot * 0.9)) * 2.2 : 0;
            particle.homeX = centerX + (dot.x - 12) * dotScale + particle.dotX * 1.4;
            particle.homeY = centerY + (dot.y - 12) * dotScale + particle.dotY * 1.4 + wobble - bounce;
            particle.depth = 1;
            particle.edge = 0.5;
            particle.bucket = 0;
            return;
          }
          particle.homeX = centerX + particle.micX;
          particle.homeY = centerY + particle.micY + wobble;
          particle.depth = 1;
          particle.edge = 0.75;
          particle.bucket = particle.micBucket;
        });
        return;
      }
      assignedShape = null;

      // 기다리는 동안은 빠르게 돌며 숨을 크게 쉬어, 누른 뒤 멈춰 있지 않고 무언가 준비되고 있다고 느끼게 해요
      spin += 0.006 + level * 0.018 + hover * 0.004 + wait * 0.03;
      const rotation = reduced ? 0.6 : spin;
      const gather = reduced ? 0 : wait * 0.14 * (0.5 + 0.5 * Math.sin(frame * 0.11));
      const orbRadius = baseRadius * (1 + hover * 0.08 + level * 0.28 - gather);
      const waveShare = isRecording ? Math.min(MAX_WAVE_SHARE, level * WAVE_SHARE_PER_LEVEL) : 0;
      if (isRecording) updateAmplitudes(orbRadius);

      particles.forEach((particle) => {
        if (particle.seed < waveShare) {
          // 구슬 가운데를 가로지르는 파형. 목소리가 클수록 더 많은 입자가 나와요
          particle.homeX = centerX - orbRadius * 1.3 + (particle.column + 0.5 + particle.jitter) * ((orbRadius * 2.6) / ORB_WAVE_COLUMNS);
          particle.homeY = centerY + particle.level * amplitudes[particle.column];
          particle.depth = 1;
          particle.edge = 0.3;
          const strength = Math.abs(particle.level);
          particle.bucket = strength < 0.45 ? 0 : strength < 0.8 ? 2 : 3;
          return;
        }

        const breathe = reduced
          ? 1
          : 1 + 0.05 * Math.sin(frame * 0.028 + particle.seed * 6.28) + level * 0.22 * Math.sin(frame * 0.21 + particle.seed * 9);
        // 가운데가 빽빽하고 가장자리로 갈수록 성긴 구름 같은 구슬
        const r = orbRadius * breathe * Math.pow(particle.seed, 0.42);
        const sinV = Math.sin(particle.v);
        const x = sinV * Math.cos(particle.u + rotation);
        const y0 = Math.cos(particle.v);
        const z0 = sinV * Math.sin(particle.u + rotation);
        const y = y0 * Math.cos(TILT) - z0 * Math.sin(TILT);
        const z = y0 * Math.sin(TILT) + z0 * Math.cos(TILT);
        particle.homeX = centerX + x * r;
        particle.homeY = centerY + y * r;
        particle.depth = z;
        particle.edge = r / orbRadius;
        // 왼쪽 위에서 빛이 들어와 오른쪽 아래가 그늘이에요
        const light = 0.5 + 0.5 * (-x * 0.45 - y * 0.78 + z * 0.3) * (0.6 + 0.4 * particle.edge);
        if (z < -0.3) particle.bucket = 5;
        else particle.bucket = light > 0.78 ? 0 : light > 0.62 ? 1 : light > 0.46 ? 2 : light > 0.3 ? 3 : 4;
      });
    };

    const drawHalo = () => {
      const { radius: baseRadius, tone: nextTone, haloRgb: rgb, isActive: active } = paramsRef.current;
      if (nextTone !== "recording" || !active) return;
      const centerX = width / 2;
      const centerY = height / 2;
      const orbRadius = baseRadius * (1 + level * 0.28);
      const haloRadius = Math.min(orbRadius * 1.9, Math.min(width, height) / 2);
      const beat = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(frame * 0.075);
      const halo = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, haloRadius);
      // 기다리는 동안은 빛무리가 더 또렷하게 뛰어요
      halo.addColorStop(0, `rgba(${rgb},${0.1 + beat * (0.12 + wait * 0.14) + level * 0.18})`);
      halo.addColorStop(1, `rgba(${rgb},0)`);
      context.fillStyle = halo;
      context.beginPath();
      context.arc(centerX, centerY, haloRadius, 0, Math.PI * 2);
      context.fill();
    };

    let isOddFrame = false;
    const tick = () => {
      resize();
      const { analyser: node, isActive: active, tone: nextTone, shape: nextShape } = paramsRef.current;
      // 가만히 떠 있는 구름은 30fps면 충분해요. 모양이 바뀌거나 소리·파동이 있을 땐 60fps예요
      const isCalm =
        nextShape === "cloud" &&
        hover < 0.01 &&
        level < 0.01 &&
        wait < 0.01 &&
        !paramsRef.current.isWaiting &&
        pulsesRef.current.length === 0 &&
        !(node && active && nextTone === "recording");
      isOddFrame = !isOddFrame;
      if (isCalm && isOddFrame) {
        animation = requestAnimationFrame(tick);
        return;
      }
      frame++;
      hover += ((nextShape !== "cloud" ? 1 : 0) - hover) * 0.12;
      wait += ((paramsRef.current.isWaiting ? 1 : 0) - wait) * 0.1;
      const measured = node && active && nextTone === "recording" ? measureAnalyserLevel(node) : 0;
      level = smoothLevel({ previous: level, next: measured, attack: 0.35, release: 0.06 });
      placeParticles();

      const pulses = pulsesRef.current;
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].radius += 1.4;
        if (pulses[i].radius > pulses[i].max) pulses.splice(i, 1);
      }

      const buckets: OrbParticle[][] = [[], [], [], [], [], []];
      const centerX = width / 2;
      const centerY = height / 2;
      particles.forEach((particle) => {
        let forceX = 0;
        let forceY = 0;
        pulses.forEach((wave) => {
          const dx = particle.x - centerX;
          const dy = particle.y - centerY;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const ring = Math.abs(distance - wave.radius);
          if (ring >= 7) return;
          const force = (1 - ring / 7) * wave.strength * (1 - wave.radius / wave.max);
          forceX += (dx / distance) * force;
          forceY += (dy / distance) * force;
        });
        stepSpring({
          particle,
          homeX: particle.homeX,
          homeY: particle.homeY,
          spring: reduced ? 0.3 : ORB_SPRING,
          damping: ORB_DAMPING,
          jitter: reduced ? 0 : 0.05 + level * 0.3,
          forceX,
          forceY,
        });
        buckets[particle.bucket].push(particle);
      });

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      drawHalo();
      const palette =
        nextTone === "recording" ? paramsRef.current.recordingPalette : nextTone === "neutral" ? paramsRef.current.neutralPalette : paramsRef.current.idlePalette;
      // 구슬은 작아서 네모 점이면 모자이크처럼 보여요. 칸마다 한 번에 둥근 점으로 채워요
      buckets.forEach((bucket, index) => {
        if (!bucket.length) return;
        context.fillStyle = palette[index];
        const scale = index === 5 ? 0.8 : 1;
        context.beginPath();
        bucket.forEach((particle) => {
          const dot = particle.size * scale * (0.7 + 0.3 * ((particle.depth + 1) / 2)) * (1.15 - 0.45 * particle.edge);
          context.moveTo(particle.x + dot / 2, particle.y);
          context.arc(particle.x, particle.y, dot / 2, 0, Math.PI * 2);
        });
        context.fill();
      });
      animation = requestAnimationFrame(tick);
    };

    resize();
    animation = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animation);
  }, [canvasRef]);

  return { pulse };
};
