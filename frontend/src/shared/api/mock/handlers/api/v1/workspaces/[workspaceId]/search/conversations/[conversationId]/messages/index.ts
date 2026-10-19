import { http, HttpResponse } from "msw";

import { searchMessagesResponse } from "@api/mock/responses/search";

// 경로 파라미터가 있어 fetch 상수 대신 패턴을 직접 적어요
export const workspaceSearchConversationMessagesHandlers = [
  http.get(
    "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/messages",
    // 실제 서버처럼 조회한 대화의 ID로 답해요
    ({ params }) =>
      HttpResponse.json({
        ...searchMessagesResponse,
        conversationId: Number(params.conversationId),
      }),
  ),
];
