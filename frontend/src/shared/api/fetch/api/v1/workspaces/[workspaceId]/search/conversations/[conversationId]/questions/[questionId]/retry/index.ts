import type { PostSearchAnswerRetryRequestDto } from "@api/dto/search";
import { toSearchStreamEvent } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { requestSseStream } from "@api/sse/requestSseStream";

export const WORKSPACE_SEARCH_ANSWER_RETRY_API_PATH = (
  workspaceId: number,
  conversationId: number,
  questionId: number,
) =>
  `/api/v1/workspaces/${workspaceId}/search/conversations/${conversationId}/questions/${questionId}/retry`;

interface RetrySearchAnswerApiParams {
  workspaceId: number;
  conversationId: number;
  /** 답변이 실패한 질문 메시지 ID */
  questionId: number;
  body: PostSearchAnswerRetryRequestDto;
  signal?: AbortSignal;
}

/**
 * @description 답변이 실패한 질문으로 답변을 다시 만들고 SSE로 도착하는 답변 이벤트를 순서대로 흘려보내요. 새 질문 메시지는 만들지 않고, 실패했던 답변 메시지를 비워 다시 채워요
 * @param params - 워크스페이스 ID, 탐색 대화 ID, 답변이 실패한 질문 메시지 ID, 재시도 요청 본문, 취소용 AbortSignal
 * @returns 첫 질문과 같은 accepted·progress·delta·evidence·excluded_documents·completed·failed·stopped 이벤트를 순서대로 내는 async generator
 * @throws {SseRequestError} accepted 이벤트 전에 실패 응답을 받은 경우. 답변이 실패 상태가 아니면 `ANSWER_NOT_FAILED`, 이미 만드는 중이면 `ANSWER_ALREADY_IN_PROGRESS`예요
 * @example
 * for await (const { event, data } of retrySearchAnswerApi({ workspaceId: 1, conversationId: 100, questionId: 3, body })) {
 *   if (event === "delta") answer += data.text;
 * }
 */
export async function* retrySearchAnswerApi({
  workspaceId,
  conversationId,
  questionId,
  body,
  signal,
}: RetrySearchAnswerApiParams) {
  for await (const sseEvent of requestSseStream({
    method: "POST",
    path: WORKSPACE_SEARCH_ANSWER_RETRY_API_PATH(
      workspaceId,
      conversationId,
      questionId,
    ),
    body,
    signal,
  })) {
    const searchStreamEvent = toSearchStreamEvent(sseEvent);
    if (searchStreamEvent) yield searchStreamEvent;
  }
}
