import type { PostOwnershipTransferRequestDto } from "@api/dto/workspace";
import { httpClient } from "@api/httpClient";

export const WORKSPACE_OWNERSHIP_TRANSFERS_API_PATH = (workspaceId: number) =>
  `/api/v1/workspaces/${workspaceId}/ownership-transfers`;

interface TransferWorkspaceOwnershipApiParams {
  workspaceId: number;
  body: PostOwnershipTransferRequestDto;
}

/**
 * @description OWNER를 다른 멤버에게 넘기고 워크스페이스에서 나갑니다. 성공 시 응답 본문은 없어요(204)
 * @param params - 워크스페이스 ID와 승계 요청 본문
 * @example
 * await transferWorkspaceOwnershipApi({ workspaceId: 1, body });
 */
export const transferWorkspaceOwnershipApi = async ({
  workspaceId,
  body,
}: TransferWorkspaceOwnershipApiParams) => {
  await httpClient({
    method: "post",
    url: WORKSPACE_OWNERSHIP_TRANSFERS_API_PATH(workspaceId),
    data: body,
  });
};
