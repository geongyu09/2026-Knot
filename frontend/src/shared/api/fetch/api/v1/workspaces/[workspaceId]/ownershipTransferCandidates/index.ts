import {
  GetOwnershipTransferCandidatesResponseDto,
  type GetOwnershipTransferCandidatesResponseRaw,
} from "@api/dto/workspace";
import { httpClient } from "@api/httpClient";

export const WORKSPACE_OWNERSHIP_TRANSFER_CANDIDATES_API_PATH = (
  workspaceId: number,
) => `/api/v1/workspaces/${workspaceId}/ownership-transfer-candidates`;

/**
 * @description OWNER를 넘겨받을 수 있는 멤버를 조회합니다. OWNER만 볼 수 있어요
 * @param workspaceId - 워크스페이스 ID
 * @returns 승계 후보 목록
 * @example
 * const { candidates } = await getOwnershipTransferCandidatesApi(1);
 */
export const getOwnershipTransferCandidatesApi = async (
  workspaceId: number,
) => {
  const response = await httpClient<GetOwnershipTransferCandidatesResponseRaw>({
    method: "get",
    url: WORKSPACE_OWNERSHIP_TRANSFER_CANDIDATES_API_PATH(workspaceId),
  });

  return new GetOwnershipTransferCandidatesResponseDto(response.data);
};
