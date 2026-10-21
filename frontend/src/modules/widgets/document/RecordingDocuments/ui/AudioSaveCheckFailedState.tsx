import styled from "@emotion/styled";
import RetryNotice from "@primitives/ui/RetryNotice";

interface AudioSaveCheckFailedStateProps {
  /** 「다시 시도」를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 끝낸 녹음의 저장 상태를 확인하지 못할 때 정리 중 화면 대신 놓이는 안내.
 *
 * 저장이 실패했는지 알 수 없어 정리 중 화면이 끝없이 이어지지 않도록, 그 자리에서 확인하지 못했다고 알리고 다시 시도하게 해요.
 * 저장 상태를 다시 받으면 정리 중 화면으로 돌아가요.
 */
export default function AudioSaveCheckFailedState({
  onRetry,
}: AudioSaveCheckFailedStateProps) {
  return (
    <Root>
      <RetryNotice
        message="녹음 저장 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
        onRetry={onRetry}
      />
    </Root>
  );
}

/** 다른 상태 화면(`StateMessage`)과 같은 폭에 놓아요 */
const Root = styled.div`
  width: 100%;
  max-width: 32.375rem; /* 518px */
  margin: 0 auto;
`;
