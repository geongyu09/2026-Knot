import { http, HttpResponse } from "msw";

import { retryRecordingTranscription } from "@api/mock/state/recording";

// 경로 파라미터가 있어 fetch 상수 대신 패턴을 직접 적어요
export const recordingTranscriptionRetryHandlers = [
  http.post(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/transcription/retry",
    ({ params }) => {
      // 다시 접수를 기록해, 이 뒤의 녹음 상세 응답이 전사 중으로 바뀌게 해요
      const retry = retryRecordingTranscription(Number(params.recordingId));

      if (retry.result === "notFound") {
        return HttpResponse.json(
          {
            code: "RECORDING_NOT_FOUND",
            message: "녹음 세션을 찾을 수 없습니다.",
          },
          { status: 404 },
        );
      }

      if (retry.result === "notAllowed") {
        return HttpResponse.json(
          {
            code: "TRANSCRIPTION_RETRY_NOT_ALLOWED",
            message: "전사를 재시도할 수 없습니다",
          },
          { status: 409 },
        );
      }

      return HttpResponse.json(retry.response, { status: 202 });
    },
  ),
];
