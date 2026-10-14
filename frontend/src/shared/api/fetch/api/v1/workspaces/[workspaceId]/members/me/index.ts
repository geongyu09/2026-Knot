import { httpClient } from "@api/httpClient";

export const WORKSPACE_MEMBERS_ME_API_PATH = (workspaceId: number) =>
  `/api/v1/workspaces/${workspaceId}/members/me`;

/**
 * @description 워크스페이스에서 나갑니다. 성공 시 응답 본문은 없어요(204). 다른 멤버가 있는 OWNER는 409라 승계 요청을 써야 해요
 * @param workspaceId - 워크스페이스 ID
 * @example
 * await leaveWorkspaceApi(1);
 */
export const leaveWorkspaceApi = async (workspaceId: number) => {
  await httpClient({
    method: "delete",
    url: WORKSPACE_MEMBERS_ME_API_PATH(workspaceId),
  });
};
