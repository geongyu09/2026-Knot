import styled from "@emotion/styled";
import Button from "@primitives/ui/Button";

import AlertIcon from "@/assets/icons/alert.svg";

interface InlineErrorProps {
  /** 무엇이 안 됐는지 알리는 문구 */
  message: string;
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
  /**
   * 문구와 `다시 시도`의 가로 정렬. 그 자리의 빈 상태 안내와 같은 정렬을 골라요.
   * 영역 전체를 대신할 때는 `center`(예: 홈 카드), 글 흐름 안에 들어갈 때는 `start`(예: 탐색 답변)예요.
   * @default "start"
   */
  align?: keyof typeof ALIGN;
}

const ALIGN = {
  start: "flex-start",
  center: "center",
} as const;

/**
 * 화면 안 한 영역이나 한 동작만 실패했을 때, 그 내용이 있어야 할 자리에 남기는 안내.
 *
 * 경고색은 아이콘에만 쓰고 문구는 본문 색이에요.
 * 같은 실패를 토스트로 또 알리지 않아요.
 * 낭독기가 바로 읽도록 `role="alert"`를 붙였어요.
 */
export default function InlineError({
  message,
  onRetry,
  align = "start",
}: InlineErrorProps) {
  return (
    <Container role="alert" $align={align}>
      <MessageRow>
        <Icon aria-hidden size={18} />
        <Message>{message}</Message>
      </MessageRow>
      <Button size="sm" variant="outline" onClick={onRetry}>
        다시 시도
      </Button>
    </Container>
  );
}

const Container = styled.div<{ $align: keyof typeof ALIGN }>`
  display: flex;
  flex-direction: column;
  align-items: ${({ $align }) => ALIGN[$align]};
  gap: 0.75rem; /* 12px */
`;

const MessageRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
`;

const Icon = styled(AlertIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.sub.warning[700]};
`;

const Message = styled.p`
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[700]};
  overflow-wrap: break-word;
`;
