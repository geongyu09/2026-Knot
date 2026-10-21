import useMeQuery from "@api/queries/useMeQuery";
import { MEDIA_QUERY } from "@constants/breakpoint";
import styled from "@emotion/styled";

/**
 * 워크스페이스 홈 상단의 인사말. 닉네임은 로그인한 회원 정보 조회(`GET /auth/me`) 응답에서 와요.
 */
export default function MemberGreeting() {
  const { data: me } = useMeQuery();

  return <Greeting>반가워요{me && `, ${me.nickname} 님`}</Greeting>;
}

const Greeting = styled.h1`
  color: ${({ theme }) => theme.neutral[800]};
  text-align: center;
  overflow-wrap: break-word;
  ${({ theme }) => theme.text.title01};

  /* 모바일은 카드가 한 열로 쌓여 인사말도 왼쪽에 맞추고 26px로 줄여요(RESP-R5) */
  ${MEDIA_QUERY.mobile} {
    text-align: left;
    ${({ theme }) => theme.text.heading02};
  }
`;
