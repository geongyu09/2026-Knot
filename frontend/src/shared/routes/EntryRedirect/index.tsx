import useMeQuery from "@api/queries/useMeQuery";
import useWorkspacesQuery from "@api/queries/useWorkspacesQuery";
import LoadingIndicator from "@primitives/ui/LoadingIndicator";
import RetryNotice from "@primitives/ui/RetryNotice";
import { clearAuthReturnPath, readAuthReturnPath } from "@utils/authReturnPath";
import { getEntryWorkspaceId } from "@utils/getEntryWorkspaceId";
import { isUnauthorizedError } from "@utils/isUnauthorizedError";
import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router";

import { getRouterPath, PATH_ROUTE } from "../PATH_ROUTE";

const ENTRY_ERROR_MESSAGE = "화면을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 홈 경로(`/`)에 도착한 사용자를 상태에 맞는 화면으로 보냅니다.
 *
 * GitHub 로그인을 마친 기존 회원이 백엔드 리다이렉트로 도착하는 자리이자,
 * 주소창에 도메인만 입력했을 때 도착하는 자리예요. 두 경우의 판단이 같아
 * 한곳에서 처리합니다.
 *
 * 닉네임을 아직 정하지 않은 사용자는 백엔드가 온보딩 화면으로 따로 보내므로
 * 여기까지 오지 않아요. 그래서 닉네임 여부는 판단하지 않습니다.
 *
 * 인증 쿠키는 `httpOnly`라 자바스크립트가 읽을 수 없어서, 로그인 여부와 목적지를
 * 모두 서버에 물어봐야 합니다. 그동안은 로딩을 보여줘요.
 *
 * 401은 다시 시도해도 결과가 같으므로 로그인 화면으로 보내고, 그 밖의 실패는
 * 잠깐의 문제일 수 있으니 화면을 옮기지 않고 다시 시도하게 둡니다.
 *
 * 로그인 전 초대 참여가 401로 끝나며 기억해 둔 복귀 주소(`/invite/<credential>`)가 있으면,
 * 로그인 확인이 성공한 뒤 워크스페이스 판정 대신 그 주소로 보내요. 백엔드가 로그인 뒤
 * 고정 주소로만 보내서 돌아올 곳은 프론트가 기억하고, 홈 경로가 분기한다는 원칙은 그대로예요.
 */
export default function EntryRedirect() {
  const navigate = useNavigate();
  const returnPath = readAuthReturnPath();

  const {
    data: me,
    error: meError,
    refetch: refetchMe,
  } = useMeQuery();

  const isLoggedIn = me !== undefined;

  const {
    data: workspaces,
    error: workspacesError,
    refetch: refetchWorkspaces,
  } = useWorkspacesQuery({
    isEnabled: isLoggedIn && returnPath === undefined,
  });

  // 저장값은 이동을 실행하는 여기서 지워요. 렌더 중에 지우면 StrictMode의 두 번째 렌더와
  // 로그인 확인이 401로 끝나 로그인으로 되돌아간 경우에 값이 사라져요
  useEffect(() => {
    if (!isLoggedIn || returnPath === undefined) return;

    clearAuthReturnPath();
    navigate(returnPath, { replace: true });
  }, [isLoggedIn, returnPath, navigate]);

  if (isUnauthorizedError(meError)) {
    return <Navigate to={PATH_ROUTE.LOGIN} replace />;
  }

  const error = meError ?? workspacesError;
  if (error) {
    const retry = meError ? refetchMe : refetchWorkspaces;

    return (
      <RetryNotice
        message={ENTRY_ERROR_MESSAGE}
        onRetry={() => {
          void retry();
        }}
      />
    );
  }

  if (workspaces === undefined) {
    return <LoadingIndicator label="화면을 준비하고 있어요" />;
  }

  const entryWorkspaceId = getEntryWorkspaceId(workspaces);
  if (entryWorkspaceId === undefined) {
    return <Navigate to={PATH_ROUTE.WORKSPACE} replace />;
  }

  return (
    <Navigate
      to={getRouterPath({
        routeKey: "WORKSPACE_HOME",
        params: { workspaceId: String(entryWorkspaceId) },
      })}
      replace
    />
  );
}
