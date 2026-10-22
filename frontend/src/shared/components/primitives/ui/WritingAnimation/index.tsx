import { useTheme } from "@emotion/react";
import styled from "@emotion/styled";
import { hexToRgb } from "@utils/hexToRgb";
import { useRef } from "react";

import WritingIllustration from "@/assets/illustrations/writing.svg";

import { WRITING_STAGE_HEIGHT, WRITING_STAGE_WIDTH } from "./constants/writingParticles";
import { useWritingParticles } from "./model/useWritingParticles";

/**
 * 회의 녹음이 주제별 문서로 정리되는 모습을 입자로 그리는 192×128 그림.
 *
 * 녹음 바와 같은 청록 입자 파형이 숨 쉬다가 문서 세 장으로 갈라지고, 문서마다 입자 펜이 글줄을 한 줄씩 써 내려가요.
 * 다 쓰면 잠깐 머물렀다가 다시 파형으로 모여 6.5초마다 되풀이해요. 랜딩과 독의 입자와 같은 규칙(스프링 복귀, 파형 공식)을 써요.
 * 움직임 줄이기(`prefers-reduced-motion: reduce`)를 켠 사용자에게는 펜이 글줄을 쓰는 멈춘 그림을 보여줘요.
 * 꾸밈용 그림이라 낭독기에서 읽지 않아요.
 *
 * @example
 * <IllustratedMessageLayout illustration={<WritingAnimation />} title={…} description={…} />
 */
export default function WritingAnimation() {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accent = hexToRgb(theme.sub.accent[500]);

  useWritingParticles({
    canvasRef,
    palette: {
      teal: [`rgba(${accent},0.92)`, `rgba(${accent},0.6)`, `rgba(${accent},0.32)`],
      ink: [`rgba(${hexToRgb(theme.primary)},0.88)`, `rgba(${hexToRgb(theme.neutral[500])},0.9)`],
    },
  });

  return (
    <Stage aria-hidden="true">
      <Canvas ref={canvasRef} />
      <StillImage />
    </Stage>
  );
}

const Stage = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${WRITING_STAGE_WIDTH / 16}rem; /* 192px */
  height: ${WRITING_STAGE_HEIGHT / 16}rem; /* 128px */
`;

const Canvas = styled.canvas`
  display: block;
  width: 100%;
  height: 100%;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

// <img>로 넣으면 SVG 안의 currentColor가 바깥 color를 받지 못해 검정이 되므로 svgr 컴포넌트로 넣어요
const StillImage = styled(WritingIllustration)`
  display: none;
  width: 4.5rem; /* 72px */
  height: 4.5rem;
  color: ${({ theme }) => theme.primary};

  @media (prefers-reduced-motion: reduce) {
    display: block;
  }
`;
