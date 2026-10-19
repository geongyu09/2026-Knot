import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";

import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
  type StreamedSpan,
} from ".";

const errorEvent = (event: Partial<ErrorEvent>): ErrorEvent => ({
  type: undefined,
  ...event,
});

const streamedSpan = (
  span: Pick<StreamedSpan, "name" | "attributes">,
): StreamedSpan => ({
  trace_id: "trace",
  span_id: "span",
  start_timestamp: 0,
  status: "ok",
  is_segment: false,
  ...span,
});

describe("scrubSentryEvent", () => {
  const event = errorEvent({
    request: {
      url: "https://knoted.kr/workspace/1/documents?keyword=회의록#top",
      method: "GET",
      cookies: { KNOT_ACCESS: "access-token" },
      headers: {
        Cookie: "KNOT_ACCESS=access-token",
        Authorization: "Bearer access-token",
        "X-XSRF-TOKEN": "csrf-token",
        Referer: "https://knoted.kr/login?redirect=/workspace",
        "User-Agent": "Mozilla/5.0",
      },
      data: { nickname: "유월" },
      query_string: "keyword=회의록",
    },
  });

  it("쿠키 · 인증 헤더 · 요청 본문 · 쿼리 문자열을 지운다", () => {
    const { request } = scrubSentryEvent(event);

    expect(request).not.toHaveProperty("cookies");
    expect(request).not.toHaveProperty("data");
    expect(request).not.toHaveProperty("query_string");
    expect(request?.headers).toEqual({
      Referer: "https://knoted.kr/login",
      "User-Agent": "Mozilla/5.0",
    });
  });

  it("주소에서 쿼리 파라미터와 해시를 지운다", () => {
    expect(scrubSentryEvent(event).request?.url).toBe(
      "https://knoted.kr/workspace/1/documents",
    );
  });

  it("주소에 든 초대 토큰을 가린다", () => {
    const scrubbed = scrubSentryEvent(
      errorEvent({ request: { url: "https://knoted.kr/invite/secret-token" } }),
    );

    expect(scrubbed.request?.url).toBe("https://knoted.kr/invite/[token]");
  });

  it("이벤트에 담긴 기록(breadcrumb)도 함께 지운다", () => {
    const scrubbed = scrubSentryEvent(
      errorEvent({
        breadcrumbs: [
          {
            category: "fetch",
            data: { url: "/api/v1/invitations/ABC123?x=1", body: "{}" },
          },
        ],
      }),
    );

    expect(scrubbed.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "/api/v1/invitations/[token]" } },
    ]);
  });

  // 성능 추적을 켜면 오류가 난 화면의 이름(transaction)이 붙어요. 라우트를 찾기 전에는 주소 그대로예요
  it("화면 이름(transaction)에서 쿼리 파라미터와 초대 토큰을 지운다", () => {
    const scrubbed = scrubSentryEvent(
      errorEvent({ transaction: "/invite/secret-token?from=mail" }),
    );

    expect(scrubbed.transaction).toBe("/invite/[token]");
  });

  it("원래 이벤트는 바꾸지 않는다", () => {
    scrubSentryEvent(event);

    expect(event.request?.cookies).toEqual({ KNOT_ACCESS: "access-token" });
  });
});

describe("scrubSentrySpan", () => {
  const span = streamedSpan({
    name: "GET https://api.knoted.kr/api/v1/invitations/ABC123?code=1",
    attributes: {
      "url.full":
        "https://knoted.kr/invite/secret-token?redirect=/workspace#top",
      "url.path": "/invite/secret-token",
      "http.target": "/api/v1/workspaces/1/search?keyword=회의록",
      "sentry.segment.name": "/invite/secret-token",
      "url.query": "?redirect=/workspace",
      "url.fragment": "#top",
      "http.query": "keyword=회의록",
      "http.fragment": "top",
      "sentry.op": "http.client",
      "http.response.status_code": 200,
      "browser.web_vital.lcp.url": {
        value: "https://knoted.kr/invite/secret-token?x=1",
        unit: "none",
      },
    },
  });

  it("이름에 든 주소의 쿼리 파라미터와 초대 토큰을 지운다", () => {
    expect(scrubSentrySpan(span).name).toBe(
      "GET https://api.knoted.kr/api/v1/invitations/[token]",
    );
  });

  it("속성에 든 주소의 쿼리 파라미터, 해시, 초대 토큰을 지운다", () => {
    expect(scrubSentrySpan(span).attributes).toMatchObject({
      "url.full": "https://knoted.kr/invite/[token]",
      "url.path": "/invite/[token]",
      "http.target": "/api/v1/workspaces/1/search",
      "sentry.segment.name": "/invite/[token]",
      "browser.web_vital.lcp.url": {
        value: "https://knoted.kr/invite/[token]",
        unit: "none",
      },
    });
  });

  it("쿼리 파라미터와 해시만 담은 속성을 지운다", () => {
    const { attributes } = scrubSentrySpan(span);

    expect(attributes).not.toHaveProperty("url.query");
    expect(attributes).not.toHaveProperty("url.fragment");
    expect(attributes).not.toHaveProperty("http.query");
    expect(attributes).not.toHaveProperty("http.fragment");
  });

  it("주소가 아닌 이름과 속성은 그대로 둔다", () => {
    const interaction = streamedSpan({
      name: "body > div#root > button.submit",
      attributes: { "sentry.op": "ui.interaction.click" },
    });

    expect(scrubSentrySpan(interaction)).toEqual(interaction);
    expect(scrubSentrySpan(span).attributes).toMatchObject({
      "sentry.op": "http.client",
      "http.response.status_code": 200,
    });
  });

  it("원래 span은 바꾸지 않는다", () => {
    scrubSentrySpan(span);

    expect(span.attributes["url.path"]).toBe("/invite/secret-token");
  });
});

describe("scrubSentryBreadcrumb", () => {
  it.each(["fetch", "xhr"])(
    "%s 기록은 메서드 · 쿼리를 뺀 주소 · 상태 코드만 남긴다",
    (category) => {
      const breadcrumb: Breadcrumb = {
        category,
        type: "http",
        data: {
          method: "POST",
          url: "https://api.knoted.kr/api/v1/workspaces/1/search?keyword=회의록",
          status_code: 500,
          request_body: '{"question":"지난 회의 결정"}',
          response_body: '{"code":"INTERNAL_SERVER_ERROR"}',
          request_body_size: 30,
        },
      };

      expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({
        category,
        type: "http",
        data: {
          method: "POST",
          url: "https://api.knoted.kr/api/v1/workspaces/1/search",
          status_code: 500,
        },
      });
    },
  );

  it("화면 이동 기록의 주소에서 쿼리와 초대 토큰을 지운다", () => {
    const breadcrumb: Breadcrumb = {
      category: "navigation",
      data: { from: "/invite/secret-token", to: "/login?redirect=/workspace" },
    };

    expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({
      category: "navigation",
      data: { from: "/invite/[token]", to: "/login" },
    });
  });

  it("콘솔 기록에서 로그에 넘긴 값(요청 설정 · 본문이 든 오류 객체)을 지운다", () => {
    const breadcrumb: Breadcrumb = {
      category: "console",
      level: "error",
      message: "닉네임 등록 요청에 실패했어요",
      data: {
        logger: "console",
        arguments: [
          "닉네임 등록 요청에 실패했어요",
          { config: { data: "{}" } },
        ],
      },
    };

    expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({
      category: "console",
      level: "error",
      message: "닉네임 등록 요청에 실패했어요",
      data: { logger: "console" },
    });
  });

  it.each(["ui.input", "ui.click"])(
    "%s 기록은 요소 위치만 남기고 입력 값 같은 부가 값을 지운다",
    (category) => {
      const breadcrumb: Breadcrumb = {
        category,
        message: "input.nickname",
        data: { value: "유월" },
      };

      expect(scrubSentryBreadcrumb(breadcrumb)).toEqual({
        category,
        message: "input.nickname",
      });
    },
  );
});
