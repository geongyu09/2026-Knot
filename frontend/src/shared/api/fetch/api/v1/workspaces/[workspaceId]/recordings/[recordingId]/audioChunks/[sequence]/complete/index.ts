import {
  PostRecordingAudioChunkCompleteResponseDto,
  type PostRecordingAudioChunkCompleteRequestDto,
  type PostRecordingAudioChunkCompleteResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_AUDIO_CHUNK_COMPLETE_API_PATH = (
  workspaceId: number,
  recordingId: number,
  sequence: number,
) =>
  `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/audio-chunks/${sequence}/complete`;

interface CompleteRecordingAudioChunkApiParams {
  workspaceId: number;
  recordingId: number;
  sequence: number;
  body: PostRecordingAudioChunkCompleteRequestDto;
}

/**
 * @description PUT을 마친 PCM 조각의 저장을 서버에 확인받습니다. 서버가 저장소의 크기·checksum을 검증하고 `VERIFIED`로 기록해요
 * @param params - 워크스페이스 ID·녹음 세션 ID·조각 번호·최초 탭 증명
 * @returns 조각 상태와 첫 조각부터 빈틈없이 확인된 끝 프레임
 * @example
 * await completeRecordingAudioChunkApi({ workspaceId: 1, recordingId: 10, sequence: 1, body });
 */
export const completeRecordingAudioChunkApi = async ({
  workspaceId,
  recordingId,
  sequence,
  body,
}: CompleteRecordingAudioChunkApiParams) => {
  const response = await httpClient<PostRecordingAudioChunkCompleteResponseRaw>(
    {
      method: "post",
      url: RECORDING_AUDIO_CHUNK_COMPLETE_API_PATH(
        workspaceId,
        recordingId,
        sequence,
      ),
      data: body,
    },
  );

  return new PostRecordingAudioChunkCompleteResponseDto(response.data);
};
