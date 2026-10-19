import { getAllDocumentsApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { documentKeys } from "@api/queryKey/document";
import { useQuery } from "@tanstack/react-query";

interface UsePendingDocumentsQueryParams {
  workspaceId: number;
}

/**
 * 워크스페이스에서 내가 아직 확인하지 않은 문서를 조회하는 쿼리 훅. 문서 전체는 `useDocumentsQuery`로 조회해요.
 *
 * 문서 목록 API에 내 확인 상태 조건(`PENDING`)을 붙여 요청해요. 응답의 주제 폴더와 그 문서 수도 확인하지 않은 문서만 센 값이에요.
 * 한 페이지가 아니라 다음 페이지가 없을 때까지 이어 받아요. 확인할 문서를 모두 보여 줘야 해서예요.
 * 이어 받는 도중 한 요청이라도 실패하면 조회 전체가 실패예요.
 *
 * id가 정수인지는 확인하지 않고 그대로 요청해요. 잘못된 id인지는 서버가 판단해 400으로 답해요.
 */
const usePendingDocumentsQuery = ({
  workspaceId,
}: UsePendingDocumentsQueryParams) => {
  return useQuery({
    queryKey: documentKeys.pendingList({ workspaceId }),
    queryFn: () =>
      getAllDocumentsApi({ workspaceId, myConfirmation: "PENDING" }),
  });
};

export default usePendingDocumentsQuery;
