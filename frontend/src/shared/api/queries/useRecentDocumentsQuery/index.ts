import { getDocumentsApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/documents";
import { documentKeys } from "@api/queryKey/document";
import { useQuery } from "@tanstack/react-query";

/** 한 번에 받는 최근 문서 수 */
const RECENT_DOCUMENT_COUNT = 3;

interface UseRecentDocumentsQueryParams {
  workspaceId: number;
}

/**
 * 워크스페이스에서 가장 최근에 만들어진 문서 3개를 조회하는 쿼리 훅. 문서 전체는 `useDocumentsQuery`로 조회해요.
 *
 * 문서 목록 API의 첫 페이지만 3개로 받아요. 서버가 최신순으로 주므로 첫 페이지가 가장 최근 문서예요.
 * 다음 페이지는 받지 않아요.
 *
 * id가 정수인지는 확인하지 않고 그대로 요청해요. 잘못된 id인지는 서버가 판단해 400으로 답해요.
 */
const useRecentDocumentsQuery = ({
  workspaceId,
}: UseRecentDocumentsQueryParams) => {
  return useQuery({
    queryKey: documentKeys.recentList({ workspaceId }),
    queryFn: () =>
      getDocumentsApi({ workspaceId, size: RECENT_DOCUMENT_COUNT }),
  });
};

export default useRecentDocumentsQuery;
