import { getSearchMessagesApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/search/conversations/[conversationId]/messages";
import { searchKeys } from "@api/queryKey/search";
import { skipToken, useQuery } from "@tanstack/react-query";

interface UseSearchMessagesQueryParams {
  workspaceId: number;
  /** 대화 ID. 없으면 아직 질문을 보내지 않은 새 대화예요 */
  conversationId?: number;
}

/**
 * 탐색 대화의 최근 메시지 한 페이지를 조회하는 쿼리 훅.
 *
 * 대화가 없는 새 대화 화면에서는 조회할 대상이 없으므로 요청을 보내지 않아요.
 */
const useSearchMessagesQuery = ({
  workspaceId,
  conversationId,
}: UseSearchMessagesQueryParams) => {
  return useQuery({
    queryKey: searchKeys.messages({ workspaceId, conversationId }),
    queryFn:
      conversationId === undefined
        ? skipToken
        : () => getSearchMessagesApi({ workspaceId, conversationId }),
  });
};

export default useSearchMessagesQuery;
