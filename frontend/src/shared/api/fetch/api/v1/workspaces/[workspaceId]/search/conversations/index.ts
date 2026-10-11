import {
  SearchStreamAcceptedDto,
  SearchStreamCompletedDto,
  SearchStreamDeltaDto,
  SearchStreamEvidenceDto,
  SearchStreamExcludedDocumentsDto,
  SearchStreamFailedDto,
  SearchStreamProgressDto,
  SearchStreamStoppedDto,
  type PostSearchConversationRequestDto,
  type SearchStreamEvent,
} from "@api/dto/search";
import type { SseEvent } from "@api/sse/parseSseEvents";
import { requestSseStream } from "@api/sse/requestSseStream";

export const WORKSPACE_SEARCH_CONVERSATIONS_API_PATH = (workspaceId: number) =>
  `/api/v1/workspaces/${workspaceId}/search/conversations`;

/** 명세에 있는 이벤트만 DTO로 감싸요. 모르는 이벤트 이름은 버려요 */
export const toSearchStreamEvent = ({
  event,
  data,
}: SseEvent): SearchStreamEvent | null => {
  // case마다 event가 리터럴로 좁혀져 data DTO와 짝이 맞는지 타입이 확인해 줘요
  switch (event) {
    case "accepted":
      return { event, data: new SearchStreamAcceptedDto(JSON.parse(data)) };
    case "progress":
      return { event, data: new SearchStreamProgressDto(JSON.parse(data)) };
    case "delta":
      return { event, data: new SearchStreamDeltaDto(JSON.parse(data)) };
    case "evidence":
      return { event, data: new SearchStreamEvidenceDto(JSON.parse(data)) };
    case "excluded_documents":
      return {
        event,
        data: new SearchStreamExcludedDocumentsDto(JSON.parse(data)),
      };
    case "completed":
      return { event, data: new SearchStreamCompletedDto(JSON.parse(data)) };
    case "failed":
      return { event, data: new SearchStreamFailedDto(JSON.parse(data)) };
    case "stopped":
      return { event, data: new SearchStreamStoppedDto(JSON.parse(data)) };
    default:
      return null;
  }
};

interface CreateSearchConversationApiParams {
  workspaceId: number;
  body: PostSearchConversationRequestDto;
  signal?: AbortSignal;
}

/**
 * @description 첫 질문으로 탐색 대화를 시작하고 SSE로 도착하는 답변 이벤트를 순서대로 흘려보내요
 * @param params - 워크스페이스 ID, 첫 질문 전송 요청 본문, 취소용 AbortSignal
 * @returns accepted·progress·delta·evidence·excluded_documents·completed·failed·stopped 이벤트를 순서대로 내는 async generator. 받는 쪽이 중간에 멈추면 스트림 읽기를 정리해요
 * @throws {SseRequestError} accepted 이벤트 전에 실패 응답을 받은 경우. `error.code === "REQUEST_ID_CONFLICT"`처럼 서버 오류 코드로 분기해요
 * @example
 * for await (const { event, data } of createSearchConversationApi({ workspaceId: 1, body })) {
 *   if (event === "delta") answer += data.text;
 * }
 */
export async function* createSearchConversationApi({
  workspaceId,
  body,
  signal,
}: CreateSearchConversationApiParams) {
  for await (const sseEvent of requestSseStream({
    method: "POST",
    path: WORKSPACE_SEARCH_CONVERSATIONS_API_PATH(workspaceId),
    body,
    signal,
  })) {
    const searchStreamEvent = toSearchStreamEvent(sseEvent);
    if (searchStreamEvent) yield searchStreamEvent;
  }
}

interface ReceiveSearchAnswerParams {
  /** 첫 질문·후속 질문 요청 함수가 내는 이벤트 스트림 */
  stream: AsyncIterable<SearchStreamEvent>;
  /** 이벤트가 도착할 때마다 불려요. 화면 상태에 쌓는 건 부르는 쪽이 해요 */
  onEvent: (event: SearchStreamEvent) => void;
}

/**
 * @description 탐색 답변 스트림을 끝까지 받으며 이벤트를 넘기고, 답변이 어떻게 끝났는지 판정해요. 첫 질문·후속 질문 뮤테이션이 함께 써요
 * @param params - 요청 함수의 이벤트 스트림, 이벤트를 받을 콜백
 * @returns completed 이벤트의 data
 * @example
 * const completed = await receiveSearchAnswer({
 *   stream: createSearchConversationApi({ workspaceId, body, signal }),
 *   onEvent,
 * });
 */
export const receiveSearchAnswer = async ({
  stream,
  onEvent,
}: ReceiveSearchAnswerParams) => {
  for await (const searchStreamEvent of stream) {
    onEvent(searchStreamEvent);

    if (searchStreamEvent.event === "completed") return searchStreamEvent.data;
  }

  return null;
};
