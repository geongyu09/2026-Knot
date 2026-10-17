import styled from "@emotion/styled";
import ChatBubble from "@primitives/ui/ChatBubble";
import Skeleton from "@primitives/ui/Skeleton";

/** 덩어리의 굵기(rem). 피그마 탐색/지난 대화 불러오는 중의 글줄 덩어리는 14px이에요 */
const LINE_HEIGHT = 0.875;

/** 글줄 덩어리의 모서리(rem). 피그마 7px */
const LINE_RADIUS = 0.4375;

/**
 * 보여 줄 대화 없이 지난 대화의 메시지를 받는 동안 그리는 턴 하나. 피그마 「탐색/지난 대화 불러오는 중」이에요(SEARCH-15).
 *
 * 질문 말풍선 안의 한 줄과 답변 두 줄, 「기록 N개에서 찾았어요」 버튼 자리를 회색 덩어리로 채워요.
 * 줄 높이와 간격을 실제 턴(`SearchTurn`)과 같게 지켜, 받은 뒤 내용이 크게 움직이지 않게 해요.
 */
export default function ConversationSkeleton() {
  return (
    <Container role="status" aria-label="대화를 불러오고 있어요">
      <QuestionRow>
        <ChatBubble>
          {/* 피그마 말풍선 안 덩어리 폭 245px */}
          <LineSlot>
            <Skeleton
              width={15.3125}
              height={LINE_HEIGHT}
              radius={LINE_RADIUS}
            />
          </LineSlot>
        </ChatBubble>
      </QuestionRow>

      <Answer>
        <LineSlot>
          <Skeleton width="100%" height={LINE_HEIGHT} radius={LINE_RADIUS} />
        </LineSlot>
        {/* 피그마 둘째 줄은 대화 폭 760px 가운데 456px이에요 */}
        <LineSlot>
          <Skeleton width="60%" height={LINE_HEIGHT} radius={LINE_RADIUS} />
        </LineSlot>
        {/* 「기록 N개에서 찾았어요」 버튼 자리: 160 × 32px, 모서리 8px */}
        <Skeleton width={10} height={2} radius={0.5} />
      </Answer>
    </Container>
  );
}

/** 실제 턴과 같이 질문과 답변 사이 16px */
const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem; /* 16px */
`;

const QuestionRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

/** 실제 답변과 같이 줄 사이 12px */
const Answer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
`;

/** 글 한 줄(body01 16px × 줄 높이 1.5)과 같은 높이에 덩어리를 세로 가운데로 둬요 */
const LineSlot = styled.div`
  display: flex;
  align-items: center;
  height: 1.5rem; /* 24px */
`;
