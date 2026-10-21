import { getAllDocumentsApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { confirmDocumentApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents/[documentId]/confirmations/me";
import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";
import { documentKeys } from "@api/queryKey/document";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ConfirmDocumentMutationVariables {
  workspaceId: number;
  documentId: number;
}

/**
 * 문서를 확인했다고 기록하는 뮤테이션 훅.
 *
 * 요청 본문이 없어 ID만 넘겨요.
 * 성공하면 그 문서의 상세 캐시를 무효화해요. 확인 대상 캐시는 상세 키 아래에 있어 함께 다시 받아요.
 * 그 워크스페이스의 확인 대기 문서 목록(홈의 「확인이 필요한 문서」 카드)도 함께 다시 받아요.
 * 이 목록은 받은 적이 없어도 받아요. 문서 보기가 이 목록으로 같은 녹음의 문서를 모두 확인했는지 알아요(CONF-R4).
 * 목록을 받지 못해도 확인은 성공한 것이라 뮤테이션은 실패로 끝나지 않아요. 결과는 목록 쿼리의 상태로 남아요.
 * 응답에 내 확인 상태가 없어, 응답으로 캐시를 직접 고치지 않고 다시 받아요.
 * 확인 대상이 아니라는 409도 화면이 아는 내 상태가 서버와 다른 것이라, 같은 캐시를 무효화해요.
 */
const useConfirmDocumentMutation = () => {
  const queryClient = useQueryClient();

  const invalidateDocument = ({
    workspaceId,
    documentId,
  }: ConfirmDocumentMutationVariables) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: documentKeys.detail({ workspaceId, documentId }),
      }),
      // 확인 대기 문서 목록은 홈에서만 쓰여, 문서 보기에서는 화면에 없는 쿼리예요.
      // 화면에 없는 쿼리는 무효화만으로는 다시 받지 않아서, 홈으로 돌아가면 앞서 받아 둔 목록이 먼저 그려져 방금 확인한 문서가 잠깐 보여요.
      // 그래서 화면에 없거나 받은 적이 없어도 바로 다시 받게 해요. 쿼리 훅(`usePendingDocumentsQuery`)과 같은 키와 요청 함수를 써요
      queryClient
        .fetchQuery({
          queryKey: documentKeys.pendingList({ workspaceId }),
          queryFn: () =>
            getAllDocumentsApi({ workspaceId, myConfirmation: "PENDING" }),
          staleTime: 0,
        })
        .catch(() => undefined),
    ]);

  return useMutation({
    mutationFn: (variables: ConfirmDocumentMutationVariables) =>
      confirmDocumentApi(variables),
    onSuccess: (_, variables) => invalidateDocument(variables),
    onError: (error, variables) => {
      if (isHttpError(error, HTTP_ERROR_TYPE.conflict)) {
        return invalidateDocument(variables);
      }
    },
  });
};

export default useConfirmDocumentMutation;
