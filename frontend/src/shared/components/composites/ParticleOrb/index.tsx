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
  /** 캔버스 가로(px). 넘기지 않으면 `size`와 같아요. 파형처럼 옆으로 긴 모양에 써요 */
  width?: number;
  /** 입자가 모이는 모양. 올렸을 때 `mic`이나 `arrow`로 바꾸면 그 모양으로 모였다가 `disc`나 `cloud`로 돌리면 흩어져 돌아와요 */
  shape?: ParticleOrbShape;
  /** `idle`은 녹음 전의 붉은빛, `neutral`은 어두운 바탕 위의 밝은 회색이에요 */
  tone?: ParticleOrbTone;
  /** 마이크 소리를 읽는 분석기. 목소리만큼 입자가 파형으로 펼쳐지거나 커져요 */
  analyser?: AnalyserNode | null;
  /** `false`면 소리를 읽지 않아요(일시정지) */
  isActive?: boolean;
  /** `true`면 결과를 기다리는 중이라 구슬이 빠르게 돌며 숨을 크게 쉬어요. 녹음 버튼을 누른 뒤 녹음이 열릴 때까지 써요 */
  isWaiting?: boolean;
  /** `pulse()`로 파동을 퍼뜨리고 `scatter()`로 입자를 살짝 흩뜨릴 수 있어요 */
  ref?: Ref<ParticleOrbHandle>;
}

/**
 * 랜딩의 입자로 만든 작은 구슬.
 *
 * 독의 녹음 버튼·녹음 칩·채팅 버튼이 써요. 입자 수백 개가 구름 같은 구를 이루며 천천히 돌고 숨 쉬거나, 녹음 버튼·파형·말풍선·마이크·화살표 모양으로 모여요.
 * 녹음 버튼은 평소엔 고리 안에 붉은 원이 든 녹음 버튼(`disc`)이고 올리면 원이 입자로 분해됐다가 마이크로 모여요.
 * 녹음 칩은 밝은 입자 구름 파형(`wave`)이 소리 크기의 흐름을 보여 주고(조용하면 가는 선), 올리면 화살표로 모여요. 채팅 버튼은 올리면 점이 튀는 말풍선으로 바뀌어요.
 * 누르면 파동이 퍼져요. 입자는 구슬 크기에 맞춰 잘고 둥글게 그려 작은 자리에서도 모자이크처럼 보이지 않아요.
 * 장식이라 낭독기에서는 읽지 않아요. 접근성 이름은 감싸는 버튼이 가져요.
 * 색은 테마의 Warning(녹음 전)과 Neutral(독 안의 밝은 입자) 토큰을 써요.
 */
export default function ParticleOrb({
  radius,
  size,
  width = size,
  shape = "cloud",
  tone = "idle",
  analyser = null,
  isActive = true,
  isWaiting = false,
  ref,
}: ParticleOrbProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 녹음 전엔 한눈에 「녹음」으로 읽히도록 붉은 톤을 넓게 써요. 원과 마이크는 같은 붉은색이고, 빛 받는 면만 옅은 분홍이에요
  const idlePalette: ParticleOrbPalette = [
    `rgba(${hexToRgb(theme.sub.warning[200])},0.9)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.75)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.96)`,
    `rgba(${hexToRgb(theme.sub.warning[700])},0.85)`,
    `rgba(${hexToRgb(theme.sub.warning[800])},0.75)`,
    `rgba(${hexToRgb(theme.sub.warning[600])},0.14)`,
  ];
  const neutralPalette: ParticleOrbPalette = [
    `rgba(${hexToRgb(theme.neutral[0])},0.95)`,
    `rgba(${hexToRgb(theme.neutral[200])},0.85)`,
    `rgba(${hexToRgb(theme.neutral[300])},0.8)`,
    `rgba(${hexToRgb(theme.neutral[400])},0.7)`,
    `rgba(${hexToRgb(theme.neutral[500])},0.6)`,
    `rgba(${hexToRgb(theme.neutral[0])},0.14)`,
  ];

  const { pulse, scatter } = useParticleOrb({
    canvasRef,
    radius,
    shape,
    tone,
    analyser,
    isActive,
    isWaiting,
    idlePalette,
    neutralPalette,
    discRgb: hexToRgb(theme.sub.warning[600]),
  });

  useImperativeHandle(ref, () => ({ pulse, scatter }), [pulse, scatter]);

  return <Canvas ref={canvasRef} aria-hidden="true" $width={width} $height={size} />;
}

const Canvas = styled.canvas<{ $width: number; $height: number }>`
  display: block;
  width: ${({ $width }) => `${$width / 16}rem`};
  height: ${({ $height }) => `${$height / 16}rem`};
  pointer-events: none;
`;
