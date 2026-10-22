import styled from "@emotion/styled";
import useTranscriptPanel from "@hooks/domain/document/useTranscriptPanel";

import TranscriptIcon from "@/assets/icons/transcript.svg";

/**
 * GNB 오른쪽에서 원문 패널을 여닫는 버튼.
 *
 * 아이콘만 두고, 이름은 `aria-label`(「원문 보기」/「원문 닫기」)과 `aria-expanded`로 알려요(DOC-R3).
 * 열려 있으면 채워진(Active) 모양이에요.
 * 문서를 보는 화면에만 놓는 일은 이 버튼을 놓는 쪽이 맡아요.
 */
export default function TranscriptToggle() {
  const { isTranscriptPanelOpen, toggleTranscriptPanel } = useTranscriptPanel();

  return (
    <Trigger
      type="button"
      aria-label={isTranscriptPanelOpen ? "원문 닫기" : "원문 보기"}
      aria-expanded={isTranscriptPanelOpen}
      $isOpen={isTranscriptPanelOpen}
      onClick={toggleTranscriptPanel}
    >
      <TranscriptIcon size={18} />
    </Trigger>
  );
}

/**
 * 피그마 Btn/원문: 36px 원. 닫힘은 Neutral/0에 테두리 Neutral/200, 열림은 Neutral/700, 그림자는 Shadow01.
 *
 * 피그마의 안쪽 여백 9px에는 테두리 1px이 들어 있어요. 테두리를 뺀 8px을 여백으로 둬야 아이콘 18px과 합쳐 36px이 돼요.
 */
const Trigger = styled.button<{ $isOpen: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem; /* 8px */
  border: 1px solid
    ${({ theme, $isOpen }) =>
      $isOpen ? theme.neutral[700] : theme.neutral[200]};
  border-radius: 62.4375rem; /* 999px */
  background-color: ${({ theme, $isOpen }) =>
    $isOpen ? theme.neutral[700] : theme.neutral[0]};
  color: ${({ theme, $isOpen }) =>
    $isOpen ? theme.neutral[0] : theme.neutral[600]};
  box-shadow: ${({ theme }) => theme.shadow01};
  transition:
    background-color 0.2s ease-in,
    color 0.2s ease-in;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }

  /* 손가락으로 누를 때는 보이는 크기(38px)는 그대로 두고 누르는 영역만 44px로 넓혀요(RESP-R9) */
  @media (pointer: coarse) {
    position: relative;

    &::after {
      position: absolute;
      inset: -0.1875rem; /* 3px */
      content: "";
    }
  }
`;
