import styled from "@emotion/styled";
import type { ReactNode } from "react";

import ChevronDownIcon from "@/assets/icons/chevronDown.svg";
import ChevronRightIcon from "@/assets/icons/chevronRight.svg";

interface DocumentTreeFolderProps {
  /** 폴더 이름. AI가 분류한 주제예요 */
  topic: string;
  /** 이 폴더의 전체 문서 수. 아래에 그린 행을 센 값이 아니라 서버가 준 값이에요 */
  documentCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  /** 폴더에 담을 문서 행(`DocumentTreeRow`). 펼쳤을 때만 그려요 */
  children: ReactNode;
}

/**
 * 사이드바 문서 목록의 폴더 하나. 폴더 행을 누르면 그 폴더의 문서 행을 펼치거나 접어요.
 */
export default function DocumentTreeFolder({
  topic,
  documentCount,
  isExpanded,
  onToggle,
  children,
}: DocumentTreeFolderProps) {
  return (
    <Container>
      <FolderRow type="button" aria-expanded={isExpanded} onClick={onToggle}>
        <NameGroup>
          {isExpanded ? (
            <ChevronDownIcon size={12} />
          ) : (
            <ChevronRightIcon size={12} />
          )}
          <Name>{topic}</Name>
        </NameGroup>
        <DocumentCount>{documentCount}</DocumentCount>
      </FolderRow>
      {isExpanded && <Rows>{children}</Rows>}
    </Container>
  );
}

/** 피그마 Folder: 폴더 행과 문서 행 묶음 사이 2px */
const Container = styled.li`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
`;

/** 피그마 TopicRow: 높이 32px, 모서리 8px, 안쪽 여백 왼쪽 8px · 오른쪽 10px */
const FolderRow = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem; /* 8px */
  width: 100%;
  height: 2rem; /* 32px */
  padding: 0 0.625rem 0 0.5rem; /* 0 10px 0 8px */
  border-radius: 0.5rem; /* 8px */
  text-align: left;
  transition: background-color 0.2s ease-in;

  &:hover {
    background-color: ${({ theme }) => theme.neutral[100]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: -2px;
  }
`;

/** 피그마 TopicRow 안쪽: 화살표와 폴더 이름 사이 8px */
const NameGroup = styled.span`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
  min-width: 0;

  & > svg {
    flex-shrink: 0;
    color: ${({ theme }) => theme.neutral[400]};
  }
`;

const Name = styled.span`
  ${({ theme }) => theme.text.caption02};
  overflow: hidden;
  color: ${({ theme }) => theme.neutral[800]};
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const DocumentCount = styled.span`
  ${({ theme }) => theme.text.caption01};
  flex-shrink: 0;
  color: ${({ theme }) => theme.neutral[600]};
`;

/**
 * 피그마 Indent · Docs: 왼쪽으로 14px 들여 세로선을 긋고, 문서 행을 2px 간격으로 쌓아요.
 * 피그마의 선은 자리를 차지하지 않아 문서 행이 14px에서 6px 떨어져요. CSS의 선은 1px을 차지하므로 안쪽 여백을 5px로 둬요
 */
const Rows = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
  margin-left: 0.875rem; /* 14px */
  padding-left: 0.3125rem; /* 5px */
  border-left: 1px solid ${({ theme }) => theme.neutral[200]};
`;
