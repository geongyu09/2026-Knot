import {
  PostRecordingHeartbeatRequestDto,
  type PostRecordingHeartbeatRequestInput,
} from "@api/dto/recording";
import { sendRecordingHeartbeatApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/heartbeat";
import { useMutation } from "@tanstack/react-query";

interface SendRecordingHeartbeatMutationVariables extends PostRecordingHeartbeatRequestInput {
  workspaceId: number;
  recordingId: number;
}

/**
 * 최초 녹음 탭이 살아 있음을 서버에 알리는 뮤테이션 훅.
 *
 * 서버가 이미 끝낸 녹음에 보내도 오류가 아니라 끝난 상태가 응답으로 와요. 무효화할 쿼리는 없어요.
 */
const useSendRecordingHeartbeatMutation = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      recordingId,
      ...input
    }: SendRecordingHeartbeatMutationVariables) =>
      sendRecordingHeartbeatApi({
        workspaceId,
        recordingId,
        body: new PostRecordingHeartbeatRequestDto(input),
      }),
  });
};

export default useSendRecordingHeartbeatMutation;
