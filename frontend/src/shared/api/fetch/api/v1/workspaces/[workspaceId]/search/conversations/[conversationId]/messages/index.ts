import {
  GetSearchMessagesResponseDto,
  type GetSearchMessagesResponseRaw,
} from "@api/dto/search";
import { httpClient } from "@api/httpClient";

export const WORKSPACE_SEARCH_CONVERSATION_MESSAGES_API_PATH = (
  workspaceId: number,
  conversationId: number,
) =>
  `/api/v1/workspaces/${workspaceId}/search/conversations/${conversationId}/messages`;

/** 한 번에 받을 메시지 수. 서버 기본값과 같아요 */
const DEFAULT_PAGE_SIZE = 30;

interface GetSearchMessagesApiParams {
  workspaceId: number;
  conversationId: number;
  /** 한 번에 받을 메시지 수. 없으면 30개 */
  size?: number;
}

/**
 * @description 탐색 대화의 최근 메시지 한 페이지를 조회합니다. 이전 페이지는 아직 받지 않아요
 * @param params - 워크스페이스 ID·탐색 대화 ID·한 번에 받을 메시지 수
 * @returns 대화 ID·sequence 오름차순 메시지 목록·이전 페이지 여부와 커서
 * @example
 * const { items } = await getSearchMessagesApi({ workspaceId: 1, conversationId: 100 });
 */
export const getSearchMessagesApi = async ({
  workspaceId,
  conversationId,
  size = DEFAULT_PAGE_SIZE,
}: GetSearchMessagesApiParams) => {
  const response = await httpClient<GetSearchMessagesResponseRaw>({
    method: "get",
    url: WORKSPACE_SEARCH_CONVERSATION_MESSAGES_API_PATH(
      workspaceId,
      conversationId,
    ),
    params: { size },
  });

  return new GetSearchMessagesResponseDto(response.data);
};
