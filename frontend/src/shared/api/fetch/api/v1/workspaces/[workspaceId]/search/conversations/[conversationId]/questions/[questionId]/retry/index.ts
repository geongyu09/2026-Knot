import {
  SearchAnswerRetryAcceptedDto,
  SearchStreamAcceptedDto,
  type PostSearchAnswerRetryRequestDto,
  type SearchStreamEvent,
} from "@api/dto/search";
import { toSearchStreamEvent } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import type { SseEvent } from "@api/sse/parseSseEvents";
import { requestSseStream } from "@api/sse/requestSseStream";

export const WORKSPACE_SEARCH_ANSWER_RETRY_API_PATH = (
  workspaceId: number,
  conversationId: number,
  questionId: number,
) =>
  `/api/v1/workspaces/${workspaceId}/search/conversations/${conversationId}/questions/${questionId}/retry`;

interface ToSearchAnswerRetryStreamEventParams {
  sseEvent: SseEvent;
  /** 경로의 대화 ID. 재시도 accepted에는 대화 ID가 없어 여기서 채워요 */
  conversationId: number;
}

/**
 * 재시도 스트림의 이벤트를 첫 질문과 같은 이벤트 DTO로 감싸요.
 *
 * accepted만 서버 모양이 달라요(`questionId`·`answerMessageId`·`status`, 대화 ID 없음). 그대로 공통 변환에 넣으면
 * 대화·질문 메시지 ID가 비어 저장소가 답변을 버리므로, 경로의 대화 ID와 합쳐 `SearchStreamAcceptedDto`로 맞춰요.
 * 나머지 이벤트는 첫 질문과 같아 공통 변환을 그대로 써요
 */
const toSearchAnswerRetryStreamEvent = ({
  sseEvent,
  conversationId,
}: ToSearchAnswerRetryStreamEventParams): SearchStreamEvent | null => {
  if (sseEvent.event !== "accepted") return toSearchStreamEvent(sseEvent);

  const { questionId, answerMessageId } = new SearchAnswerRetryAcceptedDto(
    JSON.parse(sseEvent.data),
  );

  return {
    event: "accepted",
    data: new SearchStreamAcceptedDto({
      conversationId,
      questionMessageId: questionId,
      answerMessageId,
    }),
  };
};

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
 * @returns 첫 질문과 같은 accepted·progress·delta·evidence·excluded_documents·completed·failed·stopped 이벤트를 순서대로 내는 async generator. 서버의 재시도 accepted는 모양이 달라 경로의 대화 ID와 합쳐 첫 질문의 accepted 모양으로 내요
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
    const searchStreamEvent = toSearchAnswerRetryStreamEvent({
      sseEvent,
      conversationId,
    });
    if (searchStreamEvent) yield searchStreamEvent;
  }
}
