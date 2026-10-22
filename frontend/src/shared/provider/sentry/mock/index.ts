import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent } from "@sentry/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { initSentry } from "..";

/** 테스트에서 쓰는 DSN. 전송을 가로채 실제로는 보내지 않아요 */
const TEST_SENTRY_DSN = "https://public@o0.ingest.sentry.io/0";

const textOf = (body: string | Uint8Array) =>
  typeof body === "string" ? body : new TextDecoder().decode(body);

/** 봉투(envelope)의 줄 중 `type` 항목 바로 다음 줄이 그 항목의 본문이에요 */
const toEnvelopeItems = (body: string | Uint8Array, type: string) => {
  const lines = textOf(body)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  return lines.flatMap((line, index) =>
    line.type === type ? [lines[index + 1]] : [],
  );
};

/** 보낸 지표 하나. 속성은 `{ type, value }` 모양으로 바뀌어 나가요 */
interface SentMetricItem {
  name: string;
  value: number;
  attributes: Record<string, { value: unknown }>;
}

/** 테스트에서 비교하기 쉽게 속성을 값만 남긴 지표 */
export interface SentMetric {
  name: string;
  value: number;
  attributes: Record<string, unknown>;
}

/** 지표는 여러 개가 한 항목의 `items`에 묶여 와요. SDK가 더하는 `sentry.` 속성은 빼요 */
const toMetrics = (body: string | Uint8Array) =>
  (
    toEnvelopeItems(body, "trace_metric") as unknown as {
      items: SentMetricItem[];
    }[]
  ).flatMap(({ items }) =>
    items.map(({ name, value, attributes }) => ({
      name,
      value,
      attributes: Object.fromEntries(
        Object.entries(attributes)
          .filter(([key]) => !key.startsWith("sentry."))
          .map(([key, attribute]) => [key, attribute.value]),
      ),
    })),
  );

/**
 * 테스트하는 동안 Sentry를 켜고, 실제로 보내는 대신 보내려던 오류 이벤트와 지표를 모아요. 테스트 파일이나 `describe` 안에서 불러요.
 *
 * 앱과 같은 `initSentry`로 켜서 보고 기준(`beforeSend`), 민감한 값 지우기, 중복 방지를 그대로 거쳐요.
 * 테스트마다 모은 이벤트와 지표를 비우고, 모두 끝나면 Sentry를 꺼요.
 */
export const setupSentryEvents = () => {
  const sentEvents: ErrorEvent[] = [];
  const sentMetrics: SentMetric[] = [];
  const transport: BrowserOptions["transport"] = (options) =>
    Sentry.createTransport(options, async ({ body }) => {
      sentEvents.push(
        ...(toEnvelopeItems(body, "event") as unknown as ErrorEvent[]),
      );
      sentMetrics.push(...toMetrics(body));
      return {};
    });

  beforeAll(() => {
    initSentry({ dsn: TEST_SENTRY_DSN, environment: "test", transport });
  });

  afterEach(async () => {
    // 앞 테스트에서 모아 두고 아직 보내지 않은 지표가 다음 테스트로 넘어가지 않게 보내고 비워요.
    // 보내기를 기다리는 데 타이머를 써서 가짜 타이머가 남아 있으면 건너뛰어요
    if (!vi.isFakeTimers()) await Sentry.flush();
    sentEvents.length = 0;
    sentMetrics.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
  });

  /** 보내는 중인 이벤트까지 기다린 뒤 모은 이벤트를 돌려줘요. 기다리는 데 타이머를 써서 가짜 타이머에서는 끝나지 않아요 */
  const flushEvents = async () => {
    await Sentry.flush();
    return sentEvents;
  };

  /** 모아 둔 지표를 보낸 뒤 모은 지표를 돌려줘요. 기다리는 데 타이머를 써서 가짜 타이머에서는 끝나지 않아요 */
  const flushMetrics = async () => {
    await Sentry.flush();
    return sentMetrics;
  };

  return { flushEvents, flushMetrics };
};
