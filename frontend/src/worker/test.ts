import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { mockServer } from "@api/mock/server";

import worker from ".";

const SITE = "https://dev.knoted.kr";

describe("worker", () => {
  const createEnv = () => ({
    ASSETS: { fetch: vi.fn(async () => new Response("asset")) },
  });

  it("PostHog 중계 경로는 정적 파일로 넘기지 않고 PostHog로 넘긴다", async () => {
    const env = createEnv();
    mockServer.use(
      http.post("https://us.i.posthog.com/i/v0/e/", () =>
        HttpResponse.text("posthog"),
      ),
    );

    const response = await worker.fetch(
      new Request(`${SITE}/relay/p/i/v0/e/`, { method: "POST", body: "x" }),
      env,
    );

    expect(await response.text()).toBe("posthog");
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("중계 경로가 아닌 요청은 정적 파일로 돌려준다", async () => {
    const env = createEnv();
    const request = new Request(`${SITE}/workspace/1`);

    const response = await worker.fetch(request, env);

    expect(env.ASSETS.fetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe("asset");
  });

  it.each(["/relay", "/relay/p", "/relay/x/y"])(
    "목적지가 정해지지 않은 중계 경로(%s)는 404를 돌려주고 정적 파일로도 넘기지 않는다",
    async (path) => {
      const env = createEnv();

      const response = await worker.fetch(new Request(`${SITE}${path}`), env);

      expect(response.status).toBe(404);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );
});
