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

  it("응답을 받지 못한 실패는 상태 코드 대신 실패 이유를 쓴다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.network,
      cause: axiosCause({ method: "get", url: "/api/v1/workspaces" }),
    });

    expect(getRequestErrorFingerprint(error)).toEqual([
      "GET",
      "/api/v1/workspaces",
      "network",
    ]);
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
