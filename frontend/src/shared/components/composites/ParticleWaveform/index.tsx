import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useRef, type PointerEvent } from "react";

import { useParticleWaveform } from "./model/useParticleWaveform";

interface ParticleWaveformProps {
  /** 마이크 소리를 읽는 분석기. 없으면 숨만 쉬어요 */
  analyser: AnalyserNode | null;
  /** `false`면 일시정지라 숨을 멈추고 옅은 색으로 그려요 */
  isActive: boolean;
  /** 파형 높이(px). 폭은 놓인 자리를 다 채워요 */
  height: number;
}

/**
 * 소리 크기의 흐름을 보여 주는 입자 파형.
 *
 * 오른쪽 끝이 지금 소리이고 50ms마다 한 칸씩 왼쪽으로 흘러가요. 조용하면 가는 선만 남고, 말하면 그 순간의 자리만 소리만큼 커져요.
 * 입자는 가운데가 빽빽하고 잉크 세 단계로 그려요. 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요.
 * 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요. 색은 테마의 Neutral 토큰이에요.
 */
export default function ParticleWaveform({ analyser, isActive, height }: ParticleWaveformProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ink = hexToRgb(theme.neutral[800]);
  const strong = hexToRgb(theme.neutral[900]);

  const { setPointer, clearPointer, pulse } = useParticleWaveform({
    canvasRef,
    analyser,
    isActive,
    palette: [`rgba(${strong},0.9)`, `rgba(${ink},0.6)`, `rgba(${ink},0.32)`, `rgba(${hexToRgb(theme.neutral[400])},0.55)`],
  });

  const toCanvas = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
  };

  return (
    <Canvas
      ref={canvasRef}
      aria-hidden="true"
      $height={height}
      onPointerMove={(event) => {
        const point = toCanvas(event);
        setPointer(point.x, point.y);
      }}
      onPointerLeave={clearPointer}
      onPointerDown={(event) => {
        const point = toCanvas(event);
        pulse(point.x, point.y, point.width, point.height);
      }}
    />
  );
}

const Canvas = styled.canvas<{ $height: number }>`
  display: block;
  flex: 1;
  min-width: 0;
  height: ${({ $height }) => `${$height / 16}rem`};
`;
