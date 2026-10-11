import useDocumentQuery from "@api/queries/useDocumentQuery";
import useDocumentTranscriptQuery from "@api/queries/useDocumentTranscriptQuery";
import styled from "@emotion/styled";
import Chip from "@primitives/ui/Chip";
import Divider from "@primitives/ui/Divider";
import { formatDate } from "@utils/formatDate";
import { formatDurationFromSeconds } from "@utils/formatDurationFromSeconds";
import { useId } from "react";
import { useParams } from "react-router";

import TranscriptLine from "./ui/TranscriptLine";

/**
 * 원문 패널. 주소의 문서를 만든 원본 전사를 말한 시각 · 말한 사람 · 문장으로 한 줄씩 보여줘요.
 *
 * 문서 보기 화면의 오른쪽에 놓여요. 패널을 여닫는 버튼은 GNB에 있어서, 패널 안에는 닫기 버튼을 두지 않아요(DOC-R3).
 * 발화가 많으면 패널 전체가 아니라 발화 목록만 세로로 스크롤해요(DOC-R4).
 *
 * 주소의 두 id는 숫자인지 확인하지 않고 그대로 요청해요. 잘못된 주소인지는 서버가 판단해요.
 *
 * 만든 날짜는 원문 응답에 없어 문서 상세에서 가져와요. 문서 보기와 같은 쿼리 키라 캐시를 함께 써요.
 * 문서 상세를 받지 못했으면 날짜 없이 원문을 보여줘요.
 */
export default function TranscriptPanel() {
  const titleId = useId();
  const params = useParams();
  const workspaceId = Number(params.workspaceId);
  const documentId = Number(params.documentId);
  const { data: transcript } = useDocumentTranscriptQuery({
    workspaceId,
    documentId,
  });
  const { data: documentDetail } = useDocumentQuery({
    workspaceId,
    documentId,
  });

  if (transcript === undefined) return null;

  return (
    <Container aria-labelledby={titleId}>
      <Title id={titleId}>원문</Title>
      <Meta>
        {documentDetail !== undefined && (
          <CreatedDate dateTime={documentDetail.createdAt}>
            {formatDate(documentDetail.createdAt)}
          </CreatedDate>
        )}
        <Chip>
          {formatDurationFromSeconds(transcript.recordingDurationSeconds)}
        </Chip>
      </Meta>
      <Divider />
      <Lines>
        {transcript.segments.map(
          ({ startMillis, speakerNumber, text }, index) => (
            <TranscriptLine
              // 구간에는 id가 없고 같은 시각에 시작하는 구간이 있을 수 있어, 서버가 준 순서를 함께 써요
              key={`${startMillis}-${index}`}
              startMillis={startMillis}
              speakerNumber={speakerNumber}
              text={text}
            />
          ),
        )}
      </Lines>
      <FooterNotice>
        이 문서를 만든 원본이에요. 전사 전체를 그대로 볼 수 있어요
      </FooterNotice>
    </Container>
  );
}

/**
 * 피그마 Panel/Transcript: 안쪽 여백 24px, 묶음 사이 16px, 모서리 20px, Shadow03.
 * 폭(400px)과 높이의 한계는 패널을 놓는 자리가 정하고, 여기서는 그 자리를 넘지 않게만 해요
 */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem; /* 16px */
  max-height: 100%;
  padding: 1.5rem; /* 24px */
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.label01};
  color: ${({ theme }) => theme.neutral[900]};
`;

/** 피그마 Meta: 날짜와 녹음 길이 칩 사이 8px */
const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
`;

const CreatedDate = styled.time`
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[500]};
`;

/** 피그마 Transcript: 발화 줄 사이 10px. 패널이 자리보다 길어지면 이 목록만 스크롤해요 */
const Lines = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.625rem; /* 10px */
  min-height: 0;
  overflow-y: auto;
`;

const FooterNotice = styled.p`
  ${({ theme }) => theme.text.caption01};
  color: ${({ theme }) => theme.neutral[500]};
`;
