import useSearchMessagesQuery from "@api/queries/useSearchMessagesQuery";
import styled from "@emotion/styled";
import useConversationId from "@hooks/domain/search/useConversationId";
import useSearchAnswerControl from "@hooks/domain/search/useSearchAnswerControl";
import useSearchAnswerState from "@hooks/domain/search/useSearchAnswerState";
import { useParams } from "react-router";

import ConversationLoadFailed from "./ui/ConversationLoadFailed";
import ConversationSkeleton from "./ui/ConversationSkeleton";
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
 *
 * 지난 대화의 메시지를 받는 동안에는 시작 전 안내를 띄우지 않아요(SEARCH-15).
 * - 보던 대화에서 옮겨 왔으면 응답이 올 때까지 보던 대화를 그대로 두고, 그 대화는 누를 수 없게 막아요.
 * - 보여 줄 대화가 없으면(새로고침, 주소로 진입, 새 대화에서 이동) 스켈레톤을 그려요.
 * - 받지 못했으면 칸 안에 불러오기 실패 안내와 `다시 시도`를 둬요.
 */
export default function SearchConversation() {
  const { workspaceId } = useParams();
  const { conversationId } = useConversationId();
  const { data, isPending, isError, isPlaceholderData, refetch } =
    useSearchMessagesQuery({
      workspaceId: Number(workspaceId),
      conversationId,
    });
  const answer = useSearchAnswerState();
  const { retryAnswer } = useSearchAnswerControl();

  const messages = data?.items ?? [];
  // 새 대화는 조회하지 않아 늘 pending이라, 대화가 있을 때만 받는 중으로 봐요
  const isLoading = conversationId !== undefined && isPending;
  // 받아 둔 메시지가 있으면 다시 조회가 실패해도 그대로 보여줘요
  const isLoadFailed = isError && data === undefined;
  // 다른 대화로 옮기는 중이라, 새 대화의 응답 대신 보던 대화의 메시지를 받고 있어요
  const isSwitching = isPlaceholderData;

  const turns = buildSearchTurns({ messages, answer, conversationId });

  const handleReload = () => {
    refetch();
  };

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

  // 생성 중인 답변이 있으면 받는 중이어도 그 턴을 그려요. 답변을 만드는 동안에는 스켈레톤을 쓰지 않아요(SEARCH-15)
  if (turns.length === 0) {
    if (isLoadFailed) {
      return (
        <Root aria-label="대화">
          <ConversationLoadFailed onRetry={handleReload} />
        </Root>
      );
    }

    if (isLoading) {
      return (
        <TurnList aria-label="대화" aria-busy>
          <ConversationSkeleton />
        </TurnList>
      );
    }

    return (
      <Root aria-label="대화">
        <EmptyConversation />
      </Root>
    );
  }

  return (
    // 옮기는 동안 남은 보던 대화를 누르면 옮겨 갈 대화 ID로 요청이 가요. 응답이 올 때까지 통째로 막아요
    <TurnList aria-label="대화" aria-busy={isSwitching} inert={isSwitching}>
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
