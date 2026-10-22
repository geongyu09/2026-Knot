import useSearchMessagesQuery from "@api/queries/useSearchMessagesQuery";
import useConversationId from "@hooks/domain/search/useConversationId";
import useSearchAnswerControl from "@hooks/domain/search/useSearchAnswerControl";
import { useSearchAnswerStore } from "@store/searchAnswerStore";
import { useEffect, useRef } from "react";
import { useParams } from "react-router";

import type { SearchMessage } from "@/shared/types/searchAnswer";

/** 서버가 아직 만들고 있는 답변과 그 질문. 서버는 한 대화에 생성 중인 답변을 하나만 둬요 */
const findStreamingTurn = (messages: SearchMessage[]) => {
  const answerIndex = messages.findIndex(
    ({ role, status }) => role === "ASSISTANT" && status === "STREAMING",
  );
  if (answerIndex === -1) return null;

  const question = messages[answerIndex - 1];
  if (question?.role !== "USER") return null;

  return { question, answer: messages[answerIndex] };
};

/**
 * 지금 보는 대화에 서버가 아직 만들고 있는 답변이 있으면 이어 받는 도메인 훅(SEARCH-R8). 탐색 화면의 대화 칸에서 한 번만 불러요.
 *
 * 답변을 받는 중에 다른 대화를 열면 받기를 끊는데, 서버는 답변을 계속 만들어요. 돌아오면 메시지 조회에는
 * 그때까지 저장된 데까지만 있어서, 재연결 API로 나머지를 끝까지 받아요. 새로고침한 뒤에도 같아요.
 *
 * - 다른 대화의 메시지를 잠시 이어 보여 주는 동안(옮겨 가는 중)에는 보지 않아요.
 * - 저장소가 이미 그 답변을 들고 있으면(받는 중이거나 방금 끝나 다시 조회하는 중) 다시 받지 않아요.
 * - 한 답변은 이 화면에 있는 동안 한 번만 이어 받아요. 다시 연결해도 끝을 받지 못했으면 저장된 메시지로 두고
 *   계속 연결하지 않아요. 다른 화면에 다녀오면 다시 이어 받아요.
 */
const useResumeSearchAnswer = () => {
  const { workspaceId } = useParams();
  const { conversationId } = useConversationId();
  const { data, isPlaceholderData } = useSearchMessagesQuery({
    workspaceId: Number(workspaceId),
    conversationId,
  });
  const { resumeAnswer } = useSearchAnswerControl();
  const resumedAnswerIdsRef = useRef(new Set<number>());

  useEffect(() => {
    if (!workspaceId || conversationId === undefined) return;
    if (!data || isPlaceholderData) return;

    const streamingTurn = findStreamingTurn(data.items);
    if (!streamingTurn) return;

    const { question, answer } = streamingTurn;
    if (useSearchAnswerStore.getState().answerMessageId === answer.id) return;
    if (resumedAnswerIdsRef.current.has(answer.id)) return;

    resumedAnswerIdsRef.current.add(answer.id);
    resumeAnswer({
      workspaceId: Number(workspaceId),
      conversationId,
      question: question.content,
      questionMessageId: question.id,
      answerMessageId: answer.id,
      text: answer.content,
    });
  }, [workspaceId, conversationId, data, isPlaceholderData, resumeAnswer]);
};

export default useResumeSearchAnswer;
