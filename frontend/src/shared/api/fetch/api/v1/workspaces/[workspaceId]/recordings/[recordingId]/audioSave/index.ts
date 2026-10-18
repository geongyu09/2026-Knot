import {
  GetRecordingAudioSaveResponseDto,
  type GetRecordingAudioSaveResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_AUDIO_SAVE_API_PATH = (
  workspaceId: number,
  recordingId: number,
) => `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/audio-save`;

interface GetRecordingAudioSaveApiParams {
  workspaceId: number;
  recordingId: number;
}

/**
 * @description PCM 조각 녹음의 저장 상태를 조회합니다. 탭 증명 없이 본인 녹음이면 볼 수 있어요
 * @param params - 워크스페이스 ID·녹음 세션 ID
 * @returns 저장 상태·실패 이유 코드·남은 조각을 받아 주는 시한
 * @example
 * const { audioSaveStatus } = await getRecordingAudioSaveApi({ workspaceId: 1, recordingId: 10 });
 */
export const getRecordingAudioSaveApi = async ({
  workspaceId,
  recordingId,
}: GetRecordingAudioSaveApiParams) => {
  const response = await httpClient<GetRecordingAudioSaveResponseRaw>({
    method: "get",
    url: RECORDING_AUDIO_SAVE_API_PATH(workspaceId, recordingId),
  });

  return new GetRecordingAudioSaveResponseDto(response.data);
};
