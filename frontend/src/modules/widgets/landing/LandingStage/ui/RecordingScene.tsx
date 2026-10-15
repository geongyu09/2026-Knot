import { keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import { formatRecordingTime } from "@utils/formatRecordingTime";

import ScenePanel, { Lead, Note, Phrase } from "./ScenePanel";
import SceneLayer, { mobile } from "./SceneLayer";

interface RecordingSceneProps {
  isOn: boolean;
  /** 장면에 들어선 뒤 흐른 시간(초). 녹음 중인 것처럼 시간이 올라가요. */
  recordingSeconds: number;
}

/** 사용법 01. 마이크 하나로 녹음을 시작하는 장면. 오른쪽에는 소리에 맞춰 움직이는 파형이 그려져요. */
export default function RecordingScene({ isOn, recordingSeconds }: RecordingSceneProps) {
  return (
    <>
      <ScenePanel
        isOn={isOn}
        eyebrow="사용법 01"
        step="녹음하기"
        title={
          <>
            마이크를 누르면
            <br />
            기록이 시작돼요.
          </>
        }
      >
        <Lead>
          <Phrase>화면 아래 독의 마이크 하나면 돼요.</Phrase>
          <br />
          <Phrase>모두가 이야기하는 동안,</Phrase> <Phrase>받아 적는 일은 knot이 맡아요.</Phrase>
        </Lead>
        <Note>녹음 중에도 다른 화면으로 이동하거나 질문할 수 있어요.</Note>
      </ScenePanel>

      <Dock isOn={isOn}>
        <Recorder>
          <RecordingDot />
          <Name>유월 님의 녹음</Name>
        </Recorder>
        <Time>{formatRecordingTime(recordingSeconds)}</Time>
      </Dock>
    </>
  );
}

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

const Dock = styled(SceneLayer)`
  position: absolute;
  top: 73%;
  left: calc(70% - 8.125rem); /* 130px */
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 16.25rem; /* 260px */
  height: 3.25rem; /* 52px */
  padding: 0 1.25rem; /* 20px */
  border-radius: 1.625rem; /* 26px */
  background-color: ${({ theme }) => theme.neutral[800]};
  box-shadow: ${({ theme }) => theme.shadow02};

  ${mobile} {
    top: 44%;
    left: calc(50% - 8.125rem);
  }
`;

const Recorder = styled.span`
  display: flex;
  align-items: center;
  gap: 0.625rem; /* 10px */
`;

const RecordingDot = styled.span`
  width: 0.5rem; /* 8px */
  height: 0.5rem;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.sub.warning[600]};
  animation: ${blink} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const Name = styled.span`
  ${({ theme }) => theme.text.caption02};
  font-weight: 500;
  color: ${({ theme }) => theme.neutral[50]};
`;

const Time = styled.span`
  ${({ theme }) => theme.text.caption02};
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.neutral[300]};
`;
