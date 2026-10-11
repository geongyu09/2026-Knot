import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

import { useTitleId } from "../model/useTitleId";

import ViewAllLink from "./ViewAllLink";

interface RecentDocumentsLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 최근 문서를 불러오지 못했을 때 보여 주는 「최근 추가된 문서」 카드(ERR-09).
 *
 * 홈 전체가 아니라 이 카드만 실패한 것이라, 제목과 「전체 보기」는 그대로 두고 행 자리에만 안내를 남겨요.
 * 시안이 없어 안내는 문서가 없을 때의 안내(`RecentDocumentsEmpty`)와 같은 자리에 뒀어요.
 *
 * 카드의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`RecentDocumentsCard`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function RecentDocumentsLoadFailed({
  onRetry,
}: RecentDocumentsLoadFailedProps) {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>최근 추가된 문서</Title>
        <ViewAllLink />
      </Header>
      <InlineErrorWrapper>
        <InlineError
          message="문서를 불러오지 못했어요. 다시 시도해 주세요."
          onRetry={onRetry}
        />
      </InlineErrorWrapper>
    </Container>
  );
}

/** 피그마 Card/RecentDocs: 400x312 고정, 안쪽 여백 20px, 머리와 안내 사이 14px */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.875rem; /* 14px */
  width: 25rem; /* 400px */
  max-width: 100%;
  height: 19.5rem; /* 312px */
  overflow: hidden;
  padding: 1.25rem; /* 20px */
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

const Header = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

/** 문서가 없을 때의 안내와 같은 자리: 높이 160px 영역의 가운데 */
const InlineErrorWrapper = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  height: 10rem; /* 160px */
`;
