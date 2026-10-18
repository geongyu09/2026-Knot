import {
  PostRecordingAudioChunkResponseDto,
  type PostRecordingAudioChunkRequestDto,
  type PostRecordingAudioChunkResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_AUDIO_CHUNKS_API_PATH = (
  workspaceId: number,
  recordingId: number,
) => `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/audio-chunks`;

interface ReserveRecordingAudioChunkApiParams {
  workspaceId: number;
  recordingId: number;
  body: PostRecordingAudioChunkRequestDto;
}

/**
 * @description 녹음 중 PCM 조각 하나를 예약하고 올릴 서명 URL을 받습니다. 예약은 조각 번호 순서대로 보내요
 * @param params - 워크스페이스 ID·녹음 세션 ID·최초 탭 증명과 조각 descriptor
 * @returns 조각 상태·PUT할 URL과 헤더·만료 시각. 이미 저장이 확인된 조각이면 URL 없이 `VERIFIED`
 * @example
 * const { uploadUrl, requiredHeaders } = await reserveRecordingAudioChunkApi({ workspaceId: 1, recordingId: 10, body });
 */
export const reserveRecordingAudioChunkApi = async ({
  workspaceId,
  recordingId,
  body,
}: ReserveRecordingAudioChunkApiParams) => {
  const response = await httpClient<PostRecordingAudioChunkResponseRaw>({
    method: "post",
    url: RECORDING_AUDIO_CHUNKS_API_PATH(workspaceId, recordingId),
    data: body,
  });

  return new PostRecordingAudioChunkResponseDto(response.data);
};
