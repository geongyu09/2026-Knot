import {
  PostRecordingAudioChunkRequestDto,
  type PostRecordingAudioChunkRequestInput,
} from "@api/dto/recording";
import { reserveRecordingAudioChunkApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioChunks";
import { useMutation } from "@tanstack/react-query";

interface ReserveRecordingAudioChunkMutationVariables extends PostRecordingAudioChunkRequestInput {
  workspaceId: number;
  recordingId: number;
}

/**
 * 녹음 중 PCM 조각 하나를 예약하고 올릴 서명 URL을 받는 뮤테이션 훅.
 *
 * 같은 descriptor로 다시 보내면 서버가 같은 조각의 URL을 다시 발급하고, 이미 저장이 확인된 조각이면
 * URL 없이 `VERIFIED`를 돌려줘요. 오류는 `HttpError`의 `code`로 넘겨요. 무효화할 쿼리는 없어요.
 */
const useReserveRecordingAudioChunkMutation = () => {
  return useMutation({
    mutationFn: ({
      workspaceId,
      recordingId,
      ...input
    }: ReserveRecordingAudioChunkMutationVariables) =>
      reserveRecordingAudioChunkApi({
        workspaceId,
        recordingId,
        body: new PostRecordingAudioChunkRequestDto(input),
      }),
  });
};

export default useReserveRecordingAudioChunkMutation;
