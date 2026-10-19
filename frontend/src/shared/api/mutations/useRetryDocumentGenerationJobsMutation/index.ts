import { retryDocumentGenerationJobApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/documentGenerationJobs/[jobId]/retry";
import { recordingKeys, recordingMutationKeys } from "@api/queryKey/recording";
import { captureCaughtError } from "@provider/sentry";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface RetryDocumentGenerationJobsMutationVariables {
  workspaceId: number;
  /** 다시 시도할 문서 생성 작업의 ID들. 녹음 상세의 `documentGeneration.failedJobIds`를 넘겨요 */
  jobIds: number[];
}

interface RetryDocumentGenerationJobParams {
  workspaceId: number;
  jobId: number;
}

// 한 작업의 요청이 실패해도 다른 작업의 요청을 끝까지 기다릴 수 있게, 실패를 던지지 않고 결과로 돌려줘요.
// 뮤테이션이 성공으로 끝나 react-query가 보고하지 않으므로 실패는 여기서 Sentry로 보내요. 409(횟수 소진)는 보고 기준에서 빠져요
const retryDocumentGenerationJob = async ({
  workspaceId,
  jobId,
}: RetryDocumentGenerationJobParams) => {
  try {
    await retryDocumentGenerationJobApi({ workspaceId, jobId });

    return { jobId, isAccepted: true, error: null } as const;
  } catch (error: unknown) {
    captureCaughtError({ error, feature: "document" });

    return { jobId, isAccepted: false, error } as const;
  }
};

/**
 * 한 녹음에서 실패한 문서 생성 작업들을 한 번에 다시 시도하는 뮤테이션 훅.
 *
 * 문서는 주제마다 다른 작업이 만들어서 한 녹음에서 여러 작업이 실패할 수 있고, 다시 시도 API는 작업 하나만 받아요.
 * 그래서 작업마다 요청을 따로 보내고, 모든 요청이 끝난 뒤에 작업별 결과(`jobId` · `isAccepted` · `error`)를 돌려줘요.
 * 한 작업이 실패해도 뮤테이션은 실패로 끝나지 않아요. 실패했는지는 결과의 `error`로 봐요.
 *
 * 하나라도 접수되면 녹음 쿼리를 무효화해요. 다시 받은 녹음 상태가 정리 중으로 바뀌어야 화면이 바뀌고 조회가 다시 시작돼요.
 * 이 훅은 어느 녹음의 작업인지 몰라서 녹음 쿼리 전체를 무효화해요.
 * 모든 요청과 무효화가 끝날 때까지 `isPending`이 유지되므로, 그동안 버튼을 다시 누를 수 없게 할 수 있어요.
 */
const useRetryDocumentGenerationJobsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: recordingMutationKeys.documentGenerationRetry(),
    mutationFn: ({
      workspaceId,
      jobIds,
    }: RetryDocumentGenerationJobsMutationVariables) =>
      Promise.all(
        jobIds.map((jobId) =>
          retryDocumentGenerationJob({ workspaceId, jobId }),
        ),
      ),
    onSuccess: (results) => {
      if (!results.some(({ isAccepted }) => isAccepted)) return;

      return queryClient.invalidateQueries({ queryKey: recordingKeys.all });
    },
  });
};

export default useRetryDocumentGenerationJobsMutation;
