import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";

import { scrubSentryBreadcrumb, scrubSentryEvent } from ".";

const errorEvent = (event: Partial<ErrorEvent>): ErrorEvent => ({
  type: undefined,
  ...event,
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

  it("원래 이벤트는 바꾸지 않는다", () => {
    scrubSentryEvent(event);

    expect(event.request?.cookies).toEqual({ KNOT_ACCESS: "access-token" });
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
