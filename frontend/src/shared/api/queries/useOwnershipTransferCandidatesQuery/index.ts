import { getOwnershipTransferCandidatesApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/ownershipTransferCandidates";
import { workspaceKeys } from "@api/queryKey/workspace";
import { useQuery } from "@tanstack/react-query";

interface UseOwnershipTransferCandidatesQueryParams {
  workspaceId: number;
}

/**
 * OWNER를 넘겨받을 수 있는 멤버를 조회하는 쿼리 훅.
 *
 * OWNER만 볼 수 있어(그 외 403) owner가 나가려고 멤버 선택 창을 띄웠을 때만 써요.
 */
const useOwnershipTransferCandidatesQuery = ({
  workspaceId,
}: UseOwnershipTransferCandidatesQueryParams) => {
  return useQuery({
    queryKey: workspaceKeys.ownershipTransferCandidates(workspaceId),
    queryFn: () => getOwnershipTransferCandidatesApi(workspaceId),
  });
};

export default useOwnershipTransferCandidatesQuery;
