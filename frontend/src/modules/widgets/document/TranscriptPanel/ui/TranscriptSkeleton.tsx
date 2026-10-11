import styled from "@emotion/styled";
import Divider from "@primitives/ui/Divider";
import Skeleton from "@primitives/ui/Skeleton";

import { useTitleId } from "../model/useTitleId";

/** 덩어리의 굵기(rem). 피그마 Panel/Transcript(상태=불러오는 중)의 덩어리는 모두 12px이에요 */
const SKELETON_HEIGHT = 0.75;

/**
 * 발화 줄마다 그릴 문장 줄의 폭. 한 줄짜리와 두 줄짜리 발화를 섞어 다섯 줄을 둬요.
 *
 * 피그마의 폭(문장 칸 293px 가운데 205 · 131 · 261 · 242px)을 비율로 옮겼어요.
 */
const LINE_TEXT_WIDTHS = [
  ["100%", "70%"],
  ["100%"],
  ["100%", "45%"],
  ["100%", "89%"],
  ["83%"],
];

/**
 * 원문을 불러오는 동안 보여 주는 원문 패널. 제목은 그대로 두고, 날짜 · 녹음 길이 자리와 발화 줄 자리를 회색 덩어리로 채워요.
 *
 * 줄 사이 간격과 줄 안쪽 여백을 실제 발화 줄과 같게 지켜, 불러온 뒤 내용이 크게 움직이지 않게 해요.
 *
 * 패널의 틀과 제목까지 여기서 그려요. 원문을 받은 화면(`TranscriptPanel`)과 따로 바뀌는 일이 많아, 틀을 함께 쓰지 않아요.
 */
export default function TranscriptSkeleton() {
  const { titleId } = useTitleId();

  return (
    <Container aria-labelledby={titleId}>
      <Title id={titleId}>원문</Title>
      <Body role="status" aria-label="원문을 불러오고 있어요">
        <Meta>
          <Skeleton width={6.25} height={SKELETON_HEIGHT} />
          <Skeleton width={2.75} height={SKELETON_HEIGHT} />
        </Meta>
        <Divider />
        <LineList>
          {LINE_TEXT_WIDTHS.map((textWidths, lineIndex) => (
            <Line key={lineIndex}>
              <TimeSlot>
                {/* 피그마의 시각 자리 폭(33px). 실제 시각의 기본 폭(`02:40`, 32px)보다 1px 넓어요 */}
                <Skeleton width={2.0625} height={SKELETON_HEIGHT} />
              </TimeSlot>
              <TextBlock>
                {textWidths.map((width, textIndex) => (
                  <TextSlot key={textIndex}>
                    <Skeleton width={width} height={SKELETON_HEIGHT} />
                  </TextSlot>
                ))}
              </TextBlock>
            </Line>
          ))}
        </LineList>
      </Body>
    </Container>
  );
}

/** 피그마 Panel/Transcript: 안쪽 여백 24px, 묶음 사이 16px, 모서리 20px, Shadow03 */
const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 1rem; /* 16px */
  max-height: 100%;
  padding: 1.5rem; /* 24px */
  overflow: hidden;
  border-radius: 1.25rem; /* 20px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow03};
`;

const Title = styled.h2`
  ${({ theme }) => theme.text.label01};
  color: ${({ theme }) => theme.neutral[900]};
`;

/** 제목 아래의 날짜 줄 · 구분선 · 발화 줄 묶음. 실제 패널처럼 사이를 16px씩 띄워요 */
const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem; /* 16px */
`;

/** 피그마 Meta: 날짜(100px)와 녹음 길이(44px) 자리. 실제 날짜 줄과 같은 높이 20px, 사이 8px */
const Meta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem; /* 8px */
  height: 1.25rem; /* 20px */
`;

/** 발화 줄 사이 10px */
const LineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem; /* 10px */
`;

/** 실제 발화 줄과 같은 여백(6px 8px)과 시각 · 문장 사이 10px */
const Line = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.625rem; /* 10px */
  padding: 0.375rem 0.5rem; /* 6px 8px */
`;

/** 피그마 Time: 문장 한 줄과 같은 높이의 칸. 시각 덩어리가 문장 첫 줄 덩어리와 나란히 놓여요 */
const TimeSlot = styled.div`
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 1.5rem; /* 24px */
`;

const TextBlock = styled.div`
  display: flex;
  flex: 1 0 0;
  flex-direction: column;
`;

/** 문장 한 줄(body01 16px × 줄 높이 1.5)과 같은 높이 */
const TextSlot = styled.div`
  display: flex;
  align-items: center;
  height: 1.5rem; /* 24px */
`;
