import styled from "@emotion/styled";
import Skeleton from "@primitives/ui/Skeleton";

import { useLabelId } from "../model/useLabelId";

/** 폴더마다 그릴 문서 행의 수. 피그마 `Sidebar/Docs`의 「불러오는 중」처럼 폴더 네 개에 문서 행 두 개 · 한 개 · 한 개 · 없음을 둬요 */
const FOLDER_DOCUMENT_COUNTS = [2, 1, 1, 0];

/** 막대의 굵기(rem). 피그마에서 12px이에요 */
const BAR_HEIGHT = 0.75;

/**
 * 문서 목록을 불러오는 동안 보여 주는 문서 목록. 머리말은 그대로 두고, 폴더 이름과 문서 제목 자리를 회색 막대로 채워요.
 *
 * 행의 높이와 간격을 실제 목록과 같게 지켜, 불러온 뒤 내용이 움직이지 않게 해요.
 * 화살표 · 문서 수 · 세로선은 그리지 않아요.
 *
 * 틀과 머리말까지 여기서 그려요. 문서를 받은 모습(`DocumentTree`)과 따로 바뀔 수 있어, 틀을 함께 쓰지 않아요.
 */
export default function DocumentTreeSkeleton() {
  const { labelId } = useLabelId();

  return (
    <Container aria-labelledby={labelId}>
      <Label id={labelId}>문서</Label>
      <FolderList role="status" aria-label="문서 목록을 불러오고 있어요">
        {FOLDER_DOCUMENT_COUNTS.map((documentCount, folderIndex) => (
          <Folder key={folderIndex}>
            <Row>
              {/* 피그마의 폴더 이름 자리 96px */}
              <Skeleton width={6} height={BAR_HEIGHT} />
            </Row>
            {Array.from({ length: documentCount }, (_, documentIndex) => (
              <Row key={documentIndex}>
                {/* 피그마의 문서 제목 자리 160px */}
                <Skeleton width={10} height={BAR_HEIGHT} />
              </Row>
            ))}
          </Folder>
        ))}
      </FolderList>
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
const FolderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
`;

/** 피그마 Folder: 폴더 행과 문서 행 사이 2px */
const Folder = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem; /* 2px */
`;

/**
 * 피그마 TopicRow · Doc: 높이 32px.
 * 막대는 실제 글자가 시작하는 자리(행의 왼쪽에서 28px)에서 시작해요. 폴더 이름과 문서 제목이 모두 그 자리에서 시작해요
 */
const Row = styled.div`
  display: flex;
  align-items: center;
  height: 2rem; /* 32px */
  padding-left: 1.75rem; /* 28px */
`;
