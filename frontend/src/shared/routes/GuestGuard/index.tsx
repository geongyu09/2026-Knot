import useMeQuery from "@api/queries/useMeQuery";
import { Navigate, Outlet } from "react-router";

import { PATH_ROUTE } from "../PATH_ROUTE";

/**
 * 로그인하지 않은 사용자를 위한 화면을 감싸는 가드.
 *
 * 이미 로그인한 사람이 로그인 화면을 열면 홈 경로로 보냅니다. 어느 화면으로 갈지는
 * 홈 경로의 진입 분기가 정하므로 여기서는 워크스페이스를 조회하지 않아요.
 *
 * 로그인했는지는 이 화면이 뜬 뒤에 한 로그인 확인이 성공했을 때만 믿습니다. 캐시에
 * 남은 회원 정보는 로그인이 풀리기 전의 것일 수 있어요. 그것만 보고 홈 경로로 보내면
 * 홈 경로는 401을 받아 다시 이 화면으로 보내서, 두 화면을 끝없이 오가게 됩니다.
 *
 * `AuthGuard`와 달리 확인이 끝나기 전에도 화면을 그립니다. 이 화면을 여는 사람은
 * 대개 로그인하지 않은 상태라, 매번 로딩을 거치게 하면 첫 화면이 늦어져요.
 * 감추는 이득도 없습니다. 로그인 화면은 누구나 봐도 되는 내용이니까요.
 *
 * 확인에 실패하면 그대로 둡니다. 로그인 화면은 로그인하지 않은 사람에게 맞는
 * 화면이라 잘못 머물러도 안전해요.
 */
export default function GuestGuard() {
  // 이 화면이 뜰 때 로그인 확인이 다시 나가는 것은 쿼리에 staleTime이 없어서예요.
  // staleTime을 두면 캐시가 새것인 동안 다시 확인하지 않아, 로그인한 사람이 이 화면에 머물러요
  const { isSuccess, isFetchedAfterMount } = useMeQuery();

  if (isSuccess && isFetchedAfterMount) {
    return <Navigate to={PATH_ROUTE.HOME} replace />;
  }

  return <Outlet />;
}
