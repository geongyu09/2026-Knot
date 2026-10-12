import {
  PostRecordingEndResponseDto,
  type PostRecordingEndRequestDto,
  type PostRecordingEndResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_END_API_PATH = (
  workspaceId: number,
  recordingId: number,
) => `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/end`;

interface EndRecordingApiParams {
  workspaceId: number;
  recordingId: number;
  body: PostRecordingEndRequestDto;
}

/**
 * @description 최초 녹음 탭에서 녹음 세션을 종료합니다. 업로드 완료나 전사 접수를 뜻하지 않아요
 * @param params - 워크스페이스 ID·녹음 세션 ID·최초 탭 증명
 * @returns 서버가 확정한 종료 시각
 * @example
 * await endRecordingApi({ workspaceId: 1, recordingId: 10, body });
 */
export const endRecordingApi = async ({
  workspaceId,
  recordingId,
  body,
}: EndRecordingApiParams) => {
  const response = await httpClient<PostRecordingEndResponseRaw>({
    method: "post",
    url: RECORDING_END_API_PATH(workspaceId, recordingId),
    data: body,
  });

  return new PostRecordingEndResponseDto(response.data);
};
