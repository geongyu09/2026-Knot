import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";

import MicIcon from "@/assets/icons/mic.svg";
import SpeechBubbleIcon from "@/assets/icons/speechBubble.svg";

import { DOCK_GUIDE_COPY } from "../constants/dockHint";

export type DockGuideKind = keyof typeof DOCK_GUIDE_COPY;

interface DockGuideProps {
  /** `first`는 채팅과 회의 녹음을 함께 설명하는 첫 사용 안내, `chat`과 `record`는 버튼에 올렸을 때의 한 줄 안내예요 */
  kind: DockGuideKind;
}

/**
 * 독 위에 떠서 채팅과 회의 녹음을 알려주는 말풍선. Figma Design System `Dock/Guide`예요.
 *
 * 독을 가리키는 꼬리가 아래에 달려 있어요. 읽기만 하는 안내라 포인터를 통과시켜 아래에 있는 독을 그대로 누를 수 있어요.
 * 첫 사용 안내는 560px 카드에 두 기능을 나란히 두고, 좁은 화면에서는 양옆 16px 안에서 줄바꿈하며 두 기능을 세로로 쌓아요.
 * 언제 띄울지는 `useDockHint`와 `useDockHoverGuide`가 정해요.
 */
export default function DockGuide({ kind }: DockGuideProps) {
  if (kind !== "first") {
    return <Line role="status">{DOCK_GUIDE_COPY[kind]}</Line>;
  }

  const { title, chat, record } = DOCK_GUIDE_COPY.first;

  return (
    <Card role="status">
      <Title>{title}</Title>
      <Features>
        <Feature>
          <SpeechBubbleIcon size={24} aria-hidden="true" />
          <FeatureText>
            <FeatureTitle>{chat.title}</FeatureTitle>
            <FeatureDescription>{chat.description}</FeatureDescription>
          </FeatureText>
        </Feature>
        <Feature>
          <MicIcon size={24} aria-hidden="true" />
          <FeatureText>
            <FeatureTitle>{record.title}</FeatureTitle>
            <FeatureDescription>{record.description}</FeatureDescription>
          </FeatureText>
        </Feature>
      </Features>
    </Card>
  );
}

const riseIn = keyframes`
  from {
    transform: translate(-50%, 0.5rem);
    opacity: 0;
  }

  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
`;

/** 꼬리(`::after`)는 밑변 16px·높이 10px 삼각형이라 말풍선 아래 가운데에서 독을 가리켜요 */
const Bubble = styled.div`
  position: absolute;
  bottom: calc(100% + 1.25rem); /* 꼬리 10px + 독과의 사이 10px */
  left: 50%;
  transform: translateX(-50%);
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
  pointer-events: none;
  animation: ${riseIn} 0.28s cubic-bezier(0.22, 1, 0.36, 1);

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border-right: 0.5rem solid transparent; /* 8px */
    border-left: 0.5rem solid transparent;
    border-top: 0.625rem solid ${({ theme }) => theme.neutral[0]}; /* 10px */
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Line = styled(Bubble.withComponent("p"))`
  padding: 0.75rem 1rem; /* 12px 16px */
  border-radius: 0.75rem; /* 12px */
  color: ${({ theme }) => theme.neutral[800]};
  white-space: nowrap;
  ${({ theme }) => theme.text.caption02};
`;

/** Figma 560×126. 좁은 화면에서는 양옆 16px을 남기고 줄어들어요 */
const Card = styled(Bubble)`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
  width: 35rem; /* 560px */
  max-width: calc(100vw - 2rem);
  padding: 1rem; /* 16px */
  border-radius: 1rem; /* 16px */
  text-align: left;
`;

const Title = styled.p`
  color: ${({ theme }) => theme.neutral[600]};
  ${({ theme }) => theme.text.caption02};
`;

/** 두 기능이 나란히 놓이고, 좁으면 세로로 쌓여요 */
const Features = styled.div`
  display: flex;
  gap: 1.5rem; /* 24px */

  @media (width < 37.5rem) {
    flex-direction: column;
    gap: 0.75rem; /* 12px */
  }
`;

const Feature = styled.div`
  display: flex;
  flex: 1;
  gap: 0.75rem; /* 12px */
  min-width: 0;
  color: ${({ theme }) => theme.neutral[800]};

  & > svg {
    flex-shrink: 0;
  }
`;

const FeatureText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem; /* 4px */
  min-width: 0;
`;

const FeatureTitle = styled.p`
  color: ${({ theme }) => theme.neutral[800]};
  ${({ theme }) => theme.text.caption02};
  font-weight: 500;
`;

const FeatureDescription = styled.p`
  color: ${({ theme }) => theme.neutral[500]};
  ${({ theme }) => theme.text.caption01};
`;
