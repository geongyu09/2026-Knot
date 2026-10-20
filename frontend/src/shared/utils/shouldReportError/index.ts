import {
  HTTP_ERROR_TYPE,
  isHttpError,
  type HttpErrorType,
} from "@api/httpClient/error";
import { SseRequestError } from "@api/sse/requestSseStream";
import { isCancelledError } from "@tanstack/react-query";
import { getNetworkFailureReason } from "@utils/getNetworkFailureReason";
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

/**
 * 화면이 처리하는 업무 403 오류 코드.
 *
 * - `WORKSPACE_ACCESS_DENIED`: 멤버가 아닌 워크스페이스에 들어왔어요. `useWorkspaceAccessGuard`가 선택 화면으로 보내요
 * - `SEARCH_ACCESS_DENIED`: 볼 수 없는 탐색 대화예요. 대화 화면은 새 대화로 옮기고, 답변 칸은 실패 안내를 보여 줘요
 *
 * `RECORDING_CONTROL_DENIED`(녹음 제어권 잃음)는 아직 녹음 화면이 안내하지 않아 보고해요.
 */
const HANDLED_FORBIDDEN_CODES = [
  "WORKSPACE_ACCESS_DENIED",
  "SEARCH_ACCESS_DENIED",
];

/** 서버에 없는 API 경로. 도메인 리소스가 없는 404와 달리 앱이 경로를 잘못 만든 거예요 */
const REQUEST_PATH_NOT_FOUND = "REQUEST_PATH_NOT_FOUND";

/** 응답을 받지 못한 fetch가 브라우저마다 던지는 TypeError 문구 */
const FETCH_NETWORK_ERROR_PATTERN =
  /Failed to fetch|NetworkError|Load failed|Network request failed/;

/**
 * 녹음에서 마이크를 받지 못한 이유 중 사용자가 고칠 수 있는 것. 녹음 화면이 마이크 안내 창으로 안내해요.
 *
 * - `NotAllowedError`: 권한 거절
 * - `NotFoundError`: 마이크 없음
 *
 * DOM 조작 실패(removeChild 등)도 `NotFoundError`라 녹음에서 잡은 실패만 빼요.
 */
const EXPECTED_MICROPHONE_ERROR_NAMES = ["NotAllowedError", "NotFoundError"];

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

/** 페이지를 떠나며 브라우저가 끊은 요청도 취소로 봐요 */
const isCanceled = (error: unknown) =>
  axios.isCancel(error) ||
  isCancelledError(error) ||
  isAbortError(error) ||
  getNetworkFailureReason(error) === "aborted";

const isExpectedMicrophoneError = (error: unknown) =>
  error instanceof DOMException &&
  EXPECTED_MICROPHONE_ERROR_NAMES.includes(error.name);

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
      return HANDLED_FORBIDDEN_CODES.includes(code ?? "");
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
  /** 페이지를 떠나는 중(`pagehide` 뒤)인지. 기본값은 `false`예요 */
  isPageHiding?: boolean;
  /** 탭이 숨겨져 있는지(`document.visibilityState`가 `hidden`). 기본값은 `false`예요 */
  isHidden?: boolean;

  /** 코드가 잡고 넘어간 실패면 잡은 기능 이름(이벤트의 `feature` 태그). 예: `recording` */
  feature?: string;
}

/**
 * 오류를 Sentry에 보고할지 정해요.
 *
 * 보고하지 않는 것은 기존 코드가 이미 예상해서 처리하는 오류뿐이에요.
 * - 요청 취소(axios 취소, react-query 취소, AbortError)
 * - 인증 만료 401: httpClient 요청은 토큰 재발급 뒤에도 401이면 화면이 로그인으로 보내요.
 *   SSE(탐색 답변), 녹음 제어, 마지막 본 워크스페이스 갱신의 401은 아직 로그인으로 보내지 않지만 여기서는 함께 빼요.
 *   그래서 이 경로의 401은 Sentry에도 남지 않아요. 로그인 이동은 #551에서 한 곳으로 모으고, 그때 이 경로들도 함께 다뤄요.
 * - 사용자 입력 검증 400, 화면이 처리하는 업무 403(워크스페이스 접근 거부, 탐색 대화 접근 거부)
 * - 도메인 리소스가 없는 404, 상태 충돌 409, 요청 제한 429: 화면마다 안내 문구나 이동이 있어요
 * - 오프라인, 페이지를 떠나는 중, 숨긴 탭에서 응답을 받지 못한 요청: 연결이 끊긴 것이 아니라 브라우저가 멈추거나 끊은 요청이 섞여요.
 *   새로고침이나 이동으로 끊긴 요청(`Request aborted`)은 취소로 봐요
 * - 녹음에서 마이크 권한 거절, 마이크 없음: 마이크 안내 창이 안내해요
 *
 * 4xx를 통째로 빼지 않아요. 요청 계약 위반 400, CSRF 재시도 뒤에도 남은 403과 화면이 처리하지 않는 업무 403, 없는 API 경로 404,
 * 그 밖의 4xx와 5xx, 요청과 관계없는 오류는 보고해요.
 *
 * @example
 * shouldReportError({ error, isOnline: navigator.onLine });
 */
export const shouldReportError = ({
  error,
  isOnline,
  isPageHiding = false,
  isHidden = false,
  feature,
}: ShouldReportErrorParams) => {
  if (isCanceled(error)) return false;
  if (feature === "recording" && isExpectedMicrophoneError(error)) return false;

  const failure = toRequestFailure(error);
  const isConnected = isOnline && !isPageHiding && !isHidden;

  if (failure?.type === HTTP_ERROR_TYPE.network) return isConnected;
  if (failure) return !isExpectedFailure(failure);
  if (isFetchNetworkError(error)) return isConnected;

  return true;
};

/**
 * Sentry 이벤트의 심각도(level)를 정해요. 보고하기로 한 오류에만 써요.
 *
 * 응답을 받지 못한 요청(연결 실패, 시간 초과)은 사용자의 네트워크 탓일 수 있어 `warning`으로 낮추고,
 * Sentry 알림은 영향을 받은 사용자 수로 판단해요. 그 밖의 오류(5xx, 계약 위반 4xx, 남은 403, 렌더링 오류)는 `error`예요.
 *
 * @example
 * getErrorReportLevel(error); // "warning"
 */
export const getErrorReportLevel = (error: unknown) =>
  toRequestFailure(error)?.type === HTTP_ERROR_TYPE.network ||
  isFetchNetworkError(error)
    ? ("warning" as const)
    : ("error" as const);
