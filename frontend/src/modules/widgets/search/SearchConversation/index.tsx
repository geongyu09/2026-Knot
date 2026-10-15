import useSearchMessagesQuery from "@api/queries/useSearchMessagesQuery";
import styled from "@emotion/styled";
import useConversationId from "@hooks/domain/search/useConversationId";
import useSearchAnswerControl from "@hooks/domain/search/useSearchAnswerControl";
import useSearchAnswerState from "@hooks/domain/search/useSearchAnswerState";
import { useParams } from "react-router";

import EmptyConversation from "./ui/EmptyConversation";
import SearchTurn from "./ui/SearchTurn";
import type { SearchTurn as SearchTurnData } from "./types/searchTurn";
import { buildSearchTurns } from "./utils/buildSearchTurns";

/**
 * 탐색 화면의 대화 칸. 지금 대화의 상태에 따라 칸에 무엇을 그릴지 정해요.
 *
 * 질문이 없는 빈 대화에서는 안내 문구를, 대화가 있으면 질문·답변 턴을 위에서부터 차례로 그려요.
 * 저장된 턴 뒤에는 이 대화에서 보내 지금 받고 있는 질문·답변을 이어 그려요.
 * 실패한 답변의 `다시 시도`는 그 턴의 질문으로 답변을 다시 요청해요(SEARCH-R5).
 */
export default function SearchConversation() {
  const { workspaceId } = useParams();
  const { conversationId } = useConversationId();
  const { data } = useSearchMessagesQuery({
    workspaceId: Number(workspaceId),
    conversationId,
  });
  const messages = data?.items ?? [];
  const answer = useSearchAnswerState();
  const { retryAnswer } = useSearchAnswerControl();

  const turns = buildSearchTurns({ messages, answer, conversationId });

  const handleRetryAnswer = ({
    questionId,
    question,
    answer: failedAnswer,
  }: SearchTurnData) => {
    // 실패한 답변은 접수된 질문에만 생기므로 대화·질문 ID가 늘 있어요. 타입을 좁히려고 확인해요
    if (!workspaceId || !conversationId || !questionId || !failedAnswer) return;

    retryAnswer({
      workspaceId: Number(workspaceId),
      conversationId,
      question,
      questionMessageId: questionId,
      answerMessageId: failedAnswer.id,
    });
  };

  if (turns.length === 0) {
    return (
      <Root aria-label="대화">
        <EmptyConversation />
      </Root>
    );
  }

  return (
    <TurnList aria-label="대화">
      {turns.map((turn) => (
        <SearchTurn
          key={turn.key}
          turn={turn}
          onRetryAnswer={() => handleRetryAnswer(turn)}
        />
      ))}
    </TurnList>
  );
}

const Root = styled.section`
  height: 100%;
`;

const TurnList = styled.section`
  display: flex;
  flex-direction: column;
  gap: 3rem; /* 48px */
  padding-top: 3rem; /* 48px — 본문 위 여백 20px과 더해 Figma처럼 화면 위 136px에 첫 줄이 놓여요 */
`;
