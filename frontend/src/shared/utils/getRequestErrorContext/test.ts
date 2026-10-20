import { httpClient } from "@api/httpClient";
import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { mockServer } from "@api/mock/server";
import { AxiosError, AxiosHeaders } from "axios";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { getRequestErrorContext } from ".";

const requestError = (request: Promise<unknown>) =>
  request.catch((error: unknown) => error);

describe("getRequestErrorContext", () => {
  it("응답을 받은 실패는 메서드, ID를 지운 경로, 상태 코드, 실패 이유, 서버 오류 코드를 태그로, 요청 ID를 따로 돌려준다", async () => {
    mockServer.use(
      http.get("*/api/v1/workspaces/:workspaceId/documents/:documentId", () =>
        HttpResponse.json(
          { code: "INTERNAL_SERVER_ERROR" },
          { status: 500, headers: { "X-Request-ID": "req-123" } },
        ),
      ),
    );

    const error = await requestError(
      httpClient.get("/api/v1/workspaces/12/documents/345?keyword=회의록"),
    );

    expect(getRequestErrorContext(error)).toEqual({
      tags: {
        "http.method": "GET",
        "http.path": "/api/v1/workspaces/:id/documents/:id",
        "http.status": "500",
        "http.error_type": HTTP_ERROR_TYPE.serverError,
        "error.code": "INTERNAL_SERVER_ERROR",
      },
      requestId: "req-123",
    });
  });

  it("서버 오류 코드와 요청 ID가 없으면 그 값은 넣지 않는다", async () => {
    mockServer.use(
      http.post(
        "*/__request-error-context",
        () => new HttpResponse(null, { status: 503 }),
      ),
    );

    const error = await requestError(
      httpClient.post("/__request-error-context"),
    );

    expect(getRequestErrorContext(error)).toEqual({
      tags: {
        "http.method": "POST",
        "http.path": "/__request-error-context",
        "http.status": "503",
        "http.error_type": HTTP_ERROR_TYPE.serverError,
      },
    });
  });

  it("응답을 받지 못한 실패는 상태 코드를 none으로, 실패 원인을 network.reason으로 붙인다", () => {
    const error = createHttpError({
      type: HTTP_ERROR_TYPE.network,
      cause: new AxiosError(
        "timeout of 10000ms exceeded",
        AxiosError.ECONNABORTED,
        { method: "get", url: "/api/v1/me", headers: new AxiosHeaders() },
      ),
    });

    expect(getRequestErrorContext(error)).toEqual({
      tags: {
        "http.method": "GET",
        "http.path": "/api/v1/me",
        "http.status": "none",
        "http.error_type": HTTP_ERROR_TYPE.network,
        "network.reason": "timeout",
      },
    });
  });

  it("httpClient 요청의 실패가 아니면 요청 정보를 정하지 않는다", () => {
    expect(getRequestErrorContext(new Error("렌더링 실패"))).toBe(undefined);
    expect(
      getRequestErrorContext(
        createHttpError({ type: HTTP_ERROR_TYPE.serverError }),
      ),
    ).toBe(undefined);
  });
});
