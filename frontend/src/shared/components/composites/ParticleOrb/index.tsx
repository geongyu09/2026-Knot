import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useImperativeHandle, useRef, type Ref } from "react";

import { useParticleOrb } from "./model/useParticleOrb";
import type {
  ParticleOrbHandle,
  ParticleOrbPalette,
  ParticleOrbShape,
  ParticleOrbTone,
} from "./types/particleOrb";

export type { ParticleOrbHandle, ParticleOrbShape, ParticleOrbTone } from "./types/particleOrb";

interface ParticleOrbProps {
  /** 구슬의 반지름(px) */
  radius: number;
  /** 캔버스 한 변(px). 마이크 모양은 구슬보다 크므로 반지름의 네 배쯤 둬요 */
  size: number;
  /** 입자가 모이는 모양. 올렸을 때 `mic`으로 바꾸면 입자가 마이크로 모였다가 `cloud`로 돌리면 흩어져 돌아와요 */
  shape?: ParticleOrbShape;
  /** `idle`은 녹음 전의 붉은빛, `recording`은 녹음 중의 청록빛이에요 */
  tone?: ParticleOrbTone;
  /** 마이크 소리를 읽는 분석기. 녹음 톤에서 목소리만큼 입자가 파형으로 펼쳐져요 */
  analyser?: AnalyserNode | null;
  /** `false`면 소리를 읽지 않아요(일시정지) */
  isActive?: boolean;
  /** `pulse()`로 파동을 퍼뜨릴 수 있어요 */
  ref?: Ref<ParticleOrbHandle>;
}

/** `#3C3B39` 같은 색상 토큰을 `rgba()`에 넣을 `60,59,57` 꼴로 바꿔요. */
const toRgb = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(",");

/**
 * 랜딩의 입자로 만든 작은 구슬.
 *
 * 녹음 버튼처럼 소리를 다루는 자리에 둬요. 입자 수백 개가 구름 같은 구를 이루며 천천히 돌고 숨 쉬어요.
 * 올리면 마이크 모양으로 모이고, 누르면 파동이 퍼지고, 녹음 중엔 목소리가 들어올 때마다 파형으로 펼쳐져요.
 * 장식이라 낭독기에서는 읽지 않아요. 접근성 이름은 감싸는 버튼이 가져요.
 * 색은 테마의 Warning(녹음 전)과 Accent(녹음 중) 토큰을 써요.
 */
export default function ParticleOrb({
  radius,
  size,
  shape = "cloud",
  tone = "idle",
  analyser = null,
  isActive = true,
  ref,
}: ParticleOrbProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 녹음 전엔 한눈에 「녹음」으로 읽히도록 붉은 톤을 넓게 써요. 빛 받는 면만 옅은 분홍이에요
  const idlePalette: ParticleOrbPalette = [
    `rgba(${hexToRgb(theme.sub.warning[200])},0.95)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.9)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.95)`,
    `rgba(${hexToRgb(theme.sub.warning[700])},0.95)`,
    `rgba(${hexToRgb(theme.sub.warning[800])},0.9)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.16)`,
  ];
  const recordingPalette: ParticleOrbPalette = [
    `rgba(${hexToRgb(theme.neutral[0])},0.95)`,
    `rgba(${hexToRgb(theme.sub.accent[100])},0.85)`,
    `rgba(${hexToRgb(theme.sub.accent[200])},0.9)`,
    `rgba(${hexToRgb(theme.sub.accent[500])},0.95)`,
    `rgba(${hexToRgb(theme.sub.accent[700])},0.9)`,
    `rgba(${hexToRgb(theme.neutral[0])},0.14)`,
  ];

  const { pulse } = useParticleOrb({
    canvasRef,
    radius,
    shape,
    tone,
    analyser,
    isActive,
    idlePalette,
    recordingPalette,
    haloRgb: hexToRgb(theme.sub.accent[500]),
  });

  useImperativeHandle(ref, () => ({ pulse }), [pulse]);

  return <Canvas ref={canvasRef} aria-hidden="true" $size={size} />;
}

const Canvas = styled.canvas<{ $size: number }>`
  display: block;
  width: ${({ $size }) => `${$size / 16}rem`};
  height: ${({ $size }) => `${$size / 16}rem`};
  pointer-events: none;
`;
