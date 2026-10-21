import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useImperativeHandle, useRef, type ReactNode, type Ref } from "react";

import { useParticleIcon } from "./model/useParticleIcon";
import type { ParticleIconHandle } from "./types/particleIcon";

export type { ParticleIconHandle } from "./types/particleIcon";

interface ParticleIconProps {
  /** 진짜 아이콘(svg). 입자가 모이는 동안 숨겼다가 자리를 잡으면 보여요 */
  children: ReactNode;
  /** 24×24 좌표계에 아이콘과 같은 모양을 그려요. 입자가 모일 자리를 뽑는 데 써요 */
  draw: (context: CanvasRenderingContext2D) => void;
  /** 아이콘 한 변(px) */
  size: number;
  /** 어두운 바탕이면 밝은 입자, 밝은 바탕이면 잉크색 입자로 그려요 */
  isOnDark?: boolean;
  /** `assemble()`, `wake()`로 움직임을 시작할 수 있어요 */
  ref?: Ref<ParticleIconHandle>;
}

/** `#3C3B39` 같은 색상 토큰을 `rgba()`에 넣을 `60,59,57` 꼴로 바꿔요. */
const toRgb = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(",");

/**
 * 입자로 모였다가 진짜 아이콘이 되는 아이콘.
 *
 * 평소엔 넘겨받은 아이콘이 그대로 보이고, `assemble()`을 부르면 입자가 위에서 떨어져 아이콘 모양으로
 * 모인 뒤 진짜 아이콘으로 바뀌어요. `wake()`는 아이콘이 잠깐 입자로 풀렸다 다시 모여요.
 * 랜딩이 입자로 글자를 만든 뒤 진짜 글자로 바꾸는 방식과 같아요. 캔버스는 장식이라 낭독기에서 숨겨요.
 */
export default function ParticleIcon({ children, draw, size, isOnDark = true, ref }: ParticleIconProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const light = hexToRgb(theme.neutral[300]);
  const ink = hexToRgb(theme.neutral[800]);

  const { assemble, wake } = useParticleIcon({
    canvasRef,
    iconRef,
    draw,
    size,
    palette: isOnDark ? [`rgba(${light},0.95)`, `rgba(${light},0.6)`] : [`rgba(${ink},0.9)`, `rgba(${ink},0.55)`],
  });

  useImperativeHandle(ref, () => ({ assemble, wake }), [assemble, wake]);

  return (
    <Root $size={size}>
      <Icon ref={iconRef}>{children}</Icon>
      <Canvas ref={canvasRef} aria-hidden="true" />
    </Root>
  );
}

const Root = styled.span<{ $size: number }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${({ $size }) => `${$size / 16}rem`};
  height: ${({ $size }) => `${$size / 16}rem`};
`;

const Icon = styled.span`
  display: flex;
  transition: opacity 0.12s;
`;

/** 입자가 아이콘 위로 넘쳐도 보이도록 아이콘보다 넓게 덮어요 */
const Canvas = styled.canvas`
  position: absolute;
  inset: -0.5rem; /* -8px */
  width: calc(100% + 1rem);
  height: calc(100% + 1rem);
  pointer-events: none;
`;
