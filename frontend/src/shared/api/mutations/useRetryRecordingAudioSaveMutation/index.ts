import { retryRecordingAudioSaveApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioSave/retry";
import { recordingKeys } from "@api/queryKey/recording";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface RetryRecordingAudioSaveMutationVariables {
  workspaceId: number;
  recordingId: number;
}

/**
 * 실패한 PCM 조각 녹음의 최종 WAV 저장 작업을 다시 접수하는 뮤테이션 훅.
 *
 * 저장 상태의 `canRetry`가 true일 때만 부르고, 조각을 다시 PUT하는 것과는 다른 서버 작업이에요.
 * 본문이 없어 요청 DTO가 없어요. 오류는 `HttpError`의 `code`로 넘겨요(다시 시도할 수 없으면 `AUDIO_SAVE_RETRY_NOT_ALLOWED`).
 * 접수되면 그 녹음의 저장 상태 쿼리를 무효화해 바뀐 상태를 다시 받아요.
 */
const useRetryRecordingAudioSaveMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RetryRecordingAudioSaveMutationVariables) =>
      retryRecordingAudioSaveApi(variables),
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: recordingKeys.audioSave(variables),
      }),
  });
};

export default useRetryRecordingAudioSaveMutation;
