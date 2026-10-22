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
 * 랜딩 녹음 장면 그대로의 입자 파형.
 *
 * 96칸 막대가 저마다 다른 박자로 출렁이며 숨 쉬고, 마이크 소리가 들어오면 그만큼 더 크게 퍼져요.
 * 입자는 가운데가 빽빽하고 밝은 세 단계로 그려요. 독과 같은 Neutral 800 알약 위에 놓여요. 올리면 입자가 포인터를 피하고, 누르면 파동이 퍼져요.
 * 녹음 중임을 보여 주는 장식이라 낭독기에서는 숨겨요. 색은 테마의 Neutral 토큰이에요.
 */
export default function ParticleWaveform({ analyser, isActive, height }: ParticleWaveformProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 독과 같은 Neutral 800 알약 위에 놓이는 밝은 입자예요. 독 안의 녹음 칩, 접힌 독의 파형과 같은 색이에요
  const palette: [string, string, string, string] = [
    `rgba(${hexToRgb(theme.neutral[0])},0.95)`,
    `rgba(${hexToRgb(theme.neutral[200])},0.7)`,
    `rgba(${hexToRgb(theme.neutral[300])},0.4)`,
    `rgba(${hexToRgb(theme.neutral[400])},0.5)`,
  ];

  const { setPointer, clearPointer, pulse } = useParticleWaveform({ canvasRef, analyser, isActive, palette });

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
