import styled from "@emotion/styled";

import { TEMPORARY_NEWS } from "../constants/temporaryNews";

/**
 * 새 소식 버튼이 여는 패널. 머리 아래에 공지 목록을 쌓아요(NEWS-R4).
 */
export default function NewsPanel() {
  return (
    <Container>
      <Header>
        <Title>새 소식</Title>
        <Description>새로 생기거나 달라진 점을 모아 둬요</Description>
      </Header>

      <List>
        {TEMPORARY_NEWS.map(({ title, description }) => (
          <Item key={title}>
            <ItemTitle>{title}</ItemTitle>
            <ItemDescription>{description}</ItemDescription>
          </Item>
        ))}
      </List>
    </Container>
  );
}

const Container = styled.div`
  overflow: hidden;
  width: 22.5rem; /* 360px */
  /* 좁은 화면에서도 팝오버가 지키는 좌우 16px 여백 안에 들어가요 */
  max-width: calc(100vw - 2rem);
  border: 1px solid ${({ theme }) => theme.neutral[200]};
  border-radius: 1rem; /* 16px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  padding: 1.25rem 1.25rem 0.875rem; /* 20px 20px 14px */
  border-bottom: 1px solid ${({ theme }) => theme.neutral[200]};
`;

const Title = styled.h2`
  margin: 0;
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;

const Description = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.neutral[500]};
  ${({ theme }) => theme.text.caption01};
`;

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 1.25rem; /* 20px */
  margin: 0;
  padding: 1rem 1.25rem 1.5rem; /* 16px 20px 24px */
  list-style: none;
`;

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: 0.375rem; /* 6px */
`;

const ItemTitle = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.caption02};
  font-weight: 500;
`;

const ItemDescription = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.neutral[600]};
  ${({ theme }) => theme.text.caption02};
`;
