import { isHttpError } from "@api/httpClient/error";
import { getNetworkFailureReason } from "@utils/getNetworkFailureReason";
import { scrubUrl } from "@utils/scrubSentryEvent";
import axios from "axios";

/** 응답을 받지 못한 실패를 API와 관계없이 묶는 이름. 뒤에 원인을 붙여요 */
const NETWORK_FINGERPRINT = "http-network";

/** 숫자만으로 된 경로 조각. 워크스페이스, 녹음, 문서 ID예요 */
const NUMERIC_SEGMENT_PATTERN = /\/\d+(?=\/|$)/g;

/** 주소에서 오리진, 쿼리 파라미터, 해시를 빼고 숫자 ID와 초대 토큰을 지운 경로 */
export const toPathPattern = (url: string) =>
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
 *
 * 응답을 받지 못한 실패는 API의 결함이 아니라 연결 문제라서, API와 관계없이 원인(`network`, `aborted`)별로 하나로 묶어요.
 * 연결이 한 번 끊겨 화면의 요청 여러 개가 함께 실패해도 Issue가 하나만 생겨요. 어느 API였는지는 `http.path` 태그로 봐요.
 * 시간 초과(`timeout`)만은 느린 API를 찾을 수 있게 API마다 나눠요.
 * httpClient 요청의 실패가 아니거나 요청 정보가 없으면 `undefined`를 돌려줘 기본 기준을 그대로 써요.
 *
 * @example
 * getRequestErrorFingerprint(error); // ["GET", "/api/v1/workspaces/:id/documents", "500", "INTERNAL_SERVER_ERROR"]
 * getRequestErrorFingerprint(networkError); // ["http-network", "network"]
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

  const method = (config.method ?? "get").toUpperCase();
  const path = toPathPattern(config.url);
  const networkReason = getNetworkFailureReason(error);

  if (networkReason === "timeout") return [method, path, networkReason];
  if (networkReason) return [NETWORK_FINGERPRINT, networkReason];

  const fingerprint = [method, path, String(response?.status ?? error.type)];

  return error.code ? [...fingerprint, error.code] : fingerprint;
};
