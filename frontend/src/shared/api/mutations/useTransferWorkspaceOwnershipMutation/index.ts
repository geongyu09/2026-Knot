import {
  PostOwnershipTransferRequestDto,
  type PostOwnershipTransferRequestInput,
} from "@api/dto/workspace";
import { transferWorkspaceOwnershipApi } from "@api/fetch/api/v1/workspaces/[workspaceId]/ownershipTransfers";
import { workspaceKeys } from "@api/queryKey/workspace";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface TransferWorkspaceOwnershipMutationVariables extends PostOwnershipTransferRequestInput {
  workspaceId: number;
}

/**
 * OWNER를 다른 멤버에게 넘기고 워크스페이스에서 나가는 뮤테이션 훅.
 *
 * 탈퇴까지 함께 처리되므로 나가기 요청을 따로 보내지 않아요.
 * 성공하면 내가 속한 워크스페이스 목록을 다시 받아 나간 워크스페이스가 빠지게 해요.
 * 실패하면 고른 멤버가 그사이 나갔을 수 있어 승계 후보를 무효화해요.
 */
const useTransferWorkspaceOwnershipMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      ...input
    }: TransferWorkspaceOwnershipMutationVariables) =>
      transferWorkspaceOwnershipApi({
        workspaceId,
        body: new PostOwnershipTransferRequestDto(input),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() }),
    onError: (_error, { workspaceId }) =>
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.ownershipTransferCandidates(workspaceId),
      }),
  });
};

export default useTransferWorkspaceOwnershipMutation;
