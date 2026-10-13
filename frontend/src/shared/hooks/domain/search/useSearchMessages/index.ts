import useSearchMessagesQuery from "@api/queries/useSearchMessagesQuery";
import { useParams } from "react-router";

interface UseSearchMessagesParams {
  /** 대화 ID. 없으면 아직 질문을 보내지 않은 새 대화예요. */
  conversationId?: number;
}

/**
 * 탐색 대화의 저장된 메시지 목록을 주는 도메인 훅.
 *
 * 대화 칸·찾은 기록 패널·GNB의 찾은 기록 버튼이 같은 메시지를 봐야 하므로 출처를 이 훅 하나로 모아요.
 * 대화 ID가 없거나 아직 받지 못했으면 빈 목록이에요.
 */
const useSearchMessages = ({ conversationId }: UseSearchMessagesParams) => {
  const { workspaceId } = useParams();
  const { data } = useSearchMessagesQuery({
    workspaceId: Number(workspaceId),
    conversationId,
  });

  return { messages: data?.items ?? [] };
};

export default useSearchMessages;
