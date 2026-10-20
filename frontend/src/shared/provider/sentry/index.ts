import * as Sentry from "@sentry/react";
import type { BrowserOptions, ErrorEvent, EventHint } from "@sentry/react";
import {
  reactRouterBrowserTracingIntegration,
  wrapUseRoutes,
} from "@sentry/react/react-router";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { getRequestErrorContext } from "@utils/getRequestErrorContext";
import { getRequestErrorFingerprint } from "@utils/getRequestErrorFingerprint";
import {
  scrubSentryBreadcrumb,
  scrubSentryEvent,
  scrubSentrySpan,
} from "@utils/scrubSentryEvent";
import {
  getErrorReportLevel,
  shouldReportError,
} from "@utils/shouldReportError";
import type { RootOptions } from "react-dom/client";
import { useLayoutEffect } from "react";
import { matchPath, useLocation, useRoutes } from "react-router";

import type { createReplayIntegration } from "./replay";

type ReplayIntegration = ReturnType<typeof createReplayIntegration>;

/**
 * Sentry로 보낼 우리 주소의 중계 경로. 프론트 Worker(`src/worker/relay`)가 Sentry로 넘겨요(ADR 838).
 * Worker의 `SENTRY_RELAY_PATH`와 같아야 하고, wrangler.jsonc의 `run_worker_first`(`/relay/*`) 안에 있어야 해요
 */
const SENTRY_RELAY_PATH = "/relay/s";

/** production에서 성능을 측정할 페이지 로딩 · 화면 이동의 비율. 그 밖의 환경은 모두 측정해요 */
const PRODUCTION_TRACES_SAMPLE_RATE = 0.2;

/** environment를 비우면 SDK가 `production`으로 보내므로 production과 같게 다뤄요 */
const getTracesSampleRate = (environment?: string) =>
  !environment || environment === "production"
    ? PRODUCTION_TRACES_SAMPLE_RATE
    : 1;

/**
 * 초대 화면(`/invite/:token` 아래 전부)인지 봐요. 주소에 워크스페이스에 들어올 수 있는 토큰이 있어 리플레이에 남기지 않아요.
 *
 * 리플레이는 `beforeSend`를 거치지 않고 주소를 그대로 기록해요(첫 화면 기록의 href, 화면 이동 기록, 리플레이의 urls).
 */
const isInvitePath = (pathname: string) =>
  matchPath({ path: PATH_ROUTE.INVITE, end: false }, pathname) !== null;

/**
 * 세션 리플레이 통합을 첫 화면 번들과 따로 받아 붙여요. 같은 오리진의 파일이라 외부 CDN을 부르지 않아요.
 *
 * 파일을 받지 못하면(오프라인, 배포 중 파일 교체) 리플레이 없이 오류 보고만 해요. 받기 전에 난 오류에는 리플레이가 없어요.
 * 받은 때 초대 화면이면(초대 화면으로 들어왔거나 받는 동안 옮김) 붙이지 않고, 새로고침 전까지 다시 시도하지 않아요.
 * 나중에 붙이면 SDK가 페이지 로딩 기록(주소가 초대 화면)을 모으기 때문이에요.
 */
const addReplayIntegration = async () => {
  try {
    const { createReplayIntegration } = await import("./replay");
    if (isInvitePath(window.location.pathname)) return;
    Sentry.addIntegration(createReplayIntegration());
  } catch {
    // 리플레이는 부가 기능이라 실패해도 화면과 오류 보고를 막지 않아요
  }
};

/**
 * 페이지를 떠나는 중인지. 떠날 때 브라우저가 끊는 요청의 실패를 보고에서 빼려고 써요.
 * 뒤로 가기 캐시(bfcache)로 페이지에 돌아오면 다시 `false`가 돼요.
 */
let isPageHiding = false;

const markPageHiding = () => {
  isPageHiding = true;
};

const markPageShowing = () => {
  isPageHiding = false;
};

/** 같은 함수를 다시 등록해도 한 번만 불려, `initSentry`를 여러 번 불러도 괜찮아요 */
const watchPageHiding = () => {
  window.addEventListener("pagehide", markPageHiding);
  window.addEventListener("pageshow", markPageShowing);
};

/**
 * 오류의 심각도(level)를 정하고, httpClient 요청 실패에는 묶음 기준(fingerprint), 요청 정보 태그, 요청 ID context를 붙여요.
 *
 * 수집 경로마다 붙이지 않고 `beforeSend` 한 곳에서 붙여, 처리하지 않은 `mutateAsync` 실패(`unhandledrejection`)도 같은 모양으로 남겨요.
 */
const describeError = (event: ErrorEvent, error: unknown) => {
  const fingerprint = getRequestErrorFingerprint(error);
  const context = getRequestErrorContext(error);

  return {
    ...event,
    level: getErrorReportLevel(error),
    ...(fingerprint && { fingerprint }),
    ...(context && { tags: { ...event.tags, ...context.tags } }),
    ...(context?.requestId && {
      contexts: {
        ...event.contexts,
        apiRequest: { requestId: context.requestId },
      },
    }),
  };
};

/**
 * 보고 기준에 맞는 오류만 요청 정보를 붙이고 민감한 값을 지운 뒤 보내요. 모든 수집 경로가 이 함수를 지나요.
 *
 * 같은 오류는 여러 경로로 들어와요. `throwOnError`로 넘어간 Query 오류는 QueryCache와 Boundary(`onCaughtError`)로,
 * `mutateAsync`의 처리되지 않은 실패는 MutationCache와 전역 `unhandledrejection`으로 들어와요.
 * Sentry SDK가 한 번 보낸 오류 객체에 표시(`__sentry_captured__`)를 남겨 다음 capture를 건너뛰므로 따로 거르지 않아요.
 * 코드가 잡고 넘어간 실패(`captureCaughtError`)는 잡은 기능 이름(`feature` 태그)도 보고 기준에 넘겨요.
 */
const beforeSend = (event: ErrorEvent, hint: EventHint) => {
  const feature = event.tags?.feature;

  if (
    !shouldReportError({
      error: hint.originalException,
      isOnline: navigator.onLine,
      isPageHiding,
      isHidden: document.visibilityState === "hidden",
      feature: typeof feature === "string" ? feature : undefined,
    })
  ) {
    return null;
  }

  return scrubSentryEvent(describeError(event, hint.originalException));
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
 * 광고 차단에 막히지 않게 Sentry 주소가 아니라 우리 주소의 중계 경로(`/relay/s`)로 보내요(`tunnel`).
 * 개발 서버(webpack serve)에는 이 중계가 없어서, 로컬에 DSN을 넣어도 보고가 Sentry로 가지 않아요.
 * 사용자 정보, 쿠키, 요청 헤더와 본문, 쿼리는 모으지 않아요(`dataCollection`). 세션 리플레이에는 화면에 보이는 글자가 그대로 남아요.
 * SDK v11에서 `sendDefaultPii`가 없어지고 `dataCollection`으로 바뀌었는데, 기본값이 모두 모으기라 끄는 값을 직접 넣어요.
 * 보낼 오류는 `shouldReportError`로 고르고, 보내기 전에 `scrubSentryEvent`로 민감한 값을 지워요.
 *
 * - 성능 측정: 페이지 로딩, 화면 이동(라우트 경로 패턴 이름), API 응답 시간, Web Vitals. span은 `scrubSentrySpan`으로 주소를 정리해 보내요
 * - 세션 리플레이: 오류가 난 세션만 남겨요. 통합은 `addReplayIntegration`이 따로 받아 붙여요. 초대 화면에서는 기록하지 않아요
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
    // 이 경로로 보내면 SDK가 봉투 머리에 DSN을 넣고, Worker는 그 DSN이 우리 프로젝트일 때만 넘겨요
    tunnel: SENTRY_RELAY_PATH,
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
    integrations: [reactRouterBrowserTracingIntegration()],
    tracesSampleRate: getTracesSampleRate(environment),
    // 백엔드 CORS가 `sentry-trace` · `baggage` 헤더를 허용하지 않아, 붙이면 API 요청이 모두 막혀요. 어느 요청에도 붙이지 않아요
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1,
    beforeSend,
    beforeSendSpan: scrubSentrySpan,
    beforeBreadcrumb: scrubSentryBreadcrumb,
    ...(transport && { transport }),
  });

  watchPageHiding();
  void addReplayIntegration();

  return true;
};

/**
 * 초대 화면으로 옮기면 리플레이를 멈춰요. 아직 보내지 않은 기록(초대 화면으로 옮긴 기록 포함)은 보내지 않고 버려요.
 *
 * 초대 화면을 벗어나도 새로고침 전까지 다시 켜지 않아요. 오류 보고와 성능 측정은 그대로예요.
 */
const useStopReplayOnInvitePath = () => {
  const { pathname } = useLocation();

  // 초대 화면이 그려진 직후, 화면의 요청보다 먼저 멈추도록 layout effect에서 불러요
  useLayoutEffect(() => {
    if (!isInvitePath(pathname)) return;

    // `Sentry.getReplay`는 리플레이 코드와 한 파일이라, 가져오면 리플레이가 첫 화면 번들에 들어가요
    void Sentry.getClient()
      ?.getIntegrationByName<ReplayIntegration>("Replay")
      ?.stop({ flush: false });
  }, [pathname]);
};

const useTracedRoutes = wrapUseRoutes(useRoutes);

/**
 * react-router의 `useRoutes`에 Sentry 성능 측정을 붙인 훅. 페이지 로딩 · 화면 이동 이름을 주소 대신 경로 패턴(`/workspace/:workspaceId`)으로 남겨요.
 * 초대 화면에서는 세션 리플레이를 멈춰요.
 *
 * Sentry가 꺼져 있으면 `useRoutes`와 같아요.
 */
export const useSentryRoutes: typeof useRoutes = (routes, locationArg) => {
  useStopReplayOnInvitePath();

  return useTracedRoutes(routes, locationArg);
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
 * 보낼지와 묶음 기준, 요청 정보 태그는 `beforeSend`가 정하므로 여기서는 들어온 곳만 붙여요.
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

/** 실패를 잡고 넘어간 기능. Sentry에서 기능별로 모아 볼 때 써요 */
export type CaughtErrorFeature = "auth" | "recording" | "document" | "search";

interface CaptureCaughtErrorParams {
  error: unknown;
  feature: CaughtErrorFeature;
  /** 오류만으로는 알 수 없는 상황. 예: 버린 조각 수 */
  extra?: Record<string, unknown>;
}

/**
 * 코드가 잡고 넘어간 실패를 Sentry로 보내요. catch에서 실패를 안내, 상태, 결과값으로 바꿀 때 불러요.
 *
 * react-query가 이미 보낸 같은 오류 객체는 SDK가 건너뛰어 한 번만 남아요.
 * 보낼지와 묶음 기준, 요청 정보 태그는 `beforeSend`가 정하므로 여기서는 거르지 않아요. Sentry가 꺼져 있으면 아무것도 하지 않아요.
 */
export const captureCaughtError = ({
  error,
  feature,
  extra,
}: CaptureCaughtErrorParams) => {
  Sentry.captureException(error, {
    captureContext: {
      tags: { source: "caught", feature },
      ...(extra && { extra }),
    },
    mechanism: { handled: true, type: "manual.caught" },
  });
};
