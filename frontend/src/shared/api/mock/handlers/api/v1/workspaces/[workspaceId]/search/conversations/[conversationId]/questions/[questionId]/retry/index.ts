import { http } from "msw";

import { toSearchAnswerRetryStreamResponse } from "@api/mock/handlers/api/v1/workspaces/[workspaceId]/search/conversations";
import { searchAnswerRetryStreamResponse } from "@api/mock/responses/search";

export const workspaceSearchAnswerRetryHandlers = [
  http.post(
    "*/api/v1/workspaces/:workspaceId/search/conversations/:conversationId/questions/:questionId/retry",
    // 실제 서버처럼 accepted에 경로의 질문과 그 바로 다음 답변 메시지 ID만 담아요. 대화 ID는 보내지 않아요
    ({ params }) =>
      toSearchAnswerRetryStreamResponse({
        stream: searchAnswerRetryStreamResponse,
        accepted: {
          questionId: Number(params.questionId),
          answerMessageId: Number(params.questionId) + 1,
          status: "STREAMING",
        },
      }),
  ),
];
