import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";
import axios, { AxiosError } from "axios";

/** axios xhr 어댑터가 페이지를 떠날 때 끊긴 요청에 붙이는 문구 */
const REQUEST_ABORTED_MESSAGE = "Request aborted";

/** 시간 초과에 붙는 axios 오류 코드. 기본 설정에서는 `ECONNABORTED`예요 */
const TIMEOUT_ERROR_CODES: (string | undefined)[] = [
  AxiosError.ECONNABORTED,
  AxiosError.ETIMEDOUT,
];

/**
 * 응답을 받지 못한 httpClient 실패(`network`)의 원인을 정해요. 그 밖의 오류면 `undefined`예요.
 *
 * - `timeout`: 정한 시간(10초) 안에 응답이 오지 않았어요. 느린 API나 서버 지연이에요
 * - `aborted`: 새로고침, 탭 닫기, 다른 주소로 이동처럼 페이지를 떠나며 브라우저가 끊은 요청이에요
 * - `network`: 연결하지 못했어요. 서버 다운, CORS 헤더 없는 게이트웨이 오류(502, 504), 절전 해제 직후 요청이 여기에 들어요
 *
 * @example
 * getNetworkFailureReason(error); // "timeout"
 */
export const getNetworkFailureReason = (error: unknown) => {
  if (!isHttpError(error, HTTP_ERROR_TYPE.network)) return undefined;
  if (!("cause" in error) || !axios.isAxiosError(error.cause)) {
    return "network";
  }

  const { code, message } = error.cause;
  if (message === REQUEST_ABORTED_MESSAGE) return "aborted";
  if (TIMEOUT_ERROR_CODES.includes(code)) return "timeout";

  return "network";
};
