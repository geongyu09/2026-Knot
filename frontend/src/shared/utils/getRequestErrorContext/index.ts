import { isHttpError } from "@api/httpClient/error";
import { getNetworkFailureReason } from "@utils/getNetworkFailureReason";
import { toPathPattern } from "@utils/getRequestErrorFingerprint";
import axios, { AxiosHeaders, type AxiosResponse } from "axios";

/** 백엔드가 요청마다 붙이는 요청 ID 헤더. CORS로 노출돼 브라우저가 읽을 수 있어요 */
const REQUEST_ID_HEADER = "X-Request-ID";

/** xhr 어댑터는 응답 헤더를 `AxiosHeaders`로 줘 이름의 대소문자를 가리지 않고 읽어요. 그 밖에는 소문자 이름으로 읽어요 */
const toRequestId = (headers: AxiosResponse["headers"]) => {
  const value =
    headers instanceof AxiosHeaders
      ? headers.get(REQUEST_ID_HEADER)
      : headers[REQUEST_ID_HEADER.toLowerCase()];

  return typeof value === "string" ? value : undefined;
};

/**
 * httpClient 요청 실패를 Sentry에서 찾고 거를 수 있게 요청 정보를 태그로 만들어요.
 * 요청 ID는 값이 요청마다 달라 태그 대신 따로 돌려줘요. BE 로그에서 같은 요청을 찾을 때 써요.
 *
 * - `http.method`, `http.path`(ID와 초대 토큰을 지운 경로), `http.status`(응답이 없으면 `none`)
 * - `http.error_type`: `HttpError`의 실패 이유. 예: `serverError`, `network`
 * - `error.code`: 응답 본문의 서버 오류 코드. 없으면 넣지 않아요
 * - `network.reason`: 응답을 받지 못한 실패의 원인(`timeout`, `aborted`, `network`)
 *
 * httpClient 요청의 실패가 아니거나 원래 axios 오류가 없으면 `undefined`를 돌려줘요.
 *
 * @example
 * getRequestErrorContext(error);
 * // { tags: { "http.method": "GET", "http.path": "/api/v1/workspaces/:id", "http.status": "500", ... }, requestId: "..." }
 */
export const getRequestErrorContext = (error: unknown) => {
  if (
    !isHttpError(error) ||
    !("cause" in error) ||
    !axios.isAxiosError(error.cause)
  ) {
    return undefined;
  }

  const { config, response } = error.cause;
  const networkReason = getNetworkFailureReason(error);
  const requestId = response && toRequestId(response.headers);

  return {
    tags: {
      "http.method": (config?.method ?? "get").toUpperCase(),
      ...(config?.url && { "http.path": toPathPattern(config.url) }),
      "http.status": response ? String(response.status) : "none",
      "http.error_type": error.type,
      ...(error.code && { "error.code": error.code }),
      ...(networkReason && { "network.reason": networkReason }),
    },
    ...(requestId && { requestId }),
  };
};
