import PageErrorNotice from "@primitives/ui/PageErrorNotice";
import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { isUnauthorizedError } from "@utils/isUnauthorizedError";
import type { ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Navigate, useLocation } from "react-router";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

/**
 * 앱 전체를 감싸 렌더링 오류와 Boundary로 넘어온 Query 오류를 ERR-03(서버 오류) 화면으로 대신 보여줘요.
 *
 * - `다시 시도`를 누르면 페이지를 새로고침해요(ERR-02와 같아요). 렌더링 오류는 같은 트리를 다시 그려도 대개 다시 나기 때문이에요.
 * - 주소가 바뀌면 Boundary를 풀고 `QueryErrorResetBoundary`의 Query 오류도 함께 지워요. 뒤로 가기로 다른 화면에 가면
 *   그 화면을 그리고, 실패했던 Query는 다시 요청해요.
 * - 401은 오류 안내를 그리지 않고 `AuthGuard`처럼 로그인 화면으로 보내요. `useSuspenseQuery`는 `throwOnError` 기본값을
 *   바꿀 수 없어 401도 Boundary까지 오므로, 넘겨받는 쪽인 여기서 막아요.
 *
 * Sentry 보고는 하지 않아요. Boundary가 잡은 오류는 React 루트의 `onCaughtError`(`getRootErrorHandlers`)가 한 번만 보내요.
 */
export default function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  const { pathname } = useLocation();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          resetKeys={[pathname]}
          fallbackRender={({ error }) =>
            isUnauthorizedError(error) ? (
              <Navigate to={PATH_ROUTE.LOGIN} replace />
            ) : (
              <PageErrorNotice
                variant="server"
                onAction={() => window.location.reload()}
              />
            )
          }
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
