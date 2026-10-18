import {
  PostRecordingTranscriptionRetryResponseDto,
  type PostRecordingTranscriptionRetryResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_TRANSCRIPTION_RETRY_API_PATH = (
  workspaceId: number,
  recordingId: number,
) =>
  `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/transcription/retry`;

interface RetryRecordingTranscriptionApiParams {
  workspaceId: number;
  recordingId: number;
}

/**
 * @description 실패한 녹음의 전사를 새 시도 ID로 다시 접수합니다. 끝낸 녹음의 저장된 오디오로 전사부터 다시 하고, 접수(202)는 전사 성공이 아니라 결과는 녹음 상세 조회로 확인해요
 * @param params - 워크스페이스 ID·녹음 세션 ID
 * @returns 접수한 전사 시도 ID와 전사 상태
 * @example
 * const { attemptId } = await retryRecordingTranscriptionApi({ workspaceId: 1, recordingId: 13 });
 */
export const retryRecordingTranscriptionApi = async ({
  workspaceId,
  recordingId,
}: RetryRecordingTranscriptionApiParams) => {
  const response = await httpClient<PostRecordingTranscriptionRetryResponseRaw>(
    {
      method: "post",
      url: RECORDING_TRANSCRIPTION_RETRY_API_PATH(workspaceId, recordingId),
    },
  );

  return new PostRecordingTranscriptionRetryResponseDto(response.data);
};
