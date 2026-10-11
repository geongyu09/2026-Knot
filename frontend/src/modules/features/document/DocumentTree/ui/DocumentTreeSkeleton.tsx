import styled from "@emotion/styled";
import Skeleton from "@primitives/ui/Skeleton";

import { useLabelId } from "../model/useLabelId";

/** 폴더 이름 자리 덩어리의 폭(rem). 폴더마다 이름 길이가 달라 보이게 서로 다르게 둬요 */
const FOLDER_NAME_WIDTHS = [5, 3.75, 4.5];

/**
 * 문서 목록을 불러오는 동안 보여 주는 문서 목록. 머리말은 그대로 두고, 폴더 행 자리를 회색 덩어리로 채워요.
 *
 * 폴더 행의 높이와 간격을 실제 목록과 같게 지켜, 불러온 뒤 내용이 움직이지 않게 해요.
 *
 * 틀과 머리말까지 여기서 그려요. 문서를 받은 모습(`DocumentTree`)과 따로 바뀔 수 있어, 틀을 함께 쓰지 않아요.
 */
export default function DocumentTreeSkeleton() {
  const { labelId } = useLabelId();

  return (
    <Container aria-labelledby={labelId}>
      <Label id={labelId}>문서</Label>
      <Folders role="status" aria-label="문서 목록을 불러오고 있어요">
        {FOLDER_NAME_WIDTHS.map((width) => (
          <FolderRow key={width}>
            {/* 폴더 이름 글자 높이 14px */}
            <Skeleton width={width} height={0.875} />
          </FolderRow>
        ))}
      </Folders>
    </Container>
  );
}

/** 피그마 Sidebar/Docs: 머리말과 폴더 묶음 사이 12px */
const Container = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 0.75rem; /* 12px */
`;

/** 피그마 FolderHead: 안쪽 여백 왼쪽 10px · 오른쪽 8px */
const Label = styled.span`
  ${({ theme }) => theme.text.caption01};
  padding: 0 0.5rem 0 0.625rem; /* 0 8px 0 10px */
  color: ${({ theme }) => theme.neutral[600]};
`;

/** 피그마 DocTree: 폴더 사이 8px */
const Folders = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
`;

/** 피그마 TopicRow: 높이 32px, 안쪽 여백 왼쪽 8px · 오른쪽 10px */
const FolderRow = styled.div`
  display: flex;
  align-items: center;
  height: 2rem; /* 32px */
  padding: 0 0.625rem 0 0.5rem; /* 0 10px 0 8px */
`;
