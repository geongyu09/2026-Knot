import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";

/**
 * 워크스페이스에서 나갔거나 서버에 없는 녹음이라 이 탭의 녹음도 버려야 하는 오류인지 확인해요.
 * 404는 오류 코드와 관계없이, 403은 `WORKSPACE_ACCESS_DENIED`만 `true`예요. 최초 탭 증명이 맞지 않은 403은 `false`예요.
 */
export const isUnreachableRecordingError = (error: unknown) =>
  isHttpError(error, HTTP_ERROR_TYPE.notFound) ||
  (isHttpError(error, HTTP_ERROR_TYPE.forbidden) &&
    error.code === "WORKSPACE_ACCESS_DENIED");
