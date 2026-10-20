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
 *
 * 10초마다 보내 실패도 거듭되므로, 실패는 부르는 쪽이 연속 실패의 첫 번째만 골라 보고해요(`meta.errorReport`).
 */
const useSendRecordingHeartbeatMutation = () => {
  return useMutation({
    meta: { errorReport: "caller" },
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
