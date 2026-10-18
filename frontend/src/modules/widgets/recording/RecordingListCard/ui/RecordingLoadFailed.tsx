import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

interface RecordingLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 내 녹음 상태를 불러오지 못했을 때 칸 대신 보여 주는 안내. 피그마 「홈/진행 중인 녹음 불러오기 실패」예요(ERR-09).
 *
 * 표시만 실패한 것이라 녹음은 멈추지 않아요. 카드 제목과 높이는 그대로 두고 칸 자리 가운데에 안내를 놓아요.
 */
export default function RecordingLoadFailed({
  onRetry,
}: RecordingLoadFailedProps) {
  return (
    <Root>
      <InlineError
        message="녹음 상태를 불러오지 못했어요. 다시 시도해 주세요."
        onRetry={onRetry}
        align="center"
      />
    </Root>
  );
}

/** 피그마 Error: 머리 아래 남은 영역을 채우고 그 가운데에 안내를 놓아요 */
const Root = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
`;
