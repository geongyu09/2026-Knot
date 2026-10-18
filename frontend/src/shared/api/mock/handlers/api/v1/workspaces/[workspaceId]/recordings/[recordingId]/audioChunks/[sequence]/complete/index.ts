import { http, HttpResponse } from "msw";

import { recordingAudioChunkCompleteResponse } from "@api/mock/responses/recording";

export const recordingAudioChunkCompleteHandlers = [
  // 이미 확인된 조각을 다시 보내도 실제 서버는 200으로 같은 결과를 줘요
  http.post(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-chunks/:sequence/complete",
    ({ params }) =>
      HttpResponse.json({
        ...recordingAudioChunkCompleteResponse,
        sequence: Number(params.sequence),
      }),
  ),
];
