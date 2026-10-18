import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent } from "@sentry/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { initSentry } from "..";

/** 테스트에서 쓰는 DSN. 전송을 가로채 실제로는 보내지 않아요 */
const TEST_SENTRY_DSN = "https://public@o0.ingest.sentry.io/0";

const textOf = (body: string | Uint8Array) =>
  typeof body === "string" ? body : new TextDecoder().decode(body);

/** 봉투(envelope)의 줄 중 `event` 항목 바로 다음 줄이 그 이벤트의 본문이에요 */
const toErrorEvents = (body: string | Uint8Array) => {
  const lines = textOf(body)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  return lines.flatMap((line, index) =>
    line.type === "event" ? [lines[index + 1] as unknown as ErrorEvent] : [],
  );
};

/**
 * 테스트하는 동안 Sentry를 켜고, 실제로 보내는 대신 보내려던 오류 이벤트를 모아요. 테스트 파일이나 `describe` 안에서 불러요.
 *
 * 앱과 같은 `initSentry`로 켜서 보고 기준(`beforeSend`), 민감한 값 지우기, 중복 방지를 그대로 거쳐요.
 * 테스트마다 모은 이벤트를 비우고, 모두 끝나면 Sentry를 꺼요.
 */
export const setupSentryEvents = () => {
  const sentEvents: ErrorEvent[] = [];
  const transport: BrowserOptions["transport"] = (options) =>
    Sentry.createTransport(options, async ({ body }) => {
      sentEvents.push(...toErrorEvents(body));
      return {};
    });

  beforeAll(() => {
    initSentry({ dsn: TEST_SENTRY_DSN, environment: "test", transport });
  });

  afterEach(() => {
    sentEvents.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
  });

  /** 보내는 중인 이벤트까지 기다린 뒤 모은 이벤트를 돌려줘요. 기다리는 데 타이머를 써서 가짜 타이머에서는 끝나지 않아요 */
  const flushEvents = async () => {
    await Sentry.flush();
    return sentEvents;
  };

  return { flushEvents };
};
