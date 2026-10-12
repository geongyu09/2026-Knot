import styled from "@emotion/styled";

import { useTitleId } from "../model/useTitleId";

/**
 * 문서가 하나도 없을 때 보여 주는 문서 목록 섹션. 제목과 설명은 그대로 두고, 목록 자리에 안내를 둬요. 피그마 「문서 목록/빈 상태」예요.
 *
 * 섹션의 틀과 제목까지 여기서 그려요. 문서를 받은 화면(`DocumentList`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function DocumentListEmpty() {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Header>
        <Title id={titleId}>문서</Title>
        <Description>녹음하고 정리한 내용을 폴더별로 모아둬요</Description>
      </Header>
      <Notice>
        <NoticeTitle>아직 문서가 없어요</NoticeTitle>
        <NoticeDescription>
          독의 마이크로 회의를 녹음하면 주제별로 정리된 문서가 폴더에 모여요
        </NoticeDescription>
      </Notice>
    </Container>
  );
}

/** 피그마 List/Docs: 폭 880px, 머리와 안내 사이 28px */
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

/** 피그마 Empty: 높이 320px의 가운데에 글 두 줄, 줄 사이 4px */
const Notice = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem; /* 4px */
  height: 20rem; /* 320px */
  text-align: center;
`;

const NoticeTitle = styled.p`
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[700]};
`;

const NoticeDescription = styled.p`
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[500]};
`;
