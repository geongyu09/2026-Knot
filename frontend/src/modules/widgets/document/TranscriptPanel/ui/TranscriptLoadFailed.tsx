import styled from "@emotion/styled";
import InlineError from "@primitives/ui/InlineError";
import { useId } from "react";

interface TranscriptLoadFailedProps {
  /** `다시 시도`를 눌렀을 때 실행할 동작 */
  onRetry: () => void;
}

/**
 * 원문을 불러오지 못했을 때 보여 주는 원문 패널. 제목은 그대로 두고, 그 아래에 안내와 `다시 시도`를 둬요.
 *
 * 문서가 없거나 원문이 없는 경우(404)에도 같은 안내를 써요.
 *
 * 패널의 틀과 제목까지 여기서 그려요. 원문을 받은 화면(`TranscriptPanel`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function TranscriptLoadFailed({
  onRetry,
}: TranscriptLoadFailedProps) {
  const titleId = useId();

  return (
    <Container aria-labelledby={titleId}>
      <Title id={titleId}>원문</Title>
      <InlineError
        message="원문을 불러오지 못했어요. 다시 시도해 주세요."
        onRetry={onRetry}
      />
    </Container>
  );
}

/** 피그마 Panel/Transcript: 안쪽 여백 24px, 묶음 사이 16px, 모서리 20px, Shadow03 */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem; /* 16px */
  padding: 1.5rem; /* 24px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.label01};
  color: ${({ theme }) => theme.neutral[900]};
`;
