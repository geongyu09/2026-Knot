import styled from "@emotion/styled";
import Chip from "@primitives/ui/Chip";
import type { CSSProperties, ReactNode } from "react";

interface DocumentCardProps {
  title: string;
  date: string;
  duration: string;
  sections: { label: string; text: string }[];
  /** 아래쪽 줄 왼쪽에 놓는 글자. 확인한 사람 수 같은 것이에요. */
  footer: ReactNode;
  /** 아래쪽 줄 오른쪽에 놓는 요소 */
  action?: ReactNode;
  /** 입자가 모양을 다 갖춰 진짜 카드와 글자를 보여도 되는지 */
  isRevealed: boolean;
  isLarge?: boolean;
  style?: CSSProperties;
}

/**
 * 녹음을 정리한 문서 카드의 모형.
 *
 * 처음에는 입자만 카드 윤곽과 글줄 모양으로 모이고, 다 모이면 카드 배경과 글자가 나타나요.
 * `data-sand`가 붙은 요소의 위치를 엔진이 재서 입자를 모으므로, 윤곽은 `o`, 글줄은 `l`로 표시해요.
 */
export default function DocumentCard({
  title,
  date,
  duration,
  sections,
  footer,
  action,
  isRevealed,
  isLarge = false,
  style,
}: DocumentCardProps) {
  return (
    <Container data-card data-sand="o" $isRevealed={isRevealed} $isLarge={isLarge} style={style}>
      <Header>
        <Title data-sand="l" $isLarge={isLarge}>
          {title}
        </Title>
        <Meta>
          <Caption data-sand="l">{date}</Caption>
          <span data-reveal>
            <Chip>{duration}</Chip>
          </span>
        </Meta>
      </Header>
      {sections.map(({ label, text }) => (
        <Section key={label}>
          <Label data-sand="l">{label}</Label>
          <Body data-sand="l">{text}</Body>
        </Section>
      ))}
      <Footer data-footer $hasAction={!!action}>
        <FooterText data-sand="l">{footer}</FooterText>
        {action}
      </Footer>
    </Container>
  );
}

const Container = styled.div<{ $isRevealed: boolean; $isLarge: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $isLarge }) => ($isLarge ? "1rem" : "0.875rem")}; /* 16px | 14px */
  padding: ${({ $isLarge }) => ($isLarge ? "1.5rem 1.625rem" : "1.25rem 1.375rem")}; /* 24px 26px | 20px 22px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme, $isRevealed }) => ($isRevealed ? theme.neutral[0] : "transparent")};
  box-shadow: ${({ theme, $isRevealed }) => ($isRevealed ? theme.shadow02 : "none")};
  transition:
    background-color 0.8s,
    box-shadow 0.8s;

  /* 진짜 글자는 입자가 다 모인 뒤에 나타나요 */
  [data-sand="l"],
  [data-reveal] {
    opacity: ${({ $isRevealed }) => ($isRevealed ? 1 : 0)};
    transition: opacity 0.7s;
  }

  [data-footer] {
    border-top-color: ${({ theme, $isRevealed }) => ($isRevealed ? theme.neutral[200] : "transparent")};
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem; /* 6px */
`;

const Title = styled.span<{ $isLarge: boolean }>`
  width: max-content;
  ${({ theme, $isLarge }) => ($isLarge ? theme.text.heading03 : theme.text.heading04)};
  font-weight: 700;
  color: ${({ theme }) => theme.neutral[900]};
`;

const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
`;

const Caption = styled.span`
  width: max-content;
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[600]};
`;

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem; /* 4px */
`;

const Label = styled.span`
  width: max-content;
  ${({ theme }) => theme.text.caption02};
  font-weight: 600;
  color: ${({ theme }) => theme.neutral[900]};
`;

const Body = styled.span`
  width: max-content;
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[800]};
`;

const Footer = styled.div<{ $hasAction: boolean }>`
  display: flex;
  align-items: center;
  justify-content: ${({ $hasAction }) => ($hasAction ? "space-between" : "flex-start")};
  padding-top: 0.75rem; /* 12px */
  border-top: 1px solid transparent;
  transition: border-color 0.8s;
`;

const FooterText = styled.span`
  width: max-content;
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.neutral[700]};
`;
