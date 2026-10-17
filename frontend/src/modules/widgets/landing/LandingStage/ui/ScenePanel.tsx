import styled from "@emotion/styled";
import type { ReactNode } from "react";

import { mobile, sceneFade } from "./SceneLayer";

interface ScenePanelProps {
  isOn: boolean;
  /** 제목 위의 작은 머리말 */
  eyebrow: string;
  /** 머리말 옆에 붙는 사용 단계 이름 */
  step?: string;
  title: ReactNode;
  children: ReactNode;
}

/**
 * 장면 왼쪽(모바일은 아래쪽)의 설명 글 묶음.
 *
 * 머리말, 제목, 본문 순서로 놓고, 장면에 들어설 때 살짝 떠오르며 나타나요.
 */
export default function ScenePanel({ isOn, eyebrow, step, title, children }: ScenePanelProps) {
  return (
    <Container $isOn={isOn} aria-hidden={!isOn} inert={!isOn}>
      <Eyebrow>
        {eyebrow}
        {step && <Step>{step}</Step>}
      </Eyebrow>
      <Title>{title}</Title>
      {children}
    </Container>
  );
}

const Container = styled.section<{ $isOn: boolean }>`
  ${({ $isOn }) => sceneFade({ isOn: $isOn })};
  position: absolute;
  top: 50%;
  left: 7%;
  display: flex;
  flex-direction: column;
  gap: 1.25rem; /* 20px */
  width: 26.25rem; /* 420px */
  transform: translateY(${({ $isOn }) => ($isOn ? "-50%" : "calc(-50% + 1.625rem)")});

  ${mobile} {
    top: auto;
    right: 6%;
    bottom: 6%;
    left: 6%;
    gap: 0.875rem; /* 14px */
    width: auto;
    transform: translateY(${({ $isOn }) => ($isOn ? "0" : "1.625rem")});
  }
`;

const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem; /* 10px */
  color: ${({ theme }) => theme.sub.accent[500]};
  ${({ theme }) => theme.text.caption02};
  font-weight: 600;

  &::before {
    content: "";
    width: 1.125rem; /* 18px */
    height: 1.5px;
    background-color: ${({ theme }) => theme.sub.accent[500]};
  }
`;

const Step = styled.span`
  margin-left: 0.5rem; /* 8px */
  color: ${({ theme }) => theme.neutral[800]};
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.title02};
  color: ${({ theme }) => theme.neutral[900]};

  ${mobile} {
    font-size: 1.75rem; /* 28px */
  }
`;

/** 설명 본문. 줄이 바뀌어도 뜻 덩어리가 끊기지 않게 `Phrase`로 나눠 넣어요. */
export const Lead = styled.p`
  ${({ theme }) => theme.text.body02};
  line-height: 1.6;
  color: ${({ theme }) => theme.neutral[700]};
  text-wrap: pretty;
  word-break: keep-all;

  ${mobile} {
    font-size: 0.9375rem; /* 15px */
  }
`;

export const Phrase = styled.span`
  white-space: nowrap;
`;

/** 본문 아래의 작은 덧붙임. 모바일에서는 자리가 좁아 숨겨요. */
export const Note = styled.p`
  ${({ theme }) => theme.text.caption02};
  line-height: 1.6;
  color: ${({ theme }) => theme.neutral[600]};

  ${mobile} {
    display: none;
  }
`;

/** 데스크톱에서만 보이는 요소. 모바일에서는 자리가 좁아 숨겨요. */
export const DesktopOnly = styled.span`
  ${mobile} {
    display: none;
  }
`;
