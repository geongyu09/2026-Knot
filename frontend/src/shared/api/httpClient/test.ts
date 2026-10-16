import { AUTH_CSRF_API_PATH } from "@api/fetch/api/v1/auth/csrf";
import { AUTH_REFRESH_API_PATH } from "@api/fetch/api/v1/auth/refresh";
import { mockServer } from "@api/mock/server";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { getCsrfToken, httpClient } from ".";
import { HTTP_ERROR_TYPE, isHttpError } from "./error";

// 인스턴스 동작만 보는 임시 경로예요
const TEST_PATH = "/__http-client-test";

const CSRF_HEADER_NAME = "X-XSRF-TOKEN";

/** 받은 CSRF 헤더 값을 응답으로 돌려주는 핸들러 */
const echoCsrfHeader = (method: "get" | "post") =>
  http[method](`*${TEST_PATH}`, ({ request }) =>
    HttpResponse.json({ csrf: request.headers.get(CSRF_HEADER_NAME) }),
  );

/** 호출마다 다른 토큰을 내려주는 CSRF 발급 핸들러 */
const rotatingCsrfHandler = () => {
  let issued = 0;

  return http.get(`*${AUTH_CSRF_API_PATH}`, () => {
    issued += 1;
    return HttpResponse.json({ token: `token-${issued}` });
  });
};

// 토큰 캐시가 모듈에 남으므로, 매 테스트가 시작할 때 들고 있는 토큰을 기준으로 기대값을 잡아요
describe("httpClient의 CSRF 처리", () => {
  it("조회 요청에는 CSRF 토큰을 붙이지 않는다", async () => {
    mockServer.use(echoCsrfHeader("get"));

    const { data } = await httpClient.get(TEST_PATH);

    expect(data.csrf).toBeNull();
  });

  it("상태를 바꾸는 요청에는 CSRF 토큰을 헤더로 붙인다", async () => {
    mockServer.use(echoCsrfHeader("post"));

    const { data } = await httpClient.post(TEST_PATH);

    expect(data.csrf).toBe(await getCsrfToken());
  });

  it("403이 오면 토큰을 새로 받아 한 번 다시 보낸다", async () => {
    let attempts = 0;
    mockServer.use(
      rotatingCsrfHandler(),
      http.post(`*${TEST_PATH}`, ({ request }) => {
        attempts += 1;
        if (attempts === 1) return new HttpResponse(null, { status: 403 });

        return HttpResponse.json({ csrf: request.headers.get(CSRF_HEADER_NAME) });
      }),
    );

    const { data } = await httpClient.post(TEST_PATH);

    expect(attempts).toBe(2);
    expect(data.csrf).toBe("token-1");
  });

  it("다시 보낸 요청도 403이면 더 보내지 않고 실패한다", async () => {
    let attempts = 0;
    mockServer.use(
      rotatingCsrfHandler(),
      http.post(`*${TEST_PATH}`, () => {
        attempts += 1;
        return new HttpResponse(null, { status: 403 });
      }),
    );

    const error = await httpClient.post(TEST_PATH).catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.forbidden)).toBe(true);
    expect(attempts).toBe(2);
  });
});

/** 받은 재발급 요청 수와 그때의 CSRF 헤더를 기록하는 재발급 핸들러 */
const countingRefreshHandler = ({ status = 204 }: { status?: number } = {}) => {
  const calls: (string | null)[] = [];
  const handler = http.post(`*${AUTH_REFRESH_API_PATH}`, ({ request }) => {
    calls.push(request.headers.get(CSRF_HEADER_NAME));
    return new HttpResponse(null, { status });
  });

  return { handler, calls };
};

/** 처음 `failures`번은 `status`로 실패하고 그 뒤로는 성공하는 조회 핸들러. 받은 요청 수를 셉니다 */
const failingThenOkHandler = ({
  status,
  failures,
}: {
  status: number;
  failures: number;
}) => {
  const attempts = { count: 0 };
  const handler = http.get(`*${TEST_PATH}`, () => {
    attempts.count += 1;
    if (attempts.count <= failures) return new HttpResponse(null, { status });

    return HttpResponse.json({ ok: true });
  });

  return { handler, attempts };
};

describe("httpClient의 토큰 재발급", () => {
  it("401이 오면 토큰을 재발급하고 원래 요청을 한 번 다시 보낸다", async () => {
    const refresh = countingRefreshHandler();
    const request = failingThenOkHandler({ status: 401, failures: 1 });
    mockServer.use(refresh.handler, request.handler);

    const { data } = await httpClient.get(TEST_PATH);

    expect(data).toEqual({ ok: true });
    expect(request.attempts.count).toBe(2);
    expect(refresh.calls).toHaveLength(1);
  });

  it("재발급 요청에는 CSRF 토큰을 붙인다", async () => {
    const refresh = countingRefreshHandler();
    mockServer.use(
      refresh.handler,
      failingThenOkHandler({ status: 401, failures: 1 }).handler,
    );

    await httpClient.get(TEST_PATH);

    expect(refresh.calls[0]).toBe(await getCsrfToken());
  });

  it("재발급이 실패하면 원래 요청을 다시 보내지 않고 401로 실패한다", async () => {
    const refresh = countingRefreshHandler({ status: 401 });
    const request = failingThenOkHandler({ status: 401, failures: 1 });
    mockServer.use(refresh.handler, request.handler);

    const error = await httpClient.get(TEST_PATH).catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.unauthorized)).toBe(true);
    expect(request.attempts.count).toBe(1);
    expect(refresh.calls).toHaveLength(1);
  });

  it("다시 보낸 요청도 401이면 더 재발급하지 않고 401로 실패한다", async () => {
    const refresh = countingRefreshHandler();
    const request = failingThenOkHandler({ status: 401, failures: 2 });
    mockServer.use(refresh.handler, request.handler);

    const error = await httpClient.get(TEST_PATH).catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.unauthorized)).toBe(true);
    expect(request.attempts.count).toBe(2);
    expect(refresh.calls).toHaveLength(1);
  });

  it("401이 아닌 실패에는 재발급하지 않는다", async () => {
    const refresh = countingRefreshHandler();
    const request = failingThenOkHandler({ status: 500, failures: 1 });
    mockServer.use(refresh.handler, request.handler);

    const error = await httpClient.get(TEST_PATH).catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.serverError)).toBe(true);
    expect(refresh.calls).toHaveLength(0);
  });

  it("재발급 요청 자체가 401이면 재발급을 다시 부르지 않는다", async () => {
    const refresh = countingRefreshHandler({ status: 401 });
    mockServer.use(refresh.handler);

    const error = await httpClient
      .post(AUTH_REFRESH_API_PATH)
      .catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.unauthorized)).toBe(true);
    expect(refresh.calls).toHaveLength(1);
  });

  it("CSRF 토큰 조회가 401이면 재발급을 부르지 않는다", async () => {
    const refresh = countingRefreshHandler();
    mockServer.use(
      refresh.handler,
      http.get(
        `*${AUTH_CSRF_API_PATH}`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );

    const error = await httpClient
      .get(AUTH_CSRF_API_PATH)
      .catch((e: unknown) => e);

    expect(isHttpError(error, HTTP_ERROR_TYPE.unauthorized)).toBe(true);
    expect(refresh.calls).toHaveLength(0);
  });
});
