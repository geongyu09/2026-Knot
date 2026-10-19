import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "@emotion/react";

import App from "./App";
import { GlobalStyle, theme } from "./shared/provider/themeProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./shared/provider/queryClient";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import AppErrorBoundary from "@provider/AppErrorBoundary";
import AppProviders from "@provider/AppProviders";
import { getRootErrorHandlers, initSentry } from "@provider/sentry";
import { routes } from "@routes/routes";
import { syncAnalyticsUser } from "@utils/syncAnalyticsUser";
import posthog from "posthog-js";

// 키가 없는 환경(로컬, 테스트)에서는 사용 기록을 보내지 않아요
if (process.env.POSTHOG_KEY && process.env.POSTHOG_HOST) {
  posthog.init(process.env.POSTHOG_KEY, {
    api_host: process.env.POSTHOG_HOST,
    defaults: "2026-08-30",
  });
  syncAnalyticsUser(queryClient);
}

// DSN이 없는 환경(로컬, 테스트)에서는 오류를 보고하지 않아요
initSentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE,
});

// 정적 import하면 msw가 프로덕션 번들에 들어가므로 플래그 안에서 동적 import해요
const enableApiMocking = async () => {
  if (process.env.API_MOCKING !== "true") return;

  const { mockWorker, reactivateMockWorkerOnFocus } =
    await import("@api/mock/browser");
  await mockWorker.start();
  reactivateMockWorkerOnFocus();
};

const renderApp = () => {
  createRoot(
    document.getElementById("root") as HTMLElement,
    getRootErrorHandlers(),
  ).render(
    <React.StrictMode>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppErrorBoundary>
              <AppProviders routes={routes}>
                <App />
              </AppProviders>
            </AppErrorBoundary>
          </BrowserRouter>
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>,
  );
};

enableApiMocking()
  .then(renderApp)
  .catch((error: unknown) => {
    // 개발 전용 경로라 워커 시작 실패를 삼키지 않고 콘솔로 드러내요
    console.error(
      "[MSW] mock 워커를 시작하지 못해 앱을 렌더하지 않았어요.",
      error,
    );
  });
