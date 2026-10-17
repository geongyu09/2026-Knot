import styled from "@emotion/styled";
import type { Ref } from "react";

import DocumentCard from "./DocumentCard";
import ScenePanel, { Lead, Phrase } from "./ScenePanel";
import { mobile } from "./SceneLayer";

const SAMPLE_DOCUMENTS = [
  {
    title: "회원 탈퇴 정책",
    date: "2026년 9월 15일",
    duration: "32분",
    sections: [
      { label: "결정", text: "게시글은 유지하고 작성자만 가려요" },
      { label: "미결정 항목", text: "첨부파일 유지 여부" },
    ],
    footer: "3명 확인했어요",
    style: { left: 0, top: 0, width: "20rem" /* 320px */ },
  },
  {
    title: "결제 화면 개편",
    date: "2026년 9월 16일",
    duration: "45분",
    sections: [
      { label: "결정", text: "결제 수단을 한 화면에 모아요" },
      { label: "이유", text: "단계가 길수록 이탈이 늘어요" },
    ],
    footer: "2명 확인했어요",
    style: { left: "24.375rem" /* 390px */, top: "10rem" /* 160px */, width: "18.75rem" /* 300px */ },
  },
  {
    title: "비밀번호 재설정 정책",
    date: "2026년 9월 8일",
    duration: "28분",
    sections: [{ label: "결정", text: "재설정 링크는 30분만 유효해요" }],
    footer: "4명 확인했어요",
    style: { left: "5rem" /* 80px */, top: "26.25rem" /* 420px */, width: "18.75rem" /* 300px */ },
  },
];

interface DocumentsSceneProps {
  isOn: boolean;
  /** 입자가 카드 모양을 다 갖춰 진짜 카드를 보여도 되는지 */
  isRevealed: boolean;
  documentsRef: Ref<HTMLDivElement>;
}

/**
 * 사용법 02. 녹음이 주제별 문서로 정리되는 장면.
 *
 * 파형이던 입자가 위에서 떨어져 문서 카드 세 장의 윤곽과 글줄로 쌓이고, 카드 사이를 실이 이어요.
 */
export default function DocumentsScene({ isOn, isRevealed, documentsRef }: DocumentsSceneProps) {
  return (
    <>
      <ScenePanel
        isOn={isOn}
        eyebrow="사용법 02"
        step="자동 정리"
        title={
          <>
            녹음을 끝내면
            <br />
            주제별 문서로.
          </>
        }
      >
        <Lead>
          <Phrase>AI가 이야기를 주제마다 나눠 정리해요.</Phrase> <Phrase>무엇을 정했는지,</Phrase>{" "}
          <Phrase>왜 그렇게 정했는지,</Phrase> <Phrase>아직 못 정한 건 무엇인지까지.</Phrase>
        </Lead>
        <TagList>
          {["결정", "이유", "적용 범위", "미결정 항목"].map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </TagList>
      </ScenePanel>

      <Board ref={documentsRef} aria-hidden>
        {SAMPLE_DOCUMENTS.map(({ style, ...document }) => (
          <PositionedCard key={document.title} style={style}>
            <DocumentCard {...document} isRevealed={isOn && isRevealed} />
          </PositionedCard>
        ))}
      </Board>
    </>
  );
}

const TagList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem; /* 8px */
`;

const Tag = styled.span`
  padding: 0.375rem 0.75rem; /* 6px 12px */
  border-radius: 999px;
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.neutral[300]};
  ${({ theme }) => theme.text.caption02};
  font-weight: 600;
  color: ${({ theme }) => theme.neutral[800]};
`;

/** 카드 세 장을 놓는 판. 입자가 카드 위치를 재야 해서 장면 밖에서도 자리를 지켜요. */
const Board = styled.div`
  position: absolute;
  top: 13%;
  left: 45%;
  width: 45rem; /* 720px */
  height: 40rem; /* 640px */
  pointer-events: none;

  ${mobile} {
    top: 9%;
    left: 50%;
    transform: translateX(-50%) scale(0.5);
    transform-origin: top center;
  }
`;

const PositionedCard = styled.div`
  position: absolute;
`;
