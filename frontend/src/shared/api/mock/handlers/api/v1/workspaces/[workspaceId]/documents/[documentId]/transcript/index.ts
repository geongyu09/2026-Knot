import { http, HttpResponse } from "msw";

import { findDocumentTranscript } from "@api/mock/state/document";

// 경로 파라미터가 있어 fetch 상수 대신 패턴을 직접 적어요
export const documentTranscriptHandlers = [
  http.get(
    "*/api/v1/workspaces/:workspaceId/documents/:documentId/transcript",
    ({ params }) => {
      const transcript = findDocumentTranscript(Number(params.documentId));

      // 없는 문서나 원문이 없는 문서는 명세의 404로 답해요
      if (transcript === undefined) {
        return HttpResponse.json(
          { code: "TRANSCRIPT_NOT_FOUND", message: "원문을 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      return HttpResponse.json(transcript);
    },
  ),
];
