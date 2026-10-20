import styled from "@emotion/styled";
import useNavigateToRecordingDocuments from "@hooks/domain/recording/useNavigateToRecordingDocuments";
import useServerRecording from "@hooks/domain/recording/useServerRecording";

import { useRecordingTitle } from "./model/useRecordingTitle";
import { useThisTabRecording } from "./model/useThisTabRecording";
import { useTitleId } from "./model/useTitleId";
import { useWorkspaceId } from "./model/useWorkspaceId";
import CurrentRecordingItem from "./ui/CurrentRecordingItem";
import EmptyRecording from "./ui/EmptyRecording";
import LoadingFallback from "./ui/LoadingFallback";
import RecordingLoadFailed from "./ui/RecordingLoadFailed";

/**
 * 홈의 「진행 중인 녹음」 카드. 내 최신 녹음의 녹음·문서 생성 진행 상태 하나만 보여 주고, 없으면 빈 상태 문구를 보여 줘요.
 *
 * 이 탭에서 시작한 녹음이 이어지고 있으면(녹음 탭) 이 탭의 상태와 시간을 보여 주고,
 * 「녹음 화면으로」로 녹음 화면에 갈 수 있게 해요.
 *
 * 그 밖에는 현재 `:workspaceId`의 조회 응답을 보여 주고, 녹음 중·일시정지면 버튼을 숨겨요.
 * 응답의 누적 시간에 응답을 받은 뒤 흐른 시간을 더해 녹음 중이면 매초 늘리고, 일시정지면 멈춰 둬요.
 * 문서 생성 중이면 「보기」로 문서 정리 화면에 갈 수 있어요. 완료되면 빈 상태로 바뀌어요.
 * 조회에 실패하면 칸 자리에 실패 안내(ERR-09)를 두고, `다시 시도`는 이 카드의 녹음만 다시 조회해요.
 * 이 탭의 녹음은 조회와 관계없이 알 수 있어 조회에 실패해도 그대로 보여 줘요.
 */
export default function RecordingListCard() {
  const titleId = useTitleId();
  const workspaceId = useWorkspaceId();
  const { navigateToRecordingDocuments } = useNavigateToRecordingDocuments();
  const { title, isLoading: isTitleLoading } = useRecordingTitle();
  const {
    status: thisTabStatus,
    elapsedTime: thisTabElapsedTime,
    handleOpenRecording,
  } = useThisTabRecording();
  const {
    recordingId,
    status: serverStatus,
    elapsedTime: serverElapsedTime,
    isLoading: isServerLoading,
    isLoadFailed: isServerLoadFailed,
    retry: retryServerRecording,
  } = useServerRecording();

  const handleOpenDocuments = () => {
    if (!workspaceId || recordingId === undefined) return;

    navigateToRecordingDocuments({ workspaceId, recordingId });
  };

  // 이 탭의 녹음은 현재 녹음 조회를 기다리지 않고 바로 보여 줘요. 녹음 이름은 어느 쪽이든 칸에 들어가 기다려요
  const isLoading =
    isTitleLoading || (thisTabStatus === "idle" && isServerLoading);

  return (
    <Container aria-labelledby={titleId} aria-busy={isLoading}>
      <Header>
        <Title id={titleId}>진행 중인 녹음</Title>
      </Header>

      {isLoading ? (
        <LoadingFallback />
      ) : thisTabStatus !== "idle" ? (
        <CurrentRecordingItem
          recordingStatus={thisTabStatus}
          title={title}
          elapsedTime={thisTabElapsedTime}
          onOpen={handleOpenRecording}
        />
      ) : isServerLoadFailed ? (
        <RecordingLoadFailed onRetry={retryServerRecording} />
      ) : serverStatus ? (
        <CurrentRecordingItem
          recordingStatus={serverStatus}
          title={title}
          onOpen={
            serverStatus === "processing" ? handleOpenDocuments : undefined
          }
          elapsedTime={serverElapsedTime}
        />
      ) : (
        <EmptyRecording />
      )}
    </Container>
  );
}

const Container = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem; /* 8px */
  width: 40.75rem; /* 652px */
  max-width: 100%;
  height: 13.375rem; /* 214px */
  overflow: hidden;
  padding: 1.25rem; /* 20px */
  border-radius: 1.5rem; /* 24px */
  background-color: ${({ theme }) => theme.neutral[0]};
  box-shadow: ${({ theme }) => theme.shadow02};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  padding: 0 0.25rem 0.5rem; /* 0 4px 8px */
`;

const Title = styled.h2`
  color: ${({ theme }) => theme.neutral[900]};
  ${({ theme }) => theme.text.label01};
`;
