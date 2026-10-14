import { leaveWorkspaceApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/members/me";
import { workspaceKeys } from "@api/queryKey/workspace";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface LeaveWorkspaceMutationVariables {
  workspaceId: number;
}

/**
 * 워크스페이스에서 나가는 뮤테이션 훅.
 *
 * 성공하면 내가 속한 워크스페이스 목록을 다시 받아 나간 워크스페이스가 빠지게 해요.
 * 실패하면 내 역할이나 멤버 수가 달라졌을 수 있어(다른 멤버가 있는 OWNER는 409) 워크스페이스 조회를 무효화해요.
 */
const useLeaveWorkspaceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId }: LeaveWorkspaceMutationVariables) =>
      leaveWorkspaceApi(workspaceId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
    onError: (_error, { workspaceId }) =>
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.detail(workspaceId),
      }),
  });
};

export default useLeaveWorkspaceMutation;
