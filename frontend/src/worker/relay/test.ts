import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { mockServer } from "@api/mock/server";

import { relayToPostHog } from ".";

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
