import { http, HttpResponse } from "msw";

import { recordingAudioSaveResponse } from "@api/mock/responses/recording";

export const recordingAudioSaveRetryHandlers = [
  // 다시 접수하면 202예요. 같은 작업이 이미 대기 중이면 실제 서버는 200으로 같은 모양을 줘요
  http.post(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-save/retry",
    () => HttpResponse.json(recordingAudioSaveResponse, { status: 202 }),
  ),
];
