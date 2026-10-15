import useSearchMessagesQuery from "@api/queries/useSearchMessagesQuery";
import useOpenedEvidenceMessage from "@hooks/domain/search/useOpenedEvidenceMessage";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";

interface UseOpenedSearchEvidencesParams {
  /** 대화 ID. 없으면 아직 질문을 보내지 않은 새 대화예요. */
  conversationId?: number;
}

/**
 * 지금 찾은 기록을 펼쳐 둔 답변의 근거 문서를 주는 도메인 훅.
 *
 * 찾은 기록 패널(`SearchEvidenceList`)은 이 목록을 그리고, GNB 찾은 기록 버튼(`SearchEvidenceToggle`)은
 * 목록으로 패널이 열려 있는지 판단해요. 두 곳이 같은 기준으로 "열린 근거"를 보도록 훅으로 내렸어요.
 * 펼친 답변이 없거나 근거가 없으면 빈 목록이에요.
 *
 * 방금 끝난 답변은 메시지를 다시 받기 전까지 저장된 목록에 없어요. 그 답변을 펼쳤으면 스트림으로 받은 근거를 써서,
 * 답변이 끝나자마자 패널이 열리게 해요(SEARCH-R10).
 */
const useOpenedSearchEvidences = ({
  conversationId,
}: UseOpenedSearchEvidencesParams) => {
  const { workspaceId } = useParams();
  const { data } = useSearchMessagesQuery({
    workspaceId: Number(workspaceId),
    conversationId,
  });
  const messages = data?.items ?? [];
  const { openedMessageId } = useOpenedEvidenceMessage();
  const liveAnswer = useSearchAnswerStore(
    useShallow((state) => ({
      answerMessageId: state.answerMessageId,
      evidences: state.evidences,
    })),
  );

  const openedAnswer = messages.find(
    ({ id, role }) => role === "ASSISTANT" && id === openedMessageId,
  );
  const isLiveAnswerOpened =
    openedAnswer === undefined &&
    openedMessageId !== null &&
    openedMessageId === liveAnswer.answerMessageId;
  // 서버가 관련도 순(rank 오름차순)으로 최대 3개까지 줘요.
  const evidences = isLiveAnswerOpened
    ? liveAnswer.evidences
    : (openedAnswer?.evidences ?? []);

  return { evidences };
};

export default useOpenedSearchEvidences;
