import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useRef } from "react";

import { useParticleWaveform } from "./model/useParticleWaveform";

interface ParticleWaveformProps {
  /** 막대마다 소리 크기(0~1). 오른쪽 끝이 가장 새 소리예요 */
  levels: number[];
  /** 끝에서 이만큼은 아직 들어오지 않은 소리 자리라 가장 낮고 흐리게 둬요 */
  pendingCount?: number;
  /** `false`면 일시정지라 흐름을 멈추고 전부 흐리게 그려요 */
  isActive: boolean;
  /** 파형 높이(px). 소리가 가장 클 때 이 높이를 꽉 채워요 */
  height: number;
  /** 소리가 없을 때의 높이(px) */
  minHeight: number;
  /** 막대 하나의 폭(px). 막대 수와 곱해 파형 폭이 돼요 */
  columnWidth: number;
}

/** `#3C3B39` 같은 색상 토큰을 `rgba()`에 넣을 `60,59,57` 꼴로 바꿔요. */
const toRgb = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(",");

/**
 * 랜딩 녹음 장면 같은 입자 파형.
 *
 * 막대 대신 입자가 세로로 퍼져 소리 크기를 보여 주고, 새 소리가 오른쪽에서 들어와 왼쪽으로 흘러가요.
 * 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요. 색은 테마의 Neutral 토큰이에요.
 */
export default function ParticleWaveform({
  levels,
  pendingCount = 0,
  isActive,
  height,
  minHeight,
  columnWidth,
}: ParticleWaveformProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ink = hexToRgb(theme.neutral[800]);

  useParticleWaveform({
    canvasRef,
    levels,
    pendingCount,
    isActive,
    minHeight,
    maxHeight: height,
    palette: [`rgba(${ink},0.9)`, `rgba(${ink},0.55)`, `rgba(${ink},0.28)`, `rgba(${hexToRgb(theme.neutral[400])},0.5)`],
  });

  return (
    <Canvas
      ref={canvasRef}
      aria-hidden="true"
      $width={(levels.length + pendingCount) * columnWidth}
      $height={height}
    />
  );
}

const Canvas = styled.canvas<{ $width: number; $height: number }>`
  display: block;
  flex-shrink: 0;
  width: ${({ $width }) => `${$width / 16}rem`};
  height: ${({ $height }) => `${$height / 16}rem`};
`;
