import {
  HTTP_ERROR_TYPE,
  isHttpError,
  type HttpErrorType,
} from "@api/httpClient/error";
import { SseRequestError } from "@api/sse/requestSseStream";
import { isCancelledError } from "@tanstack/react-query";
import axios from "axios";

/**
 * 사용자가 입력한 값이 서버 검증에 걸린 400 오류 코드. 입력 화면이 문구로 안내해요.
 *
 * - `VALIDATION_ERROR`: 요청 본문 필드 검증 실패(닉네임 형식, 질문 길이 등)
 * - `INVALID_MEMBER_DATA`: 닉네임 도메인 검증 실패
 * - `INVALID_WORKSPACE_NAME`: 워크스페이스 이름 도메인 검증 실패
 *
 * 그 밖의 400(`INVALID_REQUEST_BODY`, `INVALID_PARAMETER`, `MISSING_PARAMETER` 등)은 앱이 요청을 잘못 만든
 * 계약 위반이라 보고해요.
 */
const USER_INPUT_ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_MEMBER_DATA",
  "INVALID_WORKSPACE_NAME",
];

/** 멤버가 아닌 워크스페이스에 들어온 403. `useWorkspaceAccessGuard`가 선택 화면으로 보내요 */
const WORKSPACE_ACCESS_DENIED = "WORKSPACE_ACCESS_DENIED";

/** 서버에 없는 API 경로. 도메인 리소스가 없는 404와 달리 앱이 경로를 잘못 만든 거예요 */
const REQUEST_PATH_NOT_FOUND = "REQUEST_PATH_NOT_FOUND";

/** 응답을 받지 못한 fetch가 브라우저마다 던지는 TypeError 문구 */
const FETCH_NETWORK_ERROR_PATTERN =
  /Failed to fetch|NetworkError|Load failed|Network request failed/;

/** SSE 요청은 httpClient를 거치지 않아 상태 코드를 httpClient와 같은 실패 이유로 맞춰요 */
const SSE_STATUS_ERROR_TYPE: Record<number, HttpErrorType> = {
  400: HTTP_ERROR_TYPE.badRequest,
  401: HTTP_ERROR_TYPE.unauthorized,
  403: HTTP_ERROR_TYPE.forbidden,
  404: HTTP_ERROR_TYPE.notFound,
  409: HTTP_ERROR_TYPE.conflict,
  429: HTTP_ERROR_TYPE.tooManyRequests,
};

interface RequestFailure {
  type: HttpErrorType;
  code?: string;
}

const toRequestFailure = (error: unknown): RequestFailure | undefined => {
  if (isHttpError(error)) return { type: error.type, code: error.code };

  if (error instanceof SseRequestError) {
    const type =
      SSE_STATUS_ERROR_TYPE[error.status] ??
      (error.status < 500
        ? HTTP_ERROR_TYPE.clientError
        : HTTP_ERROR_TYPE.serverError);

    return { type, code: error.code };
  }

  return undefined;
};

const isAbortError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  error.name === "AbortError";

const isCanceled = (error: unknown) =>
  axios.isCancel(error) || isCancelledError(error) || isAbortError(error);

const isFetchNetworkError = (error: unknown) =>
  error instanceof TypeError && FETCH_NETWORK_ERROR_PATTERN.test(error.message);

/** 화면이 이미 안내하거나 이동시키는 요청 실패인지 판별해요 */
const isExpectedFailure = ({ type, code }: RequestFailure) => {
  switch (type) {
    case HTTP_ERROR_TYPE.unauthorized:
    case HTTP_ERROR_TYPE.conflict:
    case HTTP_ERROR_TYPE.tooManyRequests:
      return true;
    case HTTP_ERROR_TYPE.badRequest:
      return USER_INPUT_ERROR_CODES.includes(code ?? "");
    case HTTP_ERROR_TYPE.forbidden:
      return code === WORKSPACE_ACCESS_DENIED;
    case HTTP_ERROR_TYPE.notFound:
      return code !== REQUEST_PATH_NOT_FOUND;
    default:
      return false;
  }
};

interface ShouldReportErrorParams {
  /** 잡힌 오류. Sentry가 받은 원래 값이에요 */
  error: unknown;
  /** 오류가 났을 때 브라우저가 온라인이었는지(`navigator.onLine`) */
  isOnline: boolean;
}

/**
 * 오류를 Sentry에 보고할지 정해요.
 *
 * 보고하지 않는 것은 기존 코드가 이미 예상해서 처리하는 오류뿐이에요.
 * - 요청 취소(axios 취소, react-query 취소, AbortError)
 * - 인증 만료 401: httpClient 요청은 토큰 재발급 뒤에도 401이면 화면이 로그인으로 보내요.
 *   SSE(탐색 답변), 녹음 제어, 마지막 본 워크스페이스 갱신의 401은 아직 로그인으로 보내지 않지만 여기서는 함께 빼요.
 *   그래서 이 경로의 401은 Sentry에도 남지 않아요. 로그인 이동은 #551에서 한 곳으로 모으고, 그때 이 경로들도 함께 다뤄요.
 * - 사용자 입력 검증 400, 워크스페이스 접근 거부 403
 * - 도메인 리소스가 없는 404, 상태 충돌 409, 요청 제한 429: 화면마다 안내 문구나 이동이 있어요
 * - 오프라인에서 응답을 받지 못한 요청
 *
 * 4xx를 통째로 빼지 않아요. 요청 계약 위반 400, CSRF 재시도 뒤에도 남은 403, 없는 API 경로 404,
 * 그 밖의 4xx와 5xx, 요청과 관계없는 오류는 보고해요.
 *
 * @example
 * shouldReportError({ error, isOnline: navigator.onLine });
 */
export const shouldReportError = ({
  error,
  isOnline,
}: ShouldReportErrorParams) => {
  if (isCanceled(error)) return false;

  const failure = toRequestFailure(error);

  if (failure?.type === HTTP_ERROR_TYPE.network) return isOnline;
  if (failure) return !isExpectedFailure(failure);
  if (isFetchNetworkError(error)) return isOnline;

  return true;
};
