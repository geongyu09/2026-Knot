import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { searchMessagesResponse } from "@api/mock/responses/search";
import { mockServer } from "@api/mock/server";

import { getSearchMessagesApi } from ".";

const MESSAGES_PATH =
  "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/messages";

/** 이번 테스트에서 보낸 요청의 쿼리를 모아요 */
const captureSearchParams = () => {
  const captured: URLSearchParams[] = [];
  mockServer.use(
    http.get(MESSAGES_PATH, ({ request }) => {
      captured.push(new URL(request.url).searchParams);

      return HttpResponse.json(searchMessagesResponse);
    }),
  );

  return captured;
};

describe("getSearchMessagesApi", () => {
  it("size를 주지 않으면 최근 30개를 요청한다 (근거 없음)", async () => {
    const captured = captureSearchParams();

    await getSearchMessagesApi({ workspaceId: 1, conversationId: 100 });

    expect(captured[0].get("size")).toBe("30");
  });

  it("size를 주면 그 수만큼 요청한다 (근거 없음)", async () => {
    const captured = captureSearchParams();

    await getSearchMessagesApi({ workspaceId: 1, conversationId: 100, size: 5 });

    expect(captured[0].get("size")).toBe("5");
  });
});
