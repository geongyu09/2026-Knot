import { http } from "msw";

import { toSearchAnswerStreamResponse } from "@api/mock/handlers/api/v1/workspaces/[workspaceId]/search/conversations";
import { searchAnswerRetryStreamResponse } from "@api/mock/responses/search";

export const workspaceSearchAnswerRetryHandlers = [
  http.post(
    "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/questions/:questionId/retry",
    // 실제 서버처럼 경로의 질문과 그 바로 다음 답변 메시지로 accepted를 보내요
    ({ params }) =>
      toSearchAnswerStreamResponse({
        ...searchAnswerRetryStreamResponse,
        conversationId: Number(params.conversationId),
        questionMessageId: Number(params.questionId),
        answerMessageId: Number(params.questionId) + 1,
      }),
  ),
];
