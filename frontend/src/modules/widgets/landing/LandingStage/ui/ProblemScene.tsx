import styled from "@emotion/styled";

import ScenePanel, { Lead, Phrase } from "./ScenePanel";
import { mobile } from "./SceneLayer";

const PAINS = ["받아 적느라 대화에 끼지 못해요", "결정이 날짜별 기록 속에 묻혀요", "결국 같은 이야기를 또 나눠요"];

interface ProblemSceneProps {
  isOn: boolean;
}

/** 누구의 어떤 문제를 푸는 서비스인지 알려 주는 장면 */
export default function ProblemScene({ isOn }: ProblemSceneProps) {
  return (
    <ScenePanel
      isOn={isOn}
      eyebrow="누구를 위한 서비스인가요"
      title={
        <>
          정한 건 많은데,
          <br />
          남은 건 없던 팀에게.
        </>
      }
    >
      <Lead>
        <Phrase>함께 프로젝트를 하는 팀은</Phrase> <Phrase>매일 많은 것을 말로 정해요.</Phrase>{" "}
        <Phrase>그런데 그 결정은</Phrase> <Phrase>금방 흩어지고,</Phrase>{" "}
        <Phrase>기록은 늘 한 사람의 몫이 되죠.</Phrase>
      </Lead>
      <PainList>
        {PAINS.map((pain, index) => (
          <Pain key={pain}>
            <PainNumber>{index + 1}</PainNumber>
            <span>{pain}</span>
          </Pain>
        ))}
      </PainList>
    </ScenePanel>
  );
}

const PainList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
  padding-top: 0.375rem; /* 6px */

  ${mobile} {
    gap: 0.5rem; /* 8px */
  }
`;

const Pain = styled.li`
  display: flex;
  align-items: baseline;
  gap: 0.75rem; /* 12px */
  ${({ theme }) => theme.text.body02};
  color: ${({ theme }) => theme.neutral[800]};

  ${mobile} {
    font-size: 0.9375rem; /* 15px */
  }
`;

const PainNumber = styled.b`
  flex-shrink: 0;
  width: 1.25rem; /* 20px */
  font-weight: 700;
  color: ${({ theme }) => theme.sub.accent[500]};
`;
