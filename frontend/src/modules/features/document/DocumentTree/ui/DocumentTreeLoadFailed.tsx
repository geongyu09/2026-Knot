import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

import { useLabelId } from "../model/useLabelId";

interface DocumentTreeLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 문서 목록을 불러오지 못했을 때 보여 주는 문서 목록(ERR-09).
 *
 * 사이드바 전체가 아니라 목록만 실패한 것이라, 머리말은 그대로 두고 폴더가 있어야 할 자리에만 안내를 남겨요.
 * 사이드바는 폭이 좁아 작은 안내를 쓰고, 문구도 짧게 줄여요.
 *
 * 틀과 머리말까지 여기서 그려요. 문서를 받은 모습(`DocumentTree`)과 따로 바뀔 수 있어, 틀을 함께 쓰지 않아요.
 */
export default function DocumentTreeLoadFailed({
  onRetry,
}: DocumentTreeLoadFailedProps) {
  const { labelId } = useLabelId();

  return (
    <Container aria-labelledby={labelId}>
      <Label id={labelId}>문서</Label>
      <InlineErrorWrapper>
        <InlineError
          message="목록을 불러오지 못했어요"
          onRetry={onRetry}
          size="sm"
          align="center"
        />
      </InlineErrorWrapper>
    </Container>
  );
}

/** 피그마 Sidebar/Docs: 머리말과 폴더 묶음 사이 12px */
const Container = styled.nav`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
`;

/** 피그마 FolderHead: 안쪽 여백 왼쪽 10px · 오른쪽 8px */
const Label = styled.span`
  ${({ theme }) => theme.text.caption01};
  padding: 0 0.5rem 0 0.625rem; /* 0 8px 0 10px */
  color: ${({ theme }) => theme.neutral[600]};
`;

/** 피그마 Sidebar/Docs 「실패」: 내용 영역이 남은 높이를 채우고, 안내는 그 정가운데에 있어요 */
const InlineErrorWrapper = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
`;
