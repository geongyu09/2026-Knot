import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import GithubLoginButton from "@features/auth/GithubLoginButton";

import ChevronDownIcon from "@/assets/icons/chevronDown.svg";

import { DesktopOnly, Lead, Phrase } from "./ScenePanel";
import { interactive, mobile, sceneFade, visuallyHidden } from "./SceneLayer";

interface IntroSceneProps {
  isOn: boolean;
}

/**
 * 첫 장면. 워드마크 아래에 슬로건과 서비스 설명, 바로 시작하는 버튼을 함께 보여 줘요.
 *
 * 긴 도입 연출로 설명과 시작 버튼을 가리지 않도록, 첫 화면에서 바로 모두 보이게 둡니다.
 */
export default function IntroScene({ isOn }: IntroSceneProps) {
  return (
    <Container $isOn={isOn} aria-hidden={!isOn} inert={!isOn}>
      <ServiceName>knot</ServiceName>
      <Slogan>팀의 결정을 모두의 기억으로</Slogan>
      <Lead>
        <Phrase>회의를 녹음하면</Phrase> <Phrase>결정만 골라</Phrase> <Phrase>주제별 문서로 정리해요.</Phrase>
        <DesktopOnly>
          <br />
        </DesktopOnly>{" "}
        <Phrase>나중에 물어보면</Phrase> <Phrase>근거와 함께 다시 찾아 줘요.</Phrase>
      </Lead>
      <StartWrapper $isOn={isOn}>
        <GithubLoginButton />
      </StartWrapper>
      <ScrollHint>
        <span>스크롤하면 한 장씩 넘어가요</span>
        <BobbingIcon aria-hidden />
      </ScrollHint>
    </Container>
  );
}

const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(5px); }
`;

const Container = styled.section<{ $isOn: boolean }>`
  ${({ $isOn }) => sceneFade({ isOn: $isOn })};
  position: absolute;
  top: 46%;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.875rem; /* 14px */
  padding: 0 1.5rem;
  text-align: center;

  ${mobile} {
    top: 33%;
  }
`;

const ServiceName = styled.h1`
  ${visuallyHidden};
`;

const Slogan = styled.p`
  ${({ theme }) => theme.text.title02};
  color: ${({ theme }) => theme.neutral[900]};

  ${mobile} {
    font-size: 1.75rem; /* 28px */
  }
`;

/** 시작 버튼의 너비. 로그인 화면과 같은 버튼을 화면 가운데에 알맞은 폭으로 놓아요. */
const StartWrapper = styled.div<{ $isOn: boolean }>`
  ${({ $isOn }) => interactive({ isOn: $isOn })};
  width: 100%;
  max-width: 20rem; /* 320px */
  margin-top: 0.875rem; /* 14px */
`;

const ScrollHint = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem; /* 6px */
  margin-top: 1.75rem; /* 28px */
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[400]};
`;

const BobbingIcon = styled(ChevronDownIcon)`
  width: 0.875rem; /* 14px */
  height: 0.875rem;
  animation: ${bob} 2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
