import { getSearchConversationsApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations";
import { searchKeys } from "@api/queryKey/search";
import { skipToken, useQuery } from "@tanstack/react-query";

interface UseSearchConversationsQueryParams {
  /** 워크스페이스 ID. 없으면 조회하지 않아요 */
  workspaceId: number | null;
}

/**
 * 내 탐색 대화 목록의 첫 페이지를 조회하는 쿼리 훅.
 *
 * 서버가 마지막으로 메시지가 오간 순(updatedAt 내림차순)으로 주므로 여기서 다시 정렬하지 않아요.
 */
const useSearchConversationsQuery = ({
  workspaceId,
}: UseSearchConversationsQueryParams) => {
  return useQuery({
    queryKey: searchKeys.conversations(workspaceId),
    queryFn:
      workspaceId === null
        ? skipToken
        : () => getSearchConversationsApi({ workspaceId }),
  });
};

export default useSearchConversationsQuery;
