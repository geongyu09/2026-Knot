import { describe, expect, it, vi } from "vitest";

import worker from ".";
import { relayToPostHog } from "./relay";

const SITE = "https://dev.knoted.kr";

// PostHog로 넘긴 요청을 받아 두고 정해 둔 응답을 돌려주는 가짜 바깥 요청 함수예요
const createUpstream = (response = new Response("ok", { status: 200 })) => {
  const requests: Request[] = [];
  const fetchUpstream = vi.fn(async (request: Request) => {
    requests.push(request);
    return response;
  });

  return { fetchUpstream, requests };
};

describe("relayToPostHog", () => {
  it("이벤트 전송은 경로와 쿼리를 그대로 두고 PostHog 수집 주소로 넘긴다", async () => {
    const { fetchUpstream, requests } = createUpstream();
    const body = JSON.stringify({ event: "$pageview" });

    await relayToPostHog(
      new Request(`${SITE}/relay/p/i/v0/e/?ver=1.438.10&compression=gzip-js`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
      }),
      fetchUpstream,
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
    const { fetchUpstream, requests } = createUpstream();

    await relayToPostHog(new Request(`${SITE}/relay/p${path}`), fetchUpstream);

    expect(requests[0].url).toBe(`https://us-assets.i.posthog.com${path}`);
  });

  it("우리 쿠키와 인증 헤더는 지우고, 방문자 IP를 X-Forwarded-For로 넘긴다", async () => {
    const { fetchUpstream, requests } = createUpstream();

    await relayToPostHog(
      new Request(`${SITE}/relay/p/s/`, {
        method: "POST",
        headers: {
          Cookie: "ph_session=abc",
          Authorization: "Bearer secret",
          "CF-Connecting-IP": "203.0.113.7",
        },
        body: "recording",
      }),
      fetchUpstream,
    );

    const { headers } = requests[0];
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-Forwarded-For")).toBe("203.0.113.7");
  });

  it("PostHog 응답의 상태와 본문은 그대로 돌려주고 Set-Cookie는 지운다", async () => {
    const { fetchUpstream } = createUpstream(
      new Response("bad request", {
        status: 400,
        headers: { "Set-Cookie": "tracker=1", "Content-Type": "text/plain" },
      }),
    );

    const response = await relayToPostHog(
      new Request(`${SITE}/relay/p/i/v0/e/`, { method: "POST", body: "x" }),
      fetchUpstream,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe("bad request");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Content-Type")).toBe("text/plain");
  });
});

describe("worker", () => {
  const createEnv = () => ({
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
  });

  it("중계 경로가 아닌 요청은 정적 파일로 돌려준다", async () => {
    const env = createEnv();
    const request = new Request(`${SITE}/workspace/1`);

    const response = await worker.fetch(request, env);

    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe("asset");
  });

  it("목적지가 정해지지 않은 중계 경로는 404를 돌려주고 정적 파일로도 넘기지 않는다", async () => {
    const env = createEnv();

    const response = await worker.fetch(new Request(`${SITE}/relay/x/y`), env);

    expect(response.status).toBe(404);
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });
});
