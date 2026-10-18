import styled from "@emotion/styled";
import Pop from "@primitives/animation/Pop";
import Avatar from "@primitives/ui/Avatar";
import Button from "@primitives/ui/Button";
import { useId, type HTMLAttributes, type ReactNode } from "react";

import RadioSelectedIcon from "@/assets/icons/radioSelected.svg";

interface MemberSelectDialogMember {
  id: number;
  name: string;
}

interface MemberSelectDialogProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "title"
> {
  /** 한 줄 제목 */
  title: ReactNode;
  /** 제목 아래 안내. 최대 두 줄이에요. 줄바꿈은 의미 단위로 직접 넣어요 */
  description: ReactNode;
  /** 고를 수 있는 멤버 목록. 5명이 넘으면 목록 안에서 스크롤해요 */
  members: MemberSelectDialogMember[];
  /** 고른 멤버의 ID. 아직 고르지 않았으면 `null`이고, 그동안 주 버튼은 누를 수 없어요 */
  selectedMemberId: number | null;
  /** 멤버를 골랐을 때 할 일 */
  onSelectMember: (memberId: number) => void;
  /** 왼쪽 보조 버튼 문구. 예: `취소` */
  cancelLabel: string;
  /** 오른쪽 주 버튼 문구. 예: `넘기고 나가기` */
  confirmLabel: string;
  /** 버튼 아래 경고색 텍스트 링크 문구. 예: `워크스페이스 삭제하기` */
  linkLabel: string;
  /** 보조 버튼을 눌렀을 때 할 일 */
  onCancel: () => void;
  /** 주 버튼을 눌렀을 때 할 일 */
  onConfirm: () => void;
  /** 텍스트 링크를 눌렀을 때 할 일 */
  onLinkClick: () => void;
}

/**
 * 멤버 하나를 고르는 모달 카드.
 *
 * 되돌릴 수 없는 동작에 쓰는 창이라 주 버튼을 경고색으로 그려요.
 */
export default function MemberSelectDialog({
  title,
  description,
  members,
  selectedMemberId,
  onSelectMember,
  cancelLabel,
  confirmLabel,
  linkLabel,
  onCancel,
  onConfirm,
  onLinkClick,
  ...rest
}: MemberSelectDialogProps) {
  const id = useId();
  const titleId = `${id}-title`;

  return (
    <Container {...rest}>
      <Head>
        <Title id={titleId}>{title}</Title>
        <Description>{description}</Description>
      </Head>
      <MemberList role="radiogroup" aria-labelledby={titleId}>
        {members.map(({ id: memberId, name }) => {
          const isSelected = memberId === selectedMemberId;

          return (
            <MemberItem key={memberId} $isSelected={isSelected}>
              {/* 이름이 바로 옆에 있어 아바타는 읽지 않아요 */}
              <AvatarWrapper aria-hidden>
                <Avatar label={name} name={name} size={32} />
              </AvatarWrapper>
              <MemberName>{name}</MemberName>
              <HiddenRadio
                type="radio"
                name={id}
                checked={isSelected}
                onChange={() => onSelectMember(memberId)}
              />
              {isSelected ? <SelectedRadio size={20} /> : <EmptyRadio />}
            </MemberItem>
          );
        })}
      </MemberList>
      <Footer>
        <Actions>
          <Button size="md" variant="outline" isFullWidth onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            size="md"
            variant="danger"
            isFullWidth
            disabled={selectedMemberId === null}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Actions>
        <TextLink type="button" onClick={onLinkClick}>
          {linkLabel}
        </TextLink>
      </Footer>
    </Container>
  );
}

const Container = styled(Pop)`
  display: flex;
  flex-direction: column;
  gap: 2rem; /* 32px */
  width: 100%;
  max-width: 32.5rem; /* 520px */
  padding: 2rem; /* 32px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const Head = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  text-align: center;
  overflow-wrap: break-word;
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.heading02};
  color: ${({ theme }) => theme.neutral[900]};
`;

const Description = styled.p`
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[600]};
  white-space: pre-line;
`;

const MemberList = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 0.25rem; /* 4px */
  max-height: 17.25rem; /* 276px — 5명(행 52px, 간격 4px)까지 보이고 넘치면 스크롤해요 */
  overflow-y: auto;
`;

const MemberItem = styled.label<{ $isSelected: boolean }>`
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.75rem; /* 12px */
  padding: 0.625rem 0.75rem; /* 10px 12px */
  border-radius: 0.75rem; /* 12px */
  background-color: ${({ theme, $isSelected }) =>
    $isSelected ? theme.neutral[100] : "transparent"};
  cursor: pointer;

  &:has(:focus-visible) {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: -2px;
  }
`;

const AvatarWrapper = styled.span`
  display: flex;
  flex-shrink: 0;
`;

const MemberName = styled.span`
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
  ${({ theme }) => theme.text.body01};
  color: ${({ theme }) => theme.neutral[900]};
`;

/** 모양은 옆의 아이콘이 대신 그리고, 선택과 키보드 조작만 맡아요 */
const HiddenRadio = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
`;

const SelectedRadio = styled(RadioSelectedIcon)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.primary};
`;

const EmptyRadio = styled.span`
  flex-shrink: 0;
  width: 1.25rem; /* 20px */
  height: 1.25rem; /* 20px */
  border: 1.5px solid ${({ theme }) => theme.neutral[300]};
  border-radius: 50%;
`;

const Footer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem; /* 16px */
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem; /* 8px */
  width: 100%;
`;

const TextLink = styled.button`
  ${({ theme }) => theme.text.caption02};
  color: ${({ theme }) => theme.sub.warning[700]};

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
`;
