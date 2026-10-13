import styled from "@emotion/styled";
import Skeleton from "@primitives/ui/Skeleton";

import { useTitleId } from "../model/useTitleId";

/** 그릴 행의 수. 피그마 「홈/불러오는 중」의 카드가 두 개를 둬요 */
const ROW_COUNT = 2;

/**
 * 확인할 문서를 불러오는 동안 보여 주는 「확인이 필요한 문서」 카드. 제목은 그대로 두고 문서 수를 숨긴 채, 행 자리를 회색 덩어리로 채워요. 피그마 「홈/불러오는 중」이에요.
 *
 * 행의 여백과 높이를 실제 행과 같게 지켜, 불러온 뒤 내용이 움직이지 않게 해요.
 *
 * 카드의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`PendingDocumentsCard`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function PendingDocumentsSkeleton() {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>확인이 필요한 문서</Title>
      </Header>
      <Rows role="status" aria-label="확인이 필요한 문서를 불러오고 있어요">
        {Array.from({ length: ROW_COUNT }, (_, rowIndex) => (
          <Row key={rowIndex}>
            <Info>
              <TitleLine>
                {/* 피그마의 제목 자리 130 × 14px */}
                <Skeleton width={8.125} height={0.875} />
              </TitleLine>
              <DateLine>
                {/* 피그마의 날짜 자리 100 × 10px */}
                <Skeleton width={6.25} />
              </DateLine>
            </Info>
            {/* 피그마의 「확인하기」 자리 92 × 40px, 모서리 12px */}
            <Skeleton width={5.75} height={2.5} radius={0.75} />
          </Row>
        ))}
      </Rows>
    </Container>
  );
}

/** 피그마 Card/ConfirmRequests: 652x312 고정, 안쪽 여백 20px, 머리와 행 사이 8px */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  width: 40.75rem; /* 652px */
  max-width: 100%;
  height: 19.5rem; /* 312px */
  overflow: hidden;
  padding: 1.25rem; /* 20px */
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

/** 피그마 Header: 좌우 4px · 아래 8px */
const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 0 0.25rem 0.5rem; /* 0 4px 8px */
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

/** 피그마 Card/ConfirmRequests: 행 사이 8px */
const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
`;

/** 피그마 ConfirmRow: 위아래 8px · 좌우 12px, 글과 버튼 사이 16px */
const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem; /* 16px */
  padding: 0.5rem 0.75rem; /* 8px 12px */
`;

/** 피그마 Text: 제목과 날짜 사이 2px */
const Info = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
`;

/** 실제 제목 줄의 높이 24px을 지켜요 */
const TitleLine = styled.div`
  display: flex;
  align-items: center;
  height: 1.5rem; /* 24px */
`;

/** 실제 날짜 줄의 높이 21px을 지켜요 */
const DateLine = styled.div`
  display: flex;
  align-items: center;
  height: 1.3125rem; /* 21px */
`;
