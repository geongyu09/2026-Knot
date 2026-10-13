import styled from "@emotion/styled";
import Skeleton from "@primitives/ui/Skeleton";

import { useTitleId } from "../model/useTitleId";

import ViewAllLink from "./ViewAllLink";

/** 그릴 행의 수. 카드가 문서를 3개까지 보여 줘서 세 개를 둬요 */
const ROW_COUNT = 3;

/**
 * 최근 문서를 불러오는 동안 보여 주는 「최근 추가된 문서」 카드. 제목과 「전체 보기」는 그대로 두고, 문서 행 자리를 회색 덩어리로 채워요. 피그마 「홈/불러오는 중」이에요.
 *
 * 행의 여백과 높이를 실제 행과 같게 지켜, 불러온 뒤 내용이 움직이지 않게 해요.
 *
 * 카드의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`RecentDocumentsCard`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function RecentDocumentsSkeleton() {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>최근 추가된 문서</Title>
        <ViewAllLink />
      </Header>
      <Rows role="status" aria-label="최근 추가된 문서를 불러오고 있어요">
        {Array.from({ length: ROW_COUNT }, (_, rowIndex) => (
          <Row key={rowIndex}>
            <TitleLine>
              {/* 피그마의 제목 자리 130 × 14px */}
              <Skeleton width={8.125} height={0.875} />
            </TitleLine>
            <Meta>
              {/* 피그마의 날짜 자리 90 × 10px */}
              <Skeleton width={5.625} />
              {/* 피그마의 녹음 길이 자리 40 × 12px */}
              <Skeleton width={2.5} height={0.75} />
            </Meta>
          </Row>
        ))}
      </Rows>
    </Container>
  );
}

/** 피그마 Card/RecentDocs: 400x312 고정, 안쪽 여백 20px, 머리와 행 사이 14px */
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

/** 피그마 Card/RecentDocs: 행 사이 14px */
const Rows = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.875rem; /* 14px */
`;

/** 피그마 DocRow: 위아래 안쪽 여백 8px, 제목과 날짜 줄 사이 2px */
const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  padding: 0.5rem 0; /* 8px 0 */
`;

/** 실제 제목 줄의 높이 24px을 지켜요 */
const TitleLine = styled.div`
  display: flex;
  align-items: center;
  height: 1.5rem; /* 24px */
`;

/** 실제 날짜 줄의 높이 20px(녹음 길이 칩의 높이)과 덩어리 사이 8px을 지켜요 */
const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
  height: 1.25rem; /* 20px */
`;
