import type { getMeApi } from "@api/fetch/api/v1/auth/me";
import { authKeys } from "@api/queryKey/auth";
import { hashKey, type QueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@utils/isUnauthorizedError";
import posthog from "posthog-js";

type Me = Awaited<ReturnType<typeof getMeApi>>;

const ME_QUERY_HASH = hashKey(authKeys.me());

// 개발 · 운영 서버는 회원 번호를 따로 매기는데 PostHog 프로젝트는 하나예요. 번호만 쓰면 서로 다른 회원이 한 사람으로 합쳐져요
const SERVER_NAMES: Record<string, string> = {
  "knoted.kr": "prod",
  "dev.knoted.kr": "dev",
};

const toDistinctId = (memberId: number) => {
  const { hostname } = window.location;

  return `${SERVER_NAMES[hostname] ?? hostname}-${memberId}`;
};

const identifyMember = ({ memberId, nickname, profileImageUrl }: Me) => {
  const distinctId = toDistinctId(memberId);

  if (posthog.get_distinct_id() === distinctId) return;

  posthog.identify(distinctId, { name: nickname, avatar: profileImageUrl });
};

// 로그인하지 않은 방문자는 랜딩 · 로그인 화면을 열 때마다 401을 받아요. 식별된 적 없는 브라우저까지 지우면
// 페이지마다 새 익명 id가 생겨 방문자 수가 부풀고 「랜딩 → 로그인 → 온보딩」 흐름이 끊겨요
const forgetMember = () => {
  if (posthog.get_property("$user_state") !== "identified") return;

  posthog.reset();
};

/**
 * @description 로그인 확인(me) 결과에 맞춰 PostHog 사용자 식별을 맞춰요. 성공하면 서버 이름을 붙인 회원 id(예: prod-7)로 식별하고 닉네임 · 프로필 사진 주소를 보내며, 401이면 식별을 지워요
 * @param queryClient - 앱 전체가 쓰는 QueryClient
 * @returns 동기화를 멈추는 함수
 * @example
 * if (isPostHogEnabled) syncAnalyticsUser(queryClient);
 *
 * me는 여러 화면(가드 · 프로필 · 인사말)이 각자 부르고, 워크스페이스 화면은 AuthGuard를 거치지 않아요.
 * 그래서 컴포넌트 하나가 아니라 쿼리 캐시에 들어오는 me 결과를 봐요. 어느 화면이 불렀든 같은 결과로 식별해요.
 * 이미 같은 회원으로 식별돼 있으면 다시 보내지 않아요. 네트워크 오류 · 5xx는 로그인이 풀린 게 아니라 식별을 바꾸지 않아요.
 * PostHog를 초기화한 환경에서만 불러요. 초기화 전에 부르면 PostHog가 경고만 남기고 아무것도 하지 않아요.
 */
export const syncAnalyticsUser = (queryClient: QueryClient) =>
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryHash !== ME_QUERY_HASH) {
      return;
    }

    const { action } = event;

    // 이 키에는 me 조회 결과만 담겨요
    if (action.type === "success") identifyMember(action.data as Me);
    if (action.type === "error" && isUnauthorizedError(action.error)) {
      forgetMember();
    }
  });
