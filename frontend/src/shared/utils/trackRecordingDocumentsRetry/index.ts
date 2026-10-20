import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import { isUnauthorizedError } from "@utils/isUnauthorizedError";

interface TrackRecordingDocumentsRetryParams {
  /** 무엇을 다시 시도했는지. 전사 또는 문서 만들기예요 */
  stage: "transcription" | "document_generation";
  /** 다시 시도 요청마다의 오류. 접수된 요청은 `null`이에요. 문서 만들기는 작업마다 요청해서 여러 개일 수 있어요 */
  errors: unknown[];
  workspaceId: number;
  recordingId: number;
}

/** 더 시도할 수 없다는 응답(409 · 404) */
const isRejectedError = (error: unknown) =>
  isHttpError(error, HTTP_ERROR_TYPE.conflict) ||
  isHttpError(error, HTTP_ERROR_TYPE.notFound);

/** 요청마다의 결과를 하나로 묶어요. 하나라도 접수되면 접수, 모두 거절이면 거절, 그 밖은 오류예요 */
const getRetryResult = (errors: unknown[]) => {
  if (errors.some((error) => error === null)) return "accepted";

  return errors.every(isRejectedError) ? "rejected" : "error";
};

/**
 * @description 정리 화면의 다시 시도 응답을 사용 기록(`recording_documents_retry`)으로 보내요
 * @param params - 다시 시도한 단계, 요청마다의 오류(접수면 `null`), 워크스페이스 · 녹음 id
 * @example
 * trackRecordingDocumentsRetry({ stage: "transcription", errors: [null], workspaceId, recordingId });
 *
 * 로그인이 풀린(401) 요청이 있으면 다시 시도의 결과가 아니라 로그인 화면으로 가는 것이라 보내지 않아요.
 * 보낸 요청이 없으면(빈 목록) 서버 응답도 없어 보내지 않아요.
 */
export const trackRecordingDocumentsRetry = ({
  stage,
  errors,
  workspaceId,
  recordingId,
}: TrackRecordingDocumentsRetryParams) => {
  // 빈 목록은 `every`가 true라 그대로 두면 거절로 세어져요
  if (errors.length === 0 || errors.some(isUnauthorizedError)) return;

  captureAnalyticsEvent({
    event: "recording_documents_retry",
    properties: {
      stage,
      result: getRetryResult(errors),
      recording_id: recordingId,
      workspace_id: workspaceId,
    },
  });
};
