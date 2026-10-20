import { httpClient } from "@api/httpClient";
import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { mockServer } from "@api/mock/server";
import { AxiosError, AxiosHeaders } from "axios";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { getNetworkFailureReason } from ".";

/** 응답을 받지 못한 httpClient 실패. xhr 어댑터가 던지는 axios 오류를 원래 오류로 담아요 */
const networkError = (message: string, code: string) =>
  createHttpError({
    type: HTTP_ERROR_TYPE.network,
    cause: new AxiosError(message, code, {
      url: "/api/v1/workspaces",
      headers: new AxiosHeaders(),
    }),
  });

describe("getNetworkFailureReason", () => {
  it("정한 시간 안에 응답이 오지 않은 실패는 timeout이다", () => {
    expect(
      getNetworkFailureReason(
        networkError("timeout of 10000ms exceeded", AxiosError.ECONNABORTED),
      ),
    ).toBe("timeout");
    expect(
      getNetworkFailureReason(
        networkError("timeout of 10000ms exceeded", AxiosError.ETIMEDOUT),
      ),
    ).toBe("timeout");
  });

  it("페이지를 떠나며 브라우저가 끊은 요청(Request aborted)은 aborted다", () => {
    expect(
      getNetworkFailureReason(
        networkError("Request aborted", AxiosError.ECONNABORTED),
      ),
    ).toBe("aborted");
  });

  it("연결하지 못한 요청은 network다", async () => {
    mockServer.use(
      http.get("*/__network-failure-reason", () => HttpResponse.error()),
    );

    const error = await httpClient
      .get("/__network-failure-reason")
      .catch((e: unknown) => e);

    expect(getNetworkFailureReason(error)).toBe("network");
  });

  it("원래 오류가 없는 network 실패는 network다", () => {
    expect(
      getNetworkFailureReason(
        createHttpError({ type: HTTP_ERROR_TYPE.network }),
      ),
    ).toBe("network");
  });

  it("응답을 받은 실패와 요청이 아닌 오류는 원인을 정하지 않는다", () => {
    expect(
      getNetworkFailureReason(
        createHttpError({ type: HTTP_ERROR_TYPE.serverError }),
      ),
    ).toBe(undefined);
    expect(getNetworkFailureReason(new Error("렌더링 실패"))).toBe(undefined);
  });
});
