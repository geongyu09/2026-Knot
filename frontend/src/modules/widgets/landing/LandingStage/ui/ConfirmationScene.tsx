import styled from "@emotion/styled";
import { useState, type Ref } from "react";

import CheckIcon from "@/assets/icons/check.svg";

import DocumentCard from "./DocumentCard";
import ScenePanel, { Lead, Phrase } from "./ScenePanel";
import SceneLayer, { focusRing, interactive, mobile } from "./SceneLayer";

/** 예시 문서를 이미 확인한 사람 수. 확인했어요를 누르면 한 명 늘어요. */
const CONFIRMED_COUNT = 3;

interface ConfirmationSceneProps {
  isOn: boolean;
  isRevealed: boolean;
  confirmationRef: Ref<HTMLDivElement>;
}

/** 사용법 03. 참석자가 문서를 읽고 확인했어요를 누르는 장면. 버튼을 직접 눌러 볼 수 있어요. */
export default function ConfirmationScene({ isOn, isRevealed, confirmationRef }: ConfirmationSceneProps) {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const isCardRevealed = isOn && isRevealed;

  return (
    <>
      <ScenePanel
        isOn={isOn}
        eyebrow="사용법 03"
        step="확인하기"
        title={
          <>
            읽었다면,
            <br />
            확인했어요 한 번.
          </>
        }
      >
        <Lead>
          <Phrase>참석자는 문서마다</Phrase> <Phrase>확인했어요를 눌러요.</Phrase>{" "}
          <Phrase>누가 확인했는지 보여서,</Phrase> <Phrase>모두가 아는 결정으로 남아요.</Phrase>
        </Lead>
      </ScenePanel>

      <Mock isOn={isOn} ref={confirmationRef}>
        <DocumentCard
          isLarge
          title="회원 탈퇴 정책"
          date="2026년 9월 15일"
          duration="32분"
          sections={[
            { label: "결정", text: "게시글은 유지하고, 작성자는 ‘탈퇴한 사용자’로 표시해요" },
            { label: "이유", text: "글이 사라지면 대화 흐름이 끊겨요" },
            { label: "미결정 항목", text: "첨부파일 유지 여부" },
          ]}
          footer={`${CONFIRMED_COUNT + (isConfirmed ? 1 : 0)}명 확인했어요`}
          action={
            <ConfirmButton
              type="button"
              data-sand="o"
              aria-pressed={isConfirmed}
              $isOn={isOn}
              $isRevealed={isCardRevealed}
              $isConfirmed={isConfirmed}
              onClick={() => setIsConfirmed((previous) => !previous)}
            >
              <CheckIcon aria-hidden />
              <span>확인했어요</span>
            </ConfirmButton>
          }
          isRevealed={isCardRevealed}
          style={{ width: "31.25rem" /* 500px */ }}
        />
      </Mock>
    </>
  );
}

const Mock = styled(SceneLayer)`
  position: absolute;
  top: 20%;
  left: calc(69% - 15.625rem); /* 250px */

  ${mobile} {
    top: 8%;
    left: 50%;
    transform: translateX(-50%) scale(0.68);
    transform-origin: top center;
  }
`;

const ConfirmButton = styled.button<{ $isOn: boolean; $isRevealed: boolean; $isConfirmed: boolean }>`
  ${({ $isOn }) => interactive({ isOn: $isOn })};
  display: flex;
  align-items: center;
  gap: 0.375rem; /* 6px */
  padding: 0.625rem 1.125rem; /* 10px 18px */
  border-radius: 0.75rem; /* 12px */
  ${({ theme }) => theme.text.label01};
  background-color: ${({ theme, $isRevealed, $isConfirmed }) =>
    !$isRevealed ? "transparent" : $isConfirmed ? theme.neutral[100] : theme.primary};
  color: ${({ theme, $isRevealed, $isConfirmed }) =>
    $isRevealed && !$isConfirmed ? theme.neutral[0] : theme.neutral[800]};
  transition:
    background-color 0.25s,
    color 0.25s;
  ${({ theme }) => focusRing(theme)};

  svg,
  span {
    opacity: ${({ $isRevealed }) => ($isRevealed ? 1 : 0)};
    transition: opacity 0.7s;
  }

  svg {
    width: 1rem; /* 16px */
    height: 1rem;
  }
`;
