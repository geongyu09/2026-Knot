import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";

import { useTitleId } from "../model/useTitleId";

interface DocumentListLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 문서 목록을 불러오지 못했을 때 보여 주는 문서 목록 섹션. 피그마 「문서 목록/불러오기 실패」예요(ERR-09).
 *
 * 화면 전체가 아니라 목록만 실패한 것이라, 제목과 설명은 그대로 두고 목록이 있어야 할 자리에만 안내를 남겨요.
 *
 * 섹션의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`DocumentList`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function DocumentListLoadFailed({
  onRetry,
}: DocumentListLoadFailedProps) {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>문서</Title>
        <Description>녹음하고 정리한 내용을 폴더별로 모아둬요</Description>
      </Header>
      <InlineErrorWrapper>
        <InlineError
          message="목록을 불러오지 못했어요. 다시 시도해 주세요."
          onRetry={onRetry}
        />
      </InlineErrorWrapper>
    </Container>
  );
}

/** 피그마 List/Docs: 폭 880px, 머리와 안내 자리 사이 28px */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1.75rem; /* 28px */
  width: 100%;
  max-width: 55rem; /* 880px */
`;

/** 피그마 머리: 제목과 설명 사이 6px */
const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem; /* 6px */
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.heading02};
  color: ${({ theme }) => theme.neutral[900]};
`;

const Description = styled.p`
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[600]};
`;

/**
 * 피그마 「문서 목록/불러오기 실패」: 안내를 가로 가운데, 제목 묶음 아래 120px에 놓아요.
 * 제목 묶음과 이 자리 사이에 28px이 있으므로, 나머지 92px을 여기서 띄워요
 */
const InlineErrorWrapper = styled.div`
  display: flex;
  justify-content: center;
  padding-top: 5.75rem; /* 92px */
`;
