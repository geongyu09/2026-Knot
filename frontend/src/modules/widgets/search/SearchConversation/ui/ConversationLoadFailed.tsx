import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

interface ConversationLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 대화의 메시지를 받지 못했을 때 대화 칸에 남기는 안내(SEARCH-15 3번, ERR-09와 같은 방식).
 *
 * 보던 대화나 시작 전 안내 대신 이 안내만 둬요. 피그마 시안이 아직 없어, 시작 전 안내와 같이 칸 가운데에 둬요.
 */
export default function ConversationLoadFailed({
  onRetry,
}: ConversationLoadFailedProps) {
  return (
    <Container>
      <InlineError
        message="대화를 불러오지 못했어요. 다시 시도해 주세요."
        onRetry={onRetry}
        align="center"
      />
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;
