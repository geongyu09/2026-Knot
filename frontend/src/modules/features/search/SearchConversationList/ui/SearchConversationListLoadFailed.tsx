import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

interface SearchConversationListLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 대화 목록을 불러오지 못했을 때 목록 자리에 놓이는 안내.
 *
 * 대화가 없는 빈 목록과 구분되도록, 빈 안내 대신 실패 안내와 `다시 시도`를 둬요.
 * 드로어는 폭이 좁아 사이드바의 문서 목록 실패(`DocumentTreeLoadFailed`)처럼 작은 안내를 써요.
 */
export default function SearchConversationListLoadFailed({
  onRetry,
}: SearchConversationListLoadFailedProps) {
  return (
    <Root>
      <InlineError
        message="대화 목록을 불러오지 못했어요"
        onRetry={onRetry}
        size="sm"
        align="center"
      />
    </Root>
  );
}

/** 빈 안내(`EmptySearchConversationList`)와 같이 목록 자리를 채우고, 안내는 그 정가운데에 놓아요 */
const Root = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;
