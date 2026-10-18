import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent, EventHint } from "@sentry/react";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from "@utils/scrubSentryEvent";
import { shouldReportError } from "@utils/shouldReportError";
import type { RootOptions } from "react-dom/client";

/**
 * 보고 기준에 맞는 오류만 민감한 값을 지운 뒤 보내요. 모든 수집 경로가 이 함수를 지나요.
 *
 * 같은 오류는 여러 경로로 들어와요. `throwOnError`로 넘어간 Query 오류는 QueryCache와 Boundary(`onCaughtError`)로,
 * `mutateAsync`의 처리되지 않은 실패는 MutationCache와 전역 `unhandledrejection`으로 들어와요.
 * Sentry SDK가 한 번 보낸 오류 객체에 표시(`__sentry_captured__`)를 남겨 다음 capture를 건너뛰므로 따로 거르지 않아요.
 */
const beforeSend = (event: ErrorEvent, hint: EventHint) => {
  if (
    !shouldReportError({
      error: hint.originalException,
      isOnline: navigator.onLine,
    })
  ) {
    return null;
  }

  return scrubSentryEvent(event);
};

interface InitSentryParams {
  /** 비어 있으면 Sentry를 켜지 않아요(로컬, 테스트) */
  dsn: string;
  /** 배포 환경 이름. 예: `production`, `development` */
  environment?: string;
  /** 소스맵을 올린 릴리스 이름. 비어 있으면 webpack 플러그인이 번들에 넣은 값을 써요 */
  release?: string;
  /** 이벤트를 보내는 방법. 테스트에서 전송을 가로챌 때만 넘겨요 */
  transport?: BrowserOptions["transport"];
}

/**
 * Sentry를 켜요. DSN이 없으면 `Sentry.init`을 부르지 않고 `false`를 돌려줘요.
 *
 * 개인 정보는 모으지 않고(`dataCollection`), 성능 추적과 세션 리플레이는 켜지 않아요.
 * SDK v11에서 `sendDefaultPii`가 없어지고 `dataCollection`으로 바뀌었는데, 기본값이 모두 모으기라 끄는 값을 직접 넣어요.
 * 보낼 오류는 `shouldReportError`로 고르고, 보내기 전에 `scrubSentryEvent`로 민감한 값을 지워요.
 */
export const initSentry = ({
  dsn,
  environment,
  release,
  transport,
}: InitSentryParams) => {
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: environment || undefined,
    release: release || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      // 브라우저 · OS 구분에 쓰는 User-Agent만 남겨요. Referer에는 쿼리가 든 주소가 와요
      httpHeaders: { request: { allow: ["User-Agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    ...(transport && { transport }),
  });

  return true;
};

/**
 * React 루트(`createRoot`)에 넘길 오류 처리. React 19가 알려 주는 오류를 Sentry로 보내요.
 *
 * Boundary가 잡은 렌더링 오류는 `onCaughtError` 한 곳에서만 보내요. 앱 루트 Boundary는 화면만 바꾸고 보내지 않아요.
 * Sentry가 꺼져 있으면 빈 객체를 돌려줘, React의 기본 동작(콘솔 출력)을 그대로 둬요.
 */
export const getRootErrorHandlers = (): Pick<
  RootOptions,
  "onUncaughtError" | "onCaughtError" | "onRecoverableError"
> => {
  if (!Sentry.isInitialized()) return {};

  return {
    onUncaughtError: Sentry.reactErrorHandler(),
    // 콜백을 넘겨야 Boundary가 처리한 오류(handled)로 기록돼요. React 기본 동작처럼 콘솔에도 남겨요
    onCaughtError: Sentry.reactErrorHandler((error, errorInfo) => {
      console.error(error, errorInfo.componentStack);
    }),
    onRecoverableError: Sentry.reactErrorHandler(),
  };
};

interface CaptureRequestErrorParams {
  error: unknown;
  /** 오류가 들어온 곳 */
  source: "query" | "mutation";
}

/**
 * react-query의 Query · Mutation 실패를 Sentry로 보내요. `QueryCache` · `MutationCache`의 `onError`에서 불러요.
 *
 * 보낼지는 `beforeSend`가 정하므로 여기서는 거르지 않아요.
 */
export const captureRequestError = ({
  error,
  source,
}: CaptureRequestErrorParams) => {
  Sentry.captureException(error, {
    captureContext: { tags: { source } },
    mechanism: { handled: true, type: `auto.tanstack.${source}_cache` },
  });
};
