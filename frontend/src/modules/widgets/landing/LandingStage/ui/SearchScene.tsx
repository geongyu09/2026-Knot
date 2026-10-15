import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { Fragment, type Ref } from "react";

import ChatListIcon from "@/assets/icons/chatList.svg";
import FileIcon from "@/assets/icons/file.svg";
import SendIcon from "@/assets/icons/send.svg";

import { SAMPLE_QUESTIONS } from "../constants/landing";
import type { GraphLabel } from "../types/particle";

import ScenePanel, { Lead, Phrase } from "./ScenePanel";
import SceneLayer, { focusRing, interactive, mobile } from "./SceneLayer";

interface SearchSceneProps {
  isOn: boolean;
  questionIndex: number;
  /** 입력창에 지금까지 쳐진 질문 */
  typedText: string;
  /** 연결망을 따라 답을 다 찾아 답변을 보여도 되는지 */
  isAnswerReady: boolean;
  labels: GraphLabel[];
  questionInputRef: Ref<HTMLDivElement>;
  onQuestionSelect: (index: number) => void;
}

/**
 * 사용법 04. 질문하면 문서 연결망을 따라 답과 근거를 찾아 주는 장면.
 *
 * 예시 질문을 고르면 입력창에 질문이 쳐지고, 질문 점에서 답이 되는 문서까지 빛이 번진 뒤 답변이 나타나요.
 */
export default function SearchScene({
  isOn,
  questionIndex,
  typedText,
  isAnswerReady,
  labels,
  questionInputRef,
  onQuestionSelect,
}: SearchSceneProps) {
  const question = SAMPLE_QUESTIONS[questionIndex];
  const isTyping = !!typedText && !isAnswerReady;

  return (
    <>
      <ScenePanel
        isOn={isOn}
        eyebrow="사용법 04"
        step="찾아보기"
        title={
          <>
            “그거 어떻게
            <br />
            하기로 했더라?”
          </>
        }
      >
        <DesktopLead>
          <Phrase>물어보면 문서를 따라가 답하고,</Phrase> <Phrase>근거가 된 기록까지 보여 줘요.</Phrase>
        </DesktopLead>
        <QuestionList>
          {SAMPLE_QUESTIONS.map(({ text }, index) => (
            <QuestionButton
              key={text}
              type="button"
              aria-pressed={index === questionIndex}
              $isOn={isOn}
              onClick={() => onQuestionSelect(index)}
            >
              {text}
            </QuestionButton>
          ))}
        </QuestionList>
        <Answer $isShown={isAnswerReady} aria-live="polite">
          <AnswerText>
            {question.answer.split("|").map((phrase, index) => (
              <Fragment key={phrase}>
                {index > 0 && " "}
                <Phrase>{phrase}</Phrase>
              </Fragment>
            ))}
          </AnswerText>
          <Source>
            <FileIcon aria-hidden />
            <span>{question.found}</span>
          </Source>
        </Answer>
      </ScenePanel>

      <LabelLayer isOn={isOn} aria-hidden>
        {labels.map((label) => (
          <DocumentLabel
            key={label.text}
            $isTitle={label.questionIndex >= 0}
            $isLit={isAnswerReady && label.questionIndex === questionIndex}
            style={{ left: label.x, top: label.y, lineHeight: `${label.height}px` }}
          >
            {label.text}
          </DocumentLabel>
        ))}
      </LabelLayer>

      <QuestionInput isOn={isOn} ref={questionInputRef} aria-hidden>
        <ChatListIcon aria-hidden />
        <InputText $isTyping={isTyping}>
          {typedText || "무엇이든 요청하세요"}
          <Caret $isShown={isTyping} />
        </InputText>
        <SendButton $isDone={isAnswerReady}>
          <SendIcon aria-hidden />
        </SendButton>
      </QuestionInput>
    </>
  );
}

const blink = keyframes`
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

const DesktopLead = styled(Lead)`
  ${mobile} {
    display: none;
  }
`;

const LabelLayer = styled(SceneLayer)`
  position: absolute;
  inset: 0;
`;

const QuestionList = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem; /* 8px */
`;

const QuestionButton = styled.button<{ $isOn: boolean }>`
  ${({ $isOn }) => interactive({ isOn: $isOn })};
  min-height: 2.75rem; /* 44px */
  padding: 0 1rem; /* 16px */
  border-radius: 999px;
  ${({ theme }) => theme.text.caption02};
  font-weight: 500;
  text-align: left;
  background-color: ${({ theme }) => theme.neutral[0]};
  color: ${({ theme }) => theme.neutral[800]};
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.neutral[300]};
  transition:
    background-color 0.25s,
    color 0.25s,
    box-shadow 0.25s;
  ${({ theme }) => focusRing(theme)};

  &[aria-pressed="true"] {
    background-color: ${({ theme }) => theme.primary};
    color: ${({ theme }) => theme.neutral[50]};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.primary};
  }

  ${mobile} {
    min-height: 2.5rem; /* 40px */
    font-size: 0.8125rem; /* 13px */
  }
`;

const Answer = styled.div<{ $isShown: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.625rem; /* 10px */
  padding: 1.125rem 1.25rem; /* 18px 20px */
  border-radius: 1rem; /* 16px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
  opacity: ${({ $isShown }) => ($isShown ? 1 : 0)};
  transform: ${({ $isShown }) => ($isShown ? "none" : "translateY(0.625rem)")};
  transition:
    opacity 0.5s,
    transform 0.5s;

  ${mobile} {
    padding: 0.875rem 1rem; /* 14px 16px */
  }
`;

const AnswerText = styled.p`
  ${({ theme }) => theme.text.body01};
  line-height: 1.6;
  color: ${({ theme }) => theme.neutral[900]};
`;

const Source = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem; /* 6px */
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[600]};

  svg {
    width: 0.875rem; /* 14px */
    height: 0.875rem;
  }
`;

const DocumentLabel = styled.span<{ $isTitle: boolean; $isLit: boolean }>`
  position: absolute;
  white-space: nowrap;
  ${({ theme }) => theme.text.caption01};
  font-weight: ${({ $isTitle }) => ($isTitle ? 600 : 400)};
  color: ${({ theme, $isTitle, $isLit }) =>
    $isLit ? theme.sub.accent[500] : $isTitle ? theme.neutral[800] : theme.neutral[600]};
  transition: color 0.4s;
`;

const QuestionInput = styled(SceneLayer)`
  position: absolute;
  top: 76%;
  left: calc(69% - 17.5rem); /* 280px */
  display: flex;
  align-items: center;
  gap: 0.75rem; /* 12px */
  width: 35rem; /* 560px */
  height: 3.5rem; /* 56px */
  padding: 0 0.75rem 0 1.25rem; /* 0 12px 0 20px */
  border-radius: 1.75rem; /* 28px */
  background-color: ${({ theme }) => theme.neutral[800]};
  box-shadow: ${({ theme }) => theme.shadow02};
  color: ${({ theme }) => theme.neutral[300]};

  > svg {
    flex-shrink: 0;
    width: 1.125rem; /* 18px */
    height: 1.125rem;
  }

  ${mobile} {
    top: 40%;
    right: 6%;
    left: 6%;
    width: auto;
    height: 3rem; /* 48px */
  }
`;

const InputText = styled.p<{ $isTyping: boolean }>`
  flex-grow: 1;
  overflow: hidden;
  ${({ theme }) => theme.text.body01};
  color: ${({ theme, $isTyping }) => ($isTyping ? theme.neutral[50] : theme.neutral[400])};
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const Caret = styled.span<{ $isShown: boolean }>`
  display: inline-block;
  width: 1.5px;
  height: 1rem; /* 16px */
  margin-left: 0.125rem; /* 2px */
  vertical-align: -0.1875rem; /* -3px */
  background-color: ${({ theme }) => theme.neutral[50]};
  opacity: ${({ $isShown }) => ($isShown ? 1 : 0)};
  animation: ${blink} 1s step-end infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const SendButton = styled.span<{ $isDone: boolean }>`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 2.125rem; /* 34px */
  height: 2.125rem;
  border-radius: 50%;
  background-color: ${({ theme, $isDone }) => ($isDone ? theme.sub.accent[500] : theme.neutral[600])};
  color: ${({ theme }) => theme.neutral[50]};
  transition: background-color 0.3s;

  svg {
    width: 1rem; /* 16px */
    height: 1rem;
  }
`;
