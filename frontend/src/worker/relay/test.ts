import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { mockServer } from "@api/mock/server";

import { relayToPostHog, relayToSentry } from ".";

const SITE = "https://dev.knoted.kr";

/** PostHog 두 주소로 넘어간 요청을 꺼내 볼 수 있게 남기고, 정해 둔 응답을 돌려줘요 */
const capturePostHogRequests = (
  createResponse = () => new HttpResponse("ok"),
) => {
  const requests: Request[] = [];
  const capture = ({ request }: { request: Request }) => {
    requests.push(request.clone());

    return createResponse();
  };

  mockServer.use(
    http.all("https://us.i.posthog.com/*", capture),
    http.all("https://us-assets.i.posthog.com/*", capture),
  );

  return requests;
};

describe("relayToPostHog", () => {
  it("이벤트 전송은 경로와 쿼리를 그대로 두고 PostHog 수집 주소로 넘긴다", async () => {
    const requests = capturePostHogRequests();
    const body = JSON.stringify({ event: "$pageview" });

    await relayToPostHog(
      new Request(`${SITE}/relay/p/i/v0/e/?ver=1.438.10&compression=gzip-js`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      }),
    );

    const [upstream] = requests;
    expect(upstream.url).toBe(
      "https://us.i.posthog.com/i/v0/e/?ver=1.438.10&compression=gzip-js",
    );
    expect(upstream.method).toBe("POST");
    expect(upstream.headers.get("Content-Type")).toBe("text/plain");
    expect(await upstream.text()).toBe(body);
  });

  it.each([
    "/static/1.438.10/posthog-recorder.js",
    "/array/phc_test/config.js",
  ])("스크립트 · 설정 파일(%s)은 PostHog 파일 주소로 넘긴다", async (path) => {
    const requests = capturePostHogRequests();

    await relayToPostHog(new Request(`${SITE}/relay/p${path}`));

    expect(requests[0].url).toBe(`https://us-assets.i.posthog.com${path}`);
  });

  it.each(["/relay/p.evil.com/x", "/relay/p@evil.com/x"])(
    "경로(%s)가 무엇이든 목적지 호스트는 PostHog 주소에서 바뀌지 않는다",
    async (path) => {
      const requests = capturePostHogRequests();

      await relayToPostHog(new Request(`${SITE}${path}`));

      expect(new URL(requests[0].url).host).toBe("us.i.posthog.com");
    },
  );

  it("우리 쿠키와 인증 헤더는 지우고, 방문자 IP를 X-Forwarded-For로 넘긴다", async () => {
    const requests = capturePostHogRequests();

    // msw가 켜져 있으면 본문 있는 요청의 헤더를 복사할 때 Cookie가 빠져서, 지우는 코드가 없어도 통과해요. 그래서 본문 없는 요청으로 확인해요
    await relayToPostHog(
      new Request(`${SITE}/relay/p/array/phc_test/config.js`, {
        headers: {
          Cookie: "ph_session=abc",
          Authorization: "Bearer secret",
          "CF-Connecting-IP": "203.0.113.7",
        },
      }),
    );

    const { headers } = requests[0];
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-Forwarded-For")).toBe("203.0.113.7");
  });

  it("PostHog 응답의 상태와 본문은 그대로 돌려주고 Set-Cookie는 지운다", async () => {
    capturePostHogRequests(
      () =>
        new HttpResponse("bad request", {
          status: 400,
          headers: { "Set-Cookie": "tracker=1", "Content-Type": "text/plain" },
        }),
    );

    const response = await relayToPostHog(
      new Request(`${SITE}/relay/p/i/v0/e/`, { method: "POST", body: "x" }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("bad request");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("text/plain");
  });
});

describe("relayToSentry", () => {
  const SENTRY_ENVELOPE_URL =
    "https://o4512278291283968.ingest.us.sentry.io/api/4512278350069760/envelope/";
  /** 우리 프로젝트의 DSN. 공개 키 자리는 테스트용 값이에요 */
  const OUR_DSN =
    "https://publickey@o4512278291283968.ingest.us.sentry.io/4512278350069760";

  /** SDK가 보내는 모양의 envelope. 첫 줄 머리에 DSN이 있어요 */
  const toEnvelope = (header: object) =>
    [
      JSON.stringify(header),
      JSON.stringify({ type: "event" }),
      JSON.stringify({ message: "오류" }),
    ].join("\n");

  const toRelayRequest = (body: string, init: RequestInit = {}) =>
    new Request(`${SITE}/relay/s`, { method: "POST", body, ...init });

  /** Sentry envelope 주소로 넘어간 요청을 남기고, 정해 둔 응답을 돌려줘요 */
  const captureSentryRequests = (
    createResponse = () => new HttpResponse("{}"),
  ) => {
    const requests: Request[] = [];
    mockServer.use(
      http.post(SENTRY_ENVELOPE_URL, ({ request }) => {
        requests.push(request.clone());

        return createResponse();
      }),
    );

    return requests;
  };

  it("우리 프로젝트의 envelope는 본문 그대로 그 프로젝트의 envelope 주소로 넘긴다", async () => {
    const requests = captureSentryRequests();
    const envelope = toEnvelope({ event_id: "a1", dsn: OUR_DSN });

    await relayToSentry(
      toRelayRequest(envelope, {
        headers: { "Content-Type": "application/x-sentry-envelope" },
      }),
    );

    const [upstream] = requests;
    expect(upstream.url).toBe(SENTRY_ENVELOPE_URL);
    expect(upstream.method).toBe("POST");
    expect(upstream.headers.get("Content-Type")).toBe(
      "application/x-sentry-envelope",
    );
    expect(await upstream.text()).toBe(envelope);
  });

  it.each([
    {
      reason: "다른 프로젝트",
      dsn: "https://publickey@o4512278291283968.ingest.us.sentry.io/1",
    },
    {
      reason: "다른 수집 주소",
      dsn: "https://publickey@evil.example.com/4512278350069760",
    },
  ])("$reason의 DSN이면 넘기지 않고 403을 돌려준다", async ({ dsn }) => {
    const requests = captureSentryRequests();

    const response = await relayToSentry(
      toRelayRequest(toEnvelope({ event_id: "a1", dsn })),
    );

    expect(response.status).toBe(403);
    expect(requests).toHaveLength(0);
  });

  it.each([
    { reason: "첫 줄이 JSON이 아니면", body: "not-json\n{}" },
    { reason: "머리에 DSN이 없으면", body: toEnvelope({ event_id: "a1" }) },
    {
      reason: "DSN이 주소가 아니면",
      body: toEnvelope({ event_id: "a1", dsn: "not a url" }),
    },
  ])("$reason 넘기지 않고 400을 돌려준다", async ({ body }) => {
    const requests = captureSentryRequests();

    const response = await relayToSentry(toRelayRequest(body));

    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it("POST가 아니면 넘기지 않고 405를 돌려준다", async () => {
    const requests = captureSentryRequests();

    const response = await relayToSentry(
      new Request(`${SITE}/relay/s`, { method: "GET" }),
    );

    expect(response.status).toBe(405);
    expect(requests).toHaveLength(0);
  });

  it("우리 쿠키와 인증 헤더는 넘기지 않는다", async () => {
    // msw가 켜져 있으면 본문 있는 요청의 헤더를 복사할 때 헤더가 빠져, 지우는 코드가 없어도 통과해요.
    // 그래서 이 테스트만 msw를 끄고 fetch를 바꿔 넘긴 요청을 봐요.
    // vi.spyOn으로 바꾸면 되돌린 뒤 msw를 다시 켜도 가로채지 못해, 다음 테스트가 실제 주소로 요청해요
    mockServer.close();
    const originalFetch = globalThis.fetch;
    const fetchUpstream = vi.fn().mockResolvedValue(new Response("{}"));
    globalThis.fetch = fetchUpstream;

    try {
      await relayToSentry(
        toRelayRequest(toEnvelope({ event_id: "a1", dsn: OUR_DSN }), {
          headers: { Cookie: "KNOT_SESSION=abc", Authorization: "Bearer x" },
        }),
      );

      const [upstream] = fetchUpstream.mock.calls[0] as [Request];
      expect(upstream.headers.get("Cookie")).toBeNull();
      expect(upstream.headers.get("Authorization")).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
      mockServer.listen({ onUnhandledRequest: "error" });
    }
  });

  it("Sentry 응답의 상태와 본문은 그대로 돌려주고 Set-Cookie는 지운다", async () => {
    captureSentryRequests(
      () =>
        new HttpResponse("rate limited", {
          status: 429,
          headers: { "Set-Cookie": "tracker=1", "Retry-After": "60" },
        }),
    );

    const response = await relayToSentry(
      toRelayRequest(toEnvelope({ event_id: "a1", dsn: OUR_DSN })),
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("rate limited");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });
});
