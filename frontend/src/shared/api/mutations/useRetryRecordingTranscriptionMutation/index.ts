import { retryRecordingTranscriptionApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/recordings/[recordingId]/transcription/retry";
import { recordingKeys } from "@api/queryKey/recording";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface RetryRecordingTranscriptionMutationVariables {
  workspaceId: number;
  recordingId: number;
}

/**
 * 실패한 녹음의 전사를 새 시도로 다시 접수하는 뮤테이션 훅.
 *
 * 녹음 상세의 `transcriptionStatus`가 `FAILED`일 때 불러요. 문서 생성 작업의 다시 시도와 달리 저장된 오디오로 전사부터 다시 해요.
 * 본문이 없어 요청 DTO가 없어요. 오류는 `HttpError`의 `code`로 넘겨요
 * (409 `TRANSCRIPTION_BUSY` · `TRANSCRIPTION_RETRY_NOT_ALLOWED` · `TRANSCRIPTION_DISABLED` · `AUDIO_UPLOAD_NOT_COMPLETED`).
 * 접수되면 녹음 쿼리를 무효화해요. 다시 받은 녹음 상태가 전사 중으로 바뀌어야 화면이 정리 중으로 돌아가고 조회가 다시 시작돼요.
 * 무효화가 끝날 때까지 `isPending`이 유지되므로, 그동안 버튼을 다시 누를 수 없게 할 수 있어요.
 */
const useRetryRecordingTranscriptionMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables: RetryRecordingTranscriptionMutationVariables) =>
      retryRecordingTranscriptionApi(variables),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: recordingKeys.all }),
  });
};

export default useRetryRecordingTranscriptionMutation;
