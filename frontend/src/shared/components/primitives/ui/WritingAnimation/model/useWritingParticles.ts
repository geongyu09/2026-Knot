import { gaussian, prefersReducedMotion, roundedRectPoint, stepSpring, waveAmplitude, waveBreath } from "@utils/particleMotion";
import { useEffect, useRef, type RefObject } from "react";

import {
  WRITING_DOC,
  WRITING_DOC_LAYOUT,
  WRITING_LINES,
  WRITING_OUTLINE_SHARE,
  WRITING_PARTICLE_COUNT,
  WRITING_TIMELINE,
  WRITING_WAVE_AMPLITUDE,
  WRITING_WAVE_COLUMNS,
  WRITING_WAVE_WIDTH,
} from "../constants/writingParticles";

interface WritingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 파형의 몇 번째 막대, 막대 안의 세로 위치(-1~1), 가로 흔들림. 랜딩 파형과 같아요 */
  column: number;
  level: number;
  jitter: number;
  /** 맡은 문서(0~2) */
  doc: number;
  /** 윤곽이면 -1, 글줄이면 몇 번째 줄인지 */
  line: number;
  /** 윤곽 둘레 위 위치(0~1)나 글줄 위 위치(0~1) */
  along: number;
  /** 윤곽·글줄에서 살짝 벗어난 거리(px) */
  offset: number;
  /** 펜 끝에 모여 있을 때의 자리(펜 끝 기준 px) */
  penX: number;
  penY: number;
  /** 청록(1)에서 잉크(0)로 물드는 정도 */
  teal: number;
}

export interface WritingPalette {
  /** 청록 세 단계(진한 것부터). 파형과 펜 끝에 써요 */
  teal: [string, string, string];
  /** 잉크 두 단계. 글줄과 문서 윤곽에 써요 */
  ink: [string, string];
}

interface UseWritingParticlesParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  palette: WritingPalette;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const createParticles = (): WritingParticle[] =>
  Array.from({ length: WRITING_PARTICLE_COUNT }, (_, index) => {
    const isOutline = Math.random() < WRITING_OUTLINE_SHARE;
    // 긴 줄일수록 입자를 많이 받아 세 줄의 밀도가 같아요
    const lineWeights = WRITING_LINES.map((line) => line.length);
    let pick = Math.random() * lineWeights.reduce((sum, weight) => sum + weight, 0);
    const line = lineWeights.findIndex((weight) => (pick -= weight) <= 0);
    const r = Math.sqrt(Math.random()) * 3.2;
    const angle = Math.random() * Math.PI * 2;

    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 0.9 + Math.random() * 0.8,
      column: index % WRITING_WAVE_COLUMNS,
      level: Math.random() * 2 - 1,
      jitter: (Math.random() - 0.5) * 0.42,
      doc: index % WRITING_DOC_LAYOUT.length,
      line: isOutline ? -1 : Math.max(0, line),
      along: Math.random(),
      offset: gaussian() * (isOutline ? 0.9 : 0.7),
      penX: Math.cos(angle) * r,
      penY: Math.sin(angle) * r,
      teal: 1,
    };
  });

/** 문서 안의 한 점(문서 가운데 기준)을 무대 좌표로 옮겨요 */
const placeOnDoc = (doc: number, localX: number, localY: number, centerX: number, centerY: number, bob: number) => {
  const layout = WRITING_DOC_LAYOUT[doc];
  const cos = Math.cos(layout.rotation);
  const sin = Math.sin(layout.rotation);

  return {
    x: centerX + layout.x + localX * cos - localY * sin,
    y: centerY + layout.y + bob + localX * sin + localY * cos,
  };
};

/** 글줄 위 한 점. 손으로 쓴 줄처럼 아주 살짝 물결쳐요(`writing.svg`의 글줄과 같은 느낌) */
const linePoint = (line: number, along: number) => {
  const innerWidth = WRITING_DOC.width - 14;
  const startX = -WRITING_DOC.width / 2 + 7;
  return {
    x: startX + along * innerWidth * WRITING_LINES[line].length,
    y: WRITING_LINES[line].y + Math.sin(along * Math.PI * 2) * 0.7,
  };
};

/**
 * 회의 녹음이 주제별 문서로 정리되는 모습을 입자로 그려요.
 *
 * 녹음 바와 같은 청록 파형이 숨 쉬다가 문서 세 장으로 갈라지고, 문서마다 청록 입자 펜이 글줄을 한 줄씩 써 내려가요.
 * 펜이 지나간 자리의 입자는 잉크색으로 가라앉아요. 다 쓰면 잠깐 머물렀다가 다시 파형으로 모여 되풀이해요.
 * 시간은 실제 흐른 시간으로 재서 화면 주사율과 관계없이 같은 빠르기예요. 탭이 숨으면 브라우저가 그리기를 멈춰요.
 * 움직임 줄이기 설정에서는 그리지 않아요. 그때는 멈춘 그림을 보여 줘요.
 */
export const useWritingParticles = ({ canvasRef, palette }: UseWritingParticlesParams) => {
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || prefersReducedMotion()) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const particles = createParticles();
    const amplitudes = new Float32Array(WRITING_WAVE_COLUMNS);
    const buckets: WritingParticle[][] = [[], [], [], [], []];
    let width = 0;
    let height = 0;
    let frame = 0;
    let startedAt = 0;
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
        particle.x = width / 2 + gaussian() * 30;
        particle.y = height / 2 + gaussian() * 8;
      });
    };

    /** 이 문서의 펜이 지금 어디까지 썼는지. 줄 번호와 그 줄의 진행(0~1)이에요 */
    const penProgress = (doc: number, elapsed: number) => {
      const writing = elapsed - WRITING_TIMELINE.write - doc * WRITING_TIMELINE.docStagger;
      const written = writing / WRITING_TIMELINE.lineDuration;
      const line = Math.min(WRITING_LINES.length - 1, Math.max(0, Math.floor(written)));
      return { line, progress: clamp01(written - line), isDone: written >= WRITING_LINES.length };
    };

    const tick = (now: number) => {
      resize();
      if (!startedAt) startedAt = now;
      frame++;
      const elapsed = (now - startedAt) % WRITING_TIMELINE.cycle;
      const centerX = width / 2;
      const centerY = height / 2;
      const isWave = elapsed < WRITING_TIMELINE.split || elapsed >= WRITING_TIMELINE.gather;
      const bob = Math.sin(frame * 0.03) * 0.8;

      if (isWave) {
        const scale = waveBreath(frame * 1.6);
        for (let column = 0; column < WRITING_WAVE_COLUMNS; column++) {
          amplitudes[column] = waveAmplitude({ column, columns: WRITING_WAVE_COLUMNS, frame: frame * 1.4, maxAmplitude: WRITING_WAVE_AMPLITUDE, scale });
        }
      }
      const pens = WRITING_DOC_LAYOUT.map((_, doc) => penProgress(doc, elapsed));

      buckets.forEach((bucket) => (bucket.length = 0));
      particles.forEach((particle) => {
        let homeX: number;
        let homeY: number;
        let tealGoal = 0;

        if (isWave) {
          // 녹음 바와 같은 청록 파형
          const columnWidth = WRITING_WAVE_WIDTH / WRITING_WAVE_COLUMNS;
          homeX = centerX - WRITING_WAVE_WIDTH / 2 + (particle.column + 0.5 + particle.jitter) * columnWidth;
          homeY = centerY + particle.level * amplitudes[particle.column];
          tealGoal = 1;
        } else if (particle.line < 0) {
          // 문서 윤곽
          const point = roundedRectPoint({ ...WRITING_DOC, distance: particle.along });
          const local = {
            x: point.x - WRITING_DOC.width / 2 + point.nx * particle.offset,
            y: point.y - WRITING_DOC.height / 2 + point.ny * particle.offset,
          };
          ({ x: homeX, y: homeY } = placeOnDoc(particle.doc, local.x, local.y, centerX, centerY, bob));
        } else {
          const pen = pens[particle.doc];
          const isWritten = pen.isDone || particle.line < pen.line || (particle.line === pen.line && particle.along <= pen.progress);
          if (isWritten) {
            // 펜이 지나간 자리. 잉크로 가라앉아요
            const point = linePoint(particle.line, particle.along);
            ({ x: homeX, y: homeY } = placeOnDoc(particle.doc, point.x, point.y + particle.offset, centerX, centerY, bob));
          } else {
            // 아직 쓰지 않은 입자는 펜 끝에 작은 청록 구름으로 모여 함께 움직여요
            const tip = linePoint(pen.line, pen.progress);
            const wobble = Math.sin(frame * 0.5 + particle.along * 20) * 0.6;
            ({ x: homeX, y: homeY } = placeOnDoc(
              particle.doc,
              tip.x + particle.penX,
              tip.y - 2 + particle.penY + wobble,
              centerX,
              centerY,
              bob,
            ));
            tealGoal = 1;
          }
        }

        stepSpring({ particle, homeX, homeY, spring: 0.08, damping: 0.8, jitter: 0.1, forceX: 0, forceY: 0 });
        particle.teal += (tealGoal - particle.teal) * (tealGoal > particle.teal ? 0.2 : 0.06);

        // 청록 세 단계는 파형에서 막대 가운데일수록 진하게, 잉크 두 단계는 글줄이 진하고 윤곽이 옅어요
        if (particle.teal > 0.5) {
          const strength = isWave ? Math.abs(particle.level) : particle.penX * particle.penX + particle.penY * particle.penY > 4 ? 0.6 : 0.2;
          buckets[strength < 0.45 ? 0 : strength < 0.8 ? 1 : 2].push(particle);
        } else {
          buckets[particle.line < 0 ? 4 : 3].push(particle);
        }
      });

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      const colors = [...paletteRef.current.teal, ...paletteRef.current.ink];
      buckets.forEach((bucket, index) => {
        if (!bucket.length) return;
        context.fillStyle = colors[index];
        context.beginPath();
        bucket.forEach((particle) => {
          const radius = particle.size / 2;
          context.moveTo(particle.x + radius, particle.y);
          context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        });
        context.fill();
      });

      animation = requestAnimationFrame(tick);
    };

    animation = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animation);
  }, [canvasRef]);
};
