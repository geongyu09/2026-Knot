import { GetMeResponseDto } from "@api/dto/auth";
import { getMeApi } from "@api/fetch/api/v1/auth/me";
import { meResponse } from "@api/mock/responses/auth";
import { mockServer } from "@api/mock/server";
import { authKeys } from "@api/queryKey/auth";
import { QueryClient } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import posthog from "posthog-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { syncAnalyticsUser } from ".";

vi.mock("posthog-js", () => ({
  default: {
    identify: vi.fn(),
    reset: vi.fn(),
    get_distinct_id: vi.fn(),
    get_property: vi.fn(),
  },
}));

const ME_REQUEST = "*/api/v1/auth/me";
// 식별 전 PostHog가 브라우저마다 만들어 두는 익명 id예요
const ANONYMOUS_ID = "01a14f68-29c4-7ada-a1f8-5996005a8697";
const expectedMe = new GetMeResponseDto(meResponse);

// 화면처럼 로그인 확인(me)을 불러요. 실패도 화면이 다루므로 여기서는 삼켜요
const fetchMe = (queryClient: QueryClient) =>
  queryClient
    .fetchQuery({ queryKey: authKeys.me(), queryFn: getMeApi })
    .catch(() => undefined);

describe("syncAnalyticsUser", () => {
  let queryClient: QueryClient;
  let stopSync: () => void;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(posthog.get_distinct_id).mockReturnValue(ANONYMOUS_ID);
    stopSync = syncAnalyticsUser(queryClient);
  });

  afterEach(() => {
    stopSync();
    queryClient.clear();
    vi.clearAllMocks();
  });

  it("로그인 확인이 성공하면 회원 id로 식별하고 닉네임과 프로필 사진 주소를 함께 보낸다", async () => {
    await fetchMe(queryClient);

    expect(posthog.identify).toHaveBeenCalledTimes(1);
    expect(posthog.identify).toHaveBeenCalledWith(String(expectedMe.memberId), {
      name: expectedMe.nickname,
      avatar: expectedMe.profileImageUrl,
    });
  });

  it("이미 같은 회원으로 식별돼 있으면 로그인 확인이 다시 성공해도 다시 식별하지 않는다", async () => {
    vi.mocked(posthog.get_distinct_id).mockReturnValue(
      String(expectedMe.memberId),
    );

    await fetchMe(queryClient);

    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("다른 회원으로 식별돼 있던 브라우저에서 로그인 확인이 성공하면 지금 회원으로 식별한다", async () => {
    vi.mocked(posthog.get_distinct_id).mockReturnValue(
      String(expectedMe.memberId + 1),
    );

    await fetchMe(queryClient);

    expect(posthog.identify).toHaveBeenCalledWith(
      String(expectedMe.memberId),
      expect.any(Object),
    );
  });

  it("식별된 브라우저에서 로그인 확인이 401이면 식별을 지운다", async () => {
    vi.mocked(posthog.get_property).mockImplementation((name) =>
      name === "$user_state" ? "identified" : undefined,
    );
    mockServer.use(
      http.get(ME_REQUEST, () => new HttpResponse(null, { status: 401 })),
    );

    await fetchMe(queryClient);

    expect(posthog.reset).toHaveBeenCalledTimes(1);
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("식별된 적 없는 브라우저에서 로그인 확인이 401이면 익명 id를 그대로 둔다", async () => {
    vi.mocked(posthog.get_property).mockImplementation((name) =>
      name === "$user_state" ? "anonymous" : undefined,
    );
    mockServer.use(
      http.get(ME_REQUEST, () => new HttpResponse(null, { status: 401 })),
    );

    await fetchMe(queryClient);

    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it.each([
    {
      reason: "서버 오류(500)",
      response: () => new HttpResponse(null, { status: 500 }),
    },
    { reason: "네트워크 오류", response: () => HttpResponse.error() },
  ])(
    "로그인 확인이 $reason로 실패하면 식별을 바꾸지 않는다",
    async ({ response }) => {
      mockServer.use(http.get(ME_REQUEST, response));

      await fetchMe(queryClient);

      expect(posthog.reset).not.toHaveBeenCalled();
      expect(posthog.identify).not.toHaveBeenCalled();
    },
  );

  it("로그인 확인이 아닌 조회 결과로는 식별하지 않는다", async () => {
    await queryClient.fetchQuery({
      queryKey: ["workspaces"],
      queryFn: () => Promise.resolve({ memberId: 1 }),
    });

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it("동기화를 멈춘 뒤에는 로그인 확인 결과로 식별하지 않는다", async () => {
    stopSync();

    await fetchMe(queryClient);

    expect(posthog.identify).not.toHaveBeenCalled();
  });
});
