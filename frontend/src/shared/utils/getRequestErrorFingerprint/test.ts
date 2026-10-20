import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { getRequestErrorFingerprint } from ".";

interface AxiosCauseParams {
  method: string;
  url: string;
  status?: number;
}

/** httpClient가 던지는 HttpError의 원래 오류(axios 오류) */
const axiosCause = ({ method, url, status }: AxiosCauseParams) => {
  const config = { method, url, headers: new AxiosHeaders() };

  return new AxiosError(
    "요청 실패",
    undefined,
    config,
    undefined,
    status === undefined
      ? undefined
      : { status, statusText: "", headers: {}, config, data: undefined },
  );
};

describe("getRequestErrorFingerprint", () => {
  it("메서드, 숫자 ID를 지운 경로, 상태 코드, 서버 오류 코드로 묶음 기준을 만든다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.serverError,
      code: "INTERNAL_SERVER_ERROR",
      cause: axiosCause({
        method: "get",
        url: "/api/v1/workspaces/12/documents/345",
        status: 500,
      }),
    });

    expect(getRequestErrorFingerprint(error)).toEqual([
      "GET",
      "/api/v1/workspaces/:id/documents/:id",
      "500",
      "INTERNAL_SERVER_ERROR",
    ]);
  });

  it("서버 오류 코드가 없으면 메서드, 경로, 상태 코드만 쓴다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.serverError,
      cause: axiosCause({
        method: "post",
        url: "/api/v1/workspaces/12/recordings",
        status: 503,
      }),
    });

    expect(getRequestErrorFingerprint(error)).toEqual([
      "POST",
      "/api/v1/workspaces/:id/recordings",
      "503",
    ]);
  });

  it("주소의 오리진, 쿼리 파라미터, 해시를 빼고 경로만 쓴다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.serverError,
      cause: axiosCause({
        method: "get",
        url: "https://api.knoted.kr/api/v1/workspaces/12/search?keyword=회의록#top",
        status: 500,
      }),
    });

    expect(getRequestErrorFingerprint(error)?.[1]).toBe(
      "/api/v1/workspaces/:id/search",
    );
  });

  it("경로의 초대 토큰을 가린다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.clientError,
      cause: axiosCause({
        method: "get",
        url: "/api/v1/invitations/secret-token",
        status: 410,
      }),
    });

    expect(getRequestErrorFingerprint(error)).toEqual([
      "GET",
      "/api/v1/invitations/[token]",
      "410",
    ]);
  });

  describe("응답을 받지 못한 실패", () => {
    /** 응답을 받지 못한 httpClient 실패. xhr 어댑터가 던지는 axios 오류를 원래 오류로 담아요 */
    const networkError = (url: string, message: string, code?: string) =>
      createHttpError({
        type: HTTP_ERROR_TYPE.network,
        cause: new AxiosError(message, code, {
          method: "get",
          url,
          headers: new AxiosHeaders(),
        }),
      });

    // 연결이 한 번 끊기면 화면에 떠 있던 요청이 함께 실패해요. API의 결함이 아니라 API별로 나누지 않아요
    it("연결 실패는 API와 관계없이 하나로 묶는다", () => {
      expect(
        getRequestErrorFingerprint(
          networkError("/api/v1/workspaces/1/documents", "Network Error"),
        ),
      ).toEqual(["http-network", "network"]);
      expect(
        getRequestErrorFingerprint(networkError("/api/v1/me", "Network Error")),
      ).toEqual(["http-network", "network"]);
    });

    it("페이지를 떠나며 끊긴 요청은 끊김끼리 하나로 묶는다", () => {
      expect(
        getRequestErrorFingerprint(
          networkError(
            "/api/v1/me",
            "Request aborted",
            AxiosError.ECONNABORTED,
          ),
        ),
      ).toEqual(["http-network", "aborted"]);
    });

    // 느린 API를 찾을 수 있게 시간 초과만 API별로 남겨요
    it("시간 초과는 메서드, 경로, timeout으로 API마다 나눈다", () => {
      expect(
        getRequestErrorFingerprint(
          networkError(
            "/api/v1/workspaces/1/documents",
            "timeout of 10000ms exceeded",
            AxiosError.ECONNABORTED,
          ),
        ),
      ).toEqual(["GET", "/api/v1/workspaces/:id/documents", "timeout"]);
    });
  });

  it("httpClient 요청의 실패가 아니면 묶음 기준을 정하지 않는다", () => {
    expect(getRequestErrorFingerprint(new Error("렌더링 실패"))).toBe(
      undefined,
    );
    expect(
      getRequestErrorFingerprint(
        createHttpError({ type: HTTP_ERROR_TYPE.serverError }),
      ),
    ).toBe(undefined);
  });
});
