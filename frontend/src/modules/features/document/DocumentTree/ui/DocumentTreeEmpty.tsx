import styled from "@emotion/styled";

import { useLabelId } from "../model/useLabelId";

/**
 * 문서가 하나도 없을 때 보여 주는 문서 목록. 머리말은 그대로 두고, 폴더 자리에 안내를 둬요.
 *
 * 틀과 머리말까지 여기서 그려요. 문서를 받은 모습(`DocumentTree`)과 따로 바뀔 수 있어, 틀을 함께 쓰지 않아요.
 */
export default function DocumentTreeEmpty() {
  const { labelId } = useLabelId();

  return (
    <Container aria-labelledby={labelId}>
      <Label id={labelId}>문서</Label>
      <Notice>아직 문서가 없어요</Notice>
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

/** 시안이 없어 머리말과 왼쪽을 맞춰요(왼쪽 10px) */
const Notice = styled.p`
  ${({ theme }) => theme.text.caption02};
  padding: 0 0.5rem 0 0.625rem; /* 0 8px 0 10px */
  color: ${({ theme }) => theme.neutral[600]};
`;
