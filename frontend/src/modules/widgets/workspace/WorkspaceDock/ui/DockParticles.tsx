import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useImperativeHandle, useRef, type Ref, type RefObject } from "react";

import { useDockParticles } from "../model/useDockParticles";

export interface DockParticlesHandle {
  /** 독 안의 한 점(독 왼쪽 위 기준 px)에서 입자가 터져 나와요 */
  burst: (x: number, y: number, count?: number) => void;
  /** 그 점에서 가장 가까운 테두리에서 출발해 실이 한 바퀴 돌아요. `strength`는 입자 수 배율이에요 */
  trace: (x: number, y: number, strength?: number) => void;
}

interface DockParticlesProps {
  /** 캔버스가 덮을 독 */
  barRef: RefObject<HTMLElement | null>;
  ref?: Ref<DockParticlesHandle>;
}

/**
 * 독 전체를 덮는 입자 캔버스.
 *
 * 독 테두리를 따라 옅은 입자 실이 흐르고, 녹음 버튼을 누르거나 독을 펼치고 보낼 때 잠깐 반응해요.
 * 독의 둥근 모서리를 그대로 따르고 포인터를 받지 않아요. 장식이라 낭독기에서 숨겨요.
 */
export default function DockParticles({ barRef, ref }: DockParticlesProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { burst, trace } = useDockParticles({
    canvasRef,
    barRef,
    palette: [
      `rgba(${hexToRgb(theme.neutral[0])},1)`,
      `rgba(${hexToRgb(theme.neutral[300])},1)`,
      `rgba(${hexToRgb(theme.sub.accent[200])},1)`,
      `rgba(${hexToRgb(theme.sub.accent[500])},1)`,
    ],
  });

  useImperativeHandle(ref, () => ({ burst, trace }), [burst, trace]);

  return <Canvas ref={canvasRef} aria-hidden="true" />;
}

const Canvas = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
`;
