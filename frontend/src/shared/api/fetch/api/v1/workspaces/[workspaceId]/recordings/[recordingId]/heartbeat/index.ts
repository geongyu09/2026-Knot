import {
  PostRecordingHeartbeatResponseDto,
  type PostRecordingHeartbeatRequestDto,
  type PostRecordingHeartbeatResponseRaw,
} from "@api/dto/recording";
import { httpClient } from "@api/httpClient";

export const RECORDING_HEARTBEAT_API_PATH = (
  workspaceId: number,
  recordingId: number,
) => `/api/v1/workspaces/${workspaceId}/recordings/${recordingId}/heartbeat`;

interface SendRecordingHeartbeatApiParams {
  workspaceId: number;
  recordingId: number;
  body: PostRecordingHeartbeatRequestDto;
}

/**
 * @description 최초 녹음 탭이 살아 있음을 서버에 알리고 녹음 세션의 지금 상태를 받습니다
 * @param params - 워크스페이스 ID, 녹음 세션 ID, 최초 탭 증명
 * @returns 서버 기준 녹음 세션 상태와 누적 녹음 시간, 만료 예정 시각
 * @example
 * const { status } = await sendRecordingHeartbeatApi({ workspaceId: 1, recordingId: 10, body });
 */
export const sendRecordingHeartbeatApi = async ({
  workspaceId,
  recordingId,
  body,
}: SendRecordingHeartbeatApiParams) => {
  const response = await httpClient<PostRecordingHeartbeatResponseRaw>({
    method: "post",
    url: RECORDING_HEARTBEAT_API_PATH(workspaceId, recordingId),
    data: body,
  });

  return new PostRecordingHeartbeatResponseDto(response.data);
};
