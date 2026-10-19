import {
  PostRecordingAudioSaveRetryResponseDto,
  type PostRecordingAudioSaveRetryResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_AUDIO_SAVE_RETRY_API_PATH = (
  workspaceId: number,
  recordingId: number,
) =>
  `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/audio-save/retry`;

interface RetryRecordingAudioSaveApiParams {
  workspaceId: number;
  recordingId: number;
}

/**
 * @description 실패한 PCM 조각 녹음의 최종 WAV 저장 작업을 다시 접수합니다. 캡처를 재개하거나 새 조각을 받지 않고, 종료 때 고정한 조각으로 같은 작업을 다시 실행해요
 * @param params - 워크스페이스 ID·녹음 세션 ID
 * @returns 다시 접수한 뒤의 저장 상태
 * @example
 * const { audioSaveStatus, jobId } = await retryRecordingAudioSaveApi({ workspaceId: 1, recordingId: 10 });
 */
export const retryRecordingAudioSaveApi = async ({
  workspaceId,
  recordingId,
}: RetryRecordingAudioSaveApiParams) => {
  const response = await httpClient<PostRecordingAudioSaveRetryResponseRaw>({
    method: "post",
    url: RECORDING_AUDIO_SAVE_RETRY_API_PATH(workspaceId, recordingId),
  });

  return new PostRecordingAudioSaveRetryResponseDto(response.data);
};
