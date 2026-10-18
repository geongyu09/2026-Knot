import { isHttpError } from "@api/httpClient/error";
import { scrubUrl } from "@utils/scrubSentryEvent";
import axios from "axios";

/** 숫자만으로 된 경로 조각. 워크스페이스, 녹음, 문서 ID예요 */
const NUMERIC_SEGMENT_PATTERN = /\/\d+(?=\/|$)/g;

/** 주소에서 오리진, 쿼리 파라미터, 해시를 빼고 숫자 ID와 초대 토큰을 지운 경로 */
const toPathPattern = (url: string) =>
  // 상대 경로도 읽으려고 아무 오리진이나 붙여요
  scrubUrl(new URL(url, "http://localhost").pathname).replace(
    NUMERIC_SEGMENT_PATTERN,
    "/:id",
  );

/**
 * httpClient 요청 실패를 Sentry에서 묶을 기준(fingerprint)을 만들어요.
 *
 * HttpError는 모두 같은 곳(`createHttpError`)에서 같은 문구로 만들어져, 기본 기준(오류 위치와 문구)으로는
 * 서로 다른 API의 실패가 한 Issue로 합쳐져요. 그래서 `메서드 + ID와 토큰을 지운 경로 + 상태 코드(+ 서버 오류 코드)`로 나눠요.
 * 응답을 받지 못한 실패는 상태 코드 대신 실패 이유(`network`)를 써요.
 * httpClient 요청의 실패가 아니거나 요청 정보가 없으면 `undefined`를 돌려줘 기본 기준을 그대로 써요.
 *
 * @example
 * getRequestErrorFingerprint(error); // ["GET", "/api/v1/workspaces/:id/documents", "500", "INTERNAL_SERVER_ERROR"]
 */
export const getRequestErrorFingerprint = (error: unknown) => {
  if (
    !isHttpError(error) ||
    !("cause" in error) ||
    !axios.isAxiosError(error.cause)
  ) {
    return undefined;
  }

  const { config, response } = error.cause;
  if (!config?.url) return undefined;

  const fingerprint = [
    (config.method ?? "get").toUpperCase(),
    toPathPattern(config.url),
    response ? String(response.status) : error.type,
  ];

  return error.code ? [...fingerprint, error.code] : fingerprint;
};
