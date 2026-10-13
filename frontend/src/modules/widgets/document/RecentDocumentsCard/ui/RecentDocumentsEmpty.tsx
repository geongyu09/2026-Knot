import styled from "@emotion/styled";

import { useTitleId } from "../model/useTitleId";

/**
 * 문서가 하나도 없을 때 보여 주는 「최근 추가된 문서」 카드. 제목만 두고 행 자리에 안내를 둬요. 피그마 「홈/처음 사용」이에요.
 *
 * 문서가 없으면 문서 목록에도 볼 것이 없어 「전체 보기」는 두지 않아요.
 *
 * 카드의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`RecentDocumentsCard`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function RecentDocumentsEmpty() {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>최근 추가된 문서</Title>
      </Header>
      <Notice>
        <NoticeTitle>아직 문서가 없어요</NoticeTitle>
        <NoticeDescription>
          녹음을 끝내면 정리된 문서가 여기에 쌓여요
        </NoticeDescription>
      </Notice>
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
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

/** 피그마 Empty: 높이 160px 영역의 가운데, 두 줄 사이 4px */
const Notice = styled.div`
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem; /* 4px */
  height: 10rem; /* 160px */
  text-align: center;
`;

const NoticeTitle = styled.p`
  color: ${({ theme }) => theme.neutral[700]};
  ${({ theme }) => theme.text.body01};
`;

const NoticeDescription = styled.p`
  color: ${({ theme }) => theme.neutral[500]};
  ${({ theme }) => theme.text.caption02};
`;
