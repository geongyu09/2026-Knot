import useMeQuery from "@api/queries/useMeQuery";
import type { ReactNode } from "react";
import { Outlet } from "react-router";

interface LandingGuardProps {
  /** 로그인하지 않은 사람에게 보여 줄 랜딩 화면 */
  landing: ReactNode;
}

/**
 * 홈 경로(`/`)에서 로그인하지 않은 사람에게 랜딩을 보여 주는 가드.
 *
 * 로그인한 사람은 랜딩을 거치지 않고 안쪽 화면(`EntryRedirect`)이 워크스페이스로 보내요.
 * GitHub 로그인을 마친 기존 회원도 백엔드가 홈 경로로 돌려보내므로, 이 분기 덕분에 로그인 직후 다시 랜딩을 보지 않아요.
 *
 * 로그인 확인이 실패하면 이유와 상관없이 랜딩을 보여 줘요. 소개와 사용법은 로그인 없이 볼 수 있어야 해서,
 * 서버가 잠깐 응답하지 않을 때도 다시 시도 안내 대신 랜딩이 먼저 보여야 합니다.
 *
 * 로그인했는지는 이 화면이 뜬 뒤에 한 로그인 확인이 성공했을 때만 믿어요(`GuestGuard`와 같은 규칙).
 * 캐시에 남은 회원 정보는 로그인이 풀리기 전의 것일 수 있어서, 그것만 보고 안쪽 화면을 그리면
 * 확인 결과가 오기 전에 워크스페이스로 보내 버려요. 확인하는 동안에는 아무것도 그리지 않습니다.
 */
export default function LandingGuard({ landing }: LandingGuardProps) {
  // 이 화면이 뜰 때 로그인 확인이 다시 나가는 것은 쿼리에 staleTime이 없어서예요
  const { isError, isSuccess, isFetchedAfterMount } = useMeQuery();

  if (isError) return landing;

  if (isSuccess && isFetchedAfterMount) return <Outlet />;

  return null;
}
