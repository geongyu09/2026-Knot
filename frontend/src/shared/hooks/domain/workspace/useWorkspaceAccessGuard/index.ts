import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";
import useWorkspacesQuery from "@api/queries/useWorkspacesQuery";
import { TOAST_MESSAGES } from "@constants/toastMessages";
import useNavigateToLogin from "@hooks/domain/auth/useNavigateToLogin";
import { useToast } from "@provider/context/toastContext";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { getAccessDeniedFallbackWorkspaceId } from "@utils/getAccessDeniedFallbackWorkspaceId";
import { isUnauthorizedError } from "@utils/isUnauthorizedError";
import { useEffect } from "react";
import { useParams } from "react-router";

interface UseWorkspaceAccessGuardParams {
  /** 워크스페이스 관련 쿼리의 에러. 없으면 아무것도 하지 않아요. */
  error: unknown;
}

/** 멤버가 아니거나(403) 없는 워크스페이스(404)라 들어갈 수 없는 실패 */
const isAccessDeniedError = (error: unknown) =>
  isHttpError(error, HTTP_ERROR_TYPE.forbidden) ||
  isHttpError(error, HTTP_ERROR_TYPE.notFound);

/**
 * 워크스페이스 조회 실패를 한 곳에서 판정해 이동시키는 도메인 훅.
 *
 * - 401: 인증이 풀린 상태라 로그인 화면으로 `replace` 이동해요.
 * - 403·404: 내보내졌거나 없어진 워크스페이스라 다른 곳으로 `replace` 이동하고 오류 토스트를 띄워요(ERR-11, D7).
 *   내 워크스페이스 목록을 새로 받아, 마지막으로 본 다른 워크스페이스가 남아 있으면 그 홈으로,
 *   없거나 목록을 받지 못하면 선택 화면(`/workspace`)으로 보내요(`getAccessDeniedFallbackWorkspaceId`).
 *
 * 그 외(네트워크·5xx·timeout)는 다루지 않아요. 진입을 막을 근거가 아니라서요.
 * 쓰는 쪽은 에러를 넘기기만 하고, 어디로 보낼지는 여기서 정합니다.
 * 이동하는 동안(목록을 받는 동안 포함) 오류 안내를 그리지 않도록 `isRedirecting`을 돌려줘요.
 *
 * 들어갈 수 없는 워크스페이스는 주소의 `:workspaceId`로 알아요.
 * 같은 실패를 여러 구획이 함께 넘겨도 목록 요청은 하나이고, 같은 곳으로 같은 토스트를 보내 토스트는 하나만 떠요.
 * effect deps의 이동 함수는 모두 참조가 고정돼 있어, 판정 결과가 바뀔 때만 한 번 이동해요.
 * 이동 뒤에도 살아 있는 컴포넌트(레이아웃 가드)에 붙여도 반복되지 않아요.
 */
const useWorkspaceAccessGuard = ({ error }: UseWorkspaceAccessGuardParams) => {
  const { navigateToLogin } = useNavigateToLogin();
  const { navigateWithToast } = useToast();
  const params = useParams();

  const isUnauthorized = isUnauthorizedError(error);
  const isAccessDenied = isAccessDeniedError(error);

  // 남은 워크스페이스는 막 바뀌었을 수 있어서, 캐시가 아니라 이 판정 뒤에 새로 받은 목록으로 정해요
  const {
    data: workspaceList,
    isError: isWorkspaceListError,
    isFetchedAfterMount: isWorkspaceListFetched,
  } = useWorkspacesQuery({ isEnabled: isAccessDenied });
  const isDestinationReady = isWorkspaceListFetched || isWorkspaceListError;

  const fallbackWorkspaceId =
    workspaceList &&
    getAccessDeniedFallbackWorkspaceId({
      deniedWorkspaceId:
        params.workspaceId === undefined
          ? undefined
          : Number(params.workspaceId),
      lastViewedWorkspaceId: workspaceList.lastViewedWorkspaceId,
      workspaces: workspaceList.workspaces,
    });
  const destination =
    fallbackWorkspaceId === undefined
      ? PATH_ROUTE.WORKSPACE
      : getRouterPath({
          routeKey: "WORKSPACE_HOME",
          params: { workspaceId: String(fallbackWorkspaceId) },
        });

  useEffect(() => {
    if (isUnauthorized) {
      navigateToLogin({ replace: true });
      return;
    }

    if (!isAccessDenied || !isDestinationReady) return;

    navigateWithToast({
      to: destination,
      toast: TOAST_MESSAGES.WORKSPACE_ACCESS_DENIED,
      replace: true,
    });
  }, [
    isUnauthorized,
    isAccessDenied,
    isDestinationReady,
    destination,
    navigateToLogin,
    navigateWithToast,
  ]);

  return { isRedirecting: isUnauthorized || isAccessDenied };
};

export default useWorkspaceAccessGuard;
