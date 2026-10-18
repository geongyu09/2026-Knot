import { http, HttpResponse, type PathParams } from "msw";

import { recordingAudioChunkReserveResponse } from "@api/mock/responses/recording";
import type { RecordingAudioChunkReserveRequest } from "@api/mock/types/recording";

export const recordingAudioChunksHandlers = [
  // 새 예약은 201이에요. 같은 descriptor 재요청은 실제 서버가 200으로 같은 모양을 줘요.
  // 발급한 URL로 오는 조각 PUT은 최종 오디오와 같은 가짜 저장소 핸들러(audioUploadUrl)가 받아요
  http.post<PathParams, RecordingAudioChunkReserveRequest>(
    "*/api/v1/workspaces/:workspaceId/recordings/:recordingId/audio-chunks",
    async ({ request }) => {
      // 요청한 조각 번호를 그대로 돌려줘, 조각을 차례로 예약해도 번호가 어긋나지 않아요
      const { sequence } = await request.json();

      return HttpResponse.json(
        { ...recordingAudioChunkReserveResponse, sequence },
        { status: 201 },
      );
    },
  ),
];
