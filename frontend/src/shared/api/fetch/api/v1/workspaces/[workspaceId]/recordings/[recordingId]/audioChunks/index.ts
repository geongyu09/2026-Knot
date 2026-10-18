import {
  PostRecordingAudioChunkResponseDto,
  type PostRecordingAudioChunkRequestDto,
  type PostRecordingAudioChunkResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";
import axios from "axios";

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

interface UploadRecordingAudioChunkApiParams {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  pcm: ArrayBuffer;
}

/**
 * @description 예약 응답의 서명 URL로 PCM 조각을 객체 저장소에 직접 올립니다. 성공해도 저장 완료가 아니라 이어서 저장 확인을 보내야 해요
 * @param params - 예약 응답의 URL과 헤더·올릴 PCM 바이트
 * @returns 없음
 * @example
 * await uploadRecordingAudioChunkApi({ uploadUrl, requiredHeaders, pcm });
 */
export const uploadRecordingAudioChunkApi = async ({
  uploadUrl,
  requiredHeaders,
  pcm,
}: UploadRecordingAudioChunkApiParams) => {
  // 저장소는 우리 API가 아니라 httpClient의 인증 쿠키·CSRF 헤더를 실으면 서명·CORS가 깨져요.
  // 헤더는 서명에 들어가 있어 예약 응답의 값을 그대로 보내고, 이미 객체가 있을 때의 412도 그대로 던져요
  await axios.put(uploadUrl, pcm, { headers: requiredHeaders });
};
