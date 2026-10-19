import DockablePanel from "@composites/DockablePanel";
import styled from "@emotion/styled";
import TranscriptToggle from "@features/document/TranscriptToggle";
import SearchEvidenceToggle from "@features/search/SearchEvidenceToggle";
import useTranscriptPanel from "@hooks/domain/document/useTranscriptPanel";
import useRecordingLeaveWarning from "@hooks/domain/recording/useRecordingLeaveWarning";
import useAbortSearchAnswerOnLeave from "@hooks/domain/search/useAbortSearchAnswerOnLeave";
import useSearchAnswerAnalytics from "@hooks/domain/search/useSearchAnswerAnalytics";
import useWorkspaceAnalytics from "@hooks/domain/workspace/useWorkspaceAnalytics";
import useOpenEvidenceOnAnswerComplete from "@hooks/domain/search/useOpenEvidenceOnAnswerComplete";
import useWorkspaceEntry from "@hooks/domain/workspace/useWorkspaceEntry";
import useWorkspaceNav from "@hooks/domain/workspace/useWorkspaceNav";
import DockColumn, {
  DOCK_BOTTOM,
  DOCK_TOAST_GAP,
} from "@primitives/layout/DockColumn";
import LoadingIndicator from "@primitives/ui/LoadingIndicator";
import PageErrorNotice from "@primitives/ui/PageErrorNotice";
import { ToastViewport } from "@provider/context/toastContext";
import ChatListDrawer from "@widgets/chat/ChatListDrawer";
import TranscriptPanel from "@widgets/document/TranscriptPanel";
import SearchEvidenceList from "@widgets/search/SearchEvidenceList";
import WorkspaceDock from "@widgets/workspace/WorkspaceDock";
import WorkspaceGnb from "@widgets/workspace/WorkspaceGnb";
import WorkspaceSidebar from "@widgets/workspace/WorkspaceSidebar";
import { useState } from "react";
import { Outlet, useParams } from "react-router";

import ChatListIcon from "@/assets/icons/chatList.svg";
import SidebarIcon from "@/assets/icons/sidebar.svg";

import { WORKSPACE_DOCK_RAIL_ID } from "./constants/dockRail";
import type { DockedPanelName } from "./types/dockedPanel";

/**
 * GNB 레이아웃
 *
 * 워크스페이스 입장 후의 내부 페이지(홈, 탐색)가 공유한다.
 * 위에 GNB를 두고, 그 아래를 왼쪽 레일과 본문이 나눠 쓴다.
 *
 * GNB 좌측 버튼이 여는 패널(사이드바·대화 목록)은 스쳐 지나가면 본문 위에 겹쳐 뜨고,
 * 누르면 왼쪽 레일로 옮겨 가 폭을 차지한다. 레일은 한 번에 한 패널만 담는다.
 * 대화 목록 버튼은 탐색 화면에서만 둔다.
 *
 * 독과 탐색 대화 열은 둘 다 본문 영역 안의 `DockColumn`에 놓여, 패널을 고정하면 함께 밀린다(SEARCH-R11).
 *
 * 탐색 화면에서는 찾은 기록 패널이 본문 오른쪽 레일을 차지해, 열리면 본문 영역이 줄어 같은 규칙을 따른다.
 * 찾은 기록은 GNB 오른쪽 버튼과 답변 아래 버튼이 주소(`?messageId=`)로 여닫고, 근거가 있는 답변이 끝나면 저절로 열린다(SEARCH-R10).
 *
 * 문서 하나를 보는 화면에서는 원문 패널이 같은 오른쪽 자리를 쓴다. GNB 오른쪽의 원문 버튼으로 여닫고,
 * 회원이 마지막에 둔 상태를 다음 문서에도 그대로 적용한다(DOC-R3 · DOC-R4).
 *
 * 들어갈 수 있는 워크스페이스인지도 이 레이아웃 범위에서 한 번만 판정한다(`useWorkspaceEntry`).
 * 조회에 성공하기 전에는 본문 대신 스피너를 두고, 401은 로그인으로, 403·404는 선택 화면으로 보낸다.
 * 처음 조회가 네트워크 끊김·timeout이나 5xx로 실패하면 GNB와 독까지 레이아웃 전체 대신 ERR-02·ERR-03을 그린다.
 * 두 화면의 `다시 시도`는 페이지를 새로고침한다. 새로고침 경고는 녹음 중이면 그대로 뜬다.
 *
 * 녹음은 레이아웃 안의 어느 화면에서나 이어지므로, 녹음 중 새로고침·탭 닫기 경고도 이 범위에서 건다.
 *
 * 탐색 답변도 독에서 보내 대화 화면에 그리므로 이 범위에서 이어지고, 다른 대화로 옮기거나 레이아웃을 나가면 끊는다.
 *
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1364-6863 GNB/Floating
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=526-772 탐색 결과/채팅 세션 목록
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2106-28974 탐색/대화 목록 고정 + 찾은 기록 열림
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=2017-36104 문서/원문 열림
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1788-4838 에러/네트워크 오류
 * @see https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=1788-4849 에러/서버 오류 (500)
 */
export default function WorkspaceLayout() {
  const { workspaceId, documentId } = useParams();
  const { isReady, entryError } = useWorkspaceEntry({
    workspaceId: Number(workspaceId),
  });
  const { isChatActive } = useWorkspaceNav();
  const { isTranscriptPanelOpen } = useTranscriptPanel();
  const [pickedPanel, setPickedPanel] = useState<DockedPanelName>(null);

  useRecordingLeaveWarning();
  // 답변을 끊기 전의 상태로 떠남을 알아야 해서 useAbortSearchAnswerOnLeave보다 먼저 불러요
  useSearchAnswerAnalytics();
  useWorkspaceAnalytics();
  useAbortSearchAnswerOnLeave();
  useOpenEvidenceOnAnswerComplete();

  // 대화 목록 버튼은 탐색 화면에만 있으므로, 홈으로 나가면 고른 적 없던 것으로 봐요
  const dockedPanel =
    !isChatActive && pickedPanel === "chatList" ? null : pickedPanel;

  const pickPanel =
    (panel: Exclude<DockedPanelName, null>) => (isDocked: boolean) =>
      setPickedPanel(isDocked ? panel : null);

  // 원문 패널은 주소의 documentId로 원문을 불러오므로, documentId가 있는 화면(문서 하나를 보는 화면)에만 버튼과 자리를 둬요
  const isDocumentActive = documentId !== undefined;

  if (entryError) {
    return (
      <PageErrorNotice
        variant={entryError}
        onAction={() => window.location.reload()}
      />
    );
  }

  return (
    <Container>
      <GnbSlot>
        <WorkspaceGnb
          left={
            <>
              <DockablePanel
                label="사이드바"
                icon={<SidebarIcon size={18} />}
                dockTargetId={WORKSPACE_DOCK_RAIL_ID}
                isDocked={dockedPanel === "sidebar"}
                onDockedChange={pickPanel("sidebar")}
              >
                <WorkspaceSidebar />
              </DockablePanel>

              {isChatActive && (
                <DockablePanel
                  label="대화 목록"
                  icon={<ChatListIcon size={18} />}
                  dockTargetId={WORKSPACE_DOCK_RAIL_ID}
                  isDocked={dockedPanel === "chatList"}
                  onDockedChange={pickPanel("chatList")}
                >
                  <ChatListDrawer />
                </DockablePanel>
              )}
            </>
          }
          right={
            <>
              {isChatActive && <SearchEvidenceToggle />}
              {isDocumentActive && <TranscriptToggle />}
            </>
          }
        />
      </GnbSlot>

      <Body>
        <DockRail id={WORKSPACE_DOCK_RAIL_ID} />

        <Content>
          {/* 사용 기록의 스크롤 깊이는 창이 아니라 이 본문을 재요(ANALYTICS_SCROLL_ROOT_ATTRIBUTE) */}
          <Main data-analytics-scroll-root aria-busy={!isReady}>
            {isReady ? (
              <Outlet />
            ) : (
              <LoadingFallback label="워크스페이스를 불러오고 있어요" />
            )}
          </Main>

          <DockSlot>
            <ToastViewport placement="inline" />
            <DockWrapper>
              <WorkspaceDock />
            </DockWrapper>
          </DockSlot>
        </Content>

        {isChatActive && (
          <EvidenceRail>
            <SearchEvidenceList />
          </EvidenceRail>
        )}

        {isDocumentActive && (
          <TranscriptRail>
            {/* 본문처럼, 들어갈 수 있는 워크스페이스인지 알기 전에는 원문을 불러오지 않아요 */}
            {isReady && isTranscriptPanelOpen && <TranscriptPanel />}
          </TranscriptRail>
        )}
      </Body>
    </Container>
  );
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: ${({ theme }) => theme.neutral[50]};
`;

/** 레일·본문보다 위 칸이라, 패널을 고정해도 화면 전체 폭을 그대로 쓴다. */
const GnbSlot = styled.div`
  flex-shrink: 0;
  padding-top: 1.5rem; /* 24px */
`;

const Body = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

/**
 * 고정된 패널이 옮겨 오는 자리. 비어 있으면 폭이 0이다.
 *
 * 패널은 포털로 들어오므로 찼는지는 `:has`로 보고, 물러나는 중인 패널은 없는 것으로 봐 패널과 함께 좁혀진다.
 * 폭 전환은 패널 모션(`DockablePanel`)과 같은 시간·감속으로 맞춰 함께 밀리는 것처럼 보이게 한다.
 * 벌어질 때는 길고 부드럽게, 좁혀질 때는 짧게 움직인다.
 */
const DockRail = styled.div`
  display: flex;
  flex-shrink: 0;
  width: 0;
  padding: 1.25rem 0 8.5rem; /* 20px 0 136px */
  transition:
    width 0.24s cubic-bezier(0.4, 0, 0.2, 1),
    padding-left 0.24s cubic-bezier(0.4, 0, 0.2, 1);

  &:has(> :not([data-overlay-state="closing"])) {
    width: 20rem; /* 320px */
    padding-left: 2.5rem; /* 40px */
    transition:
      width 0.34s cubic-bezier(0.22, 1, 0.36, 1),
      padding-left 0.34s cubic-bezier(0.22, 1, 0.36, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/** 고정 패널을 뺀 남은 영역. 독과 대화 열이 이 폭을 기준으로 놓인다. */
const Content = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
`;

/**
 * 찾은 기록 패널이 놓이는 오른쪽 레일. GNB 아래 40px, 화면 오른쪽 40px에 붙어요.
 *
 * 펼친 답변에 근거가 없으면 패널이 그려지지 않아 비고, 비어 있으면 폭이 0이에요.
 * 찼는지는 왼쪽 레일(`DockRail`)처럼 `:has`로 보고, 같은 시간·감속으로 폭을 바꿔요.
 */
const EvidenceRail = styled.div`
  flex-shrink: 0;
  width: 0;
  padding-top: 2.5rem; /* 40px */
  /* 열리는 동안 패널이 레일 밖으로 넘치지 않게 자르되, 패널 그림자만큼은 남겨요 */
  overflow: clip;
  overflow-clip-margin: 2.5rem; /* 40px */
  transition:
    width 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    margin-right 0.28s cubic-bezier(0.22, 1, 0.36, 1);

  /* 레일 폭이 바뀌는 동안 패널이 함께 찌그러지지 않도록 열린 폭에 고정해요 */
  & > * {
    width: 25rem; /* 400px */
  }

  &:has(> *) {
    width: 25rem; /* 400px */
    margin-right: 2.5rem; /* 40px */
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/**
 * 원문 패널이 놓이는 오른쪽 레일. 찾은 기록 레일과 같은 자리(GNB 아래 40px, 화면 오른쪽 40px, 폭 400px)를 써요(DOC-R4).
 *
 * 원문이 길면 패널이 레일 높이까지만 커지고 패널 안의 발화 목록이 스크롤돼요.
 * 아래 여백은 왼쪽 레일(`DockRail`)과 같게 둬서, 패널이 가장 길 때 왼쪽 사이드바와 같은 높이에서 끝나요.
 */
const TranscriptRail = styled(EvidenceRail)`
  padding-bottom: 8.5rem; /* 136px */
`;

const Main = styled.main`
  flex: 1;
  min-height: 0;
  padding-top: 1.25rem; /* 20px */
  overflow-y: auto;
`;

/**
 * 독과 그 위 토스트가 놓이는 자리. 본문 위에 떠 있지만 독 바깥은 본문 클릭을 가리지 않는다.
 *
 * 토스트에는 누를 것이 없어서 토스트 자리도 클릭을 받지 않는다.
 */
const DockSlot = styled(DockColumn)`
  position: absolute;
  right: 0;
  bottom: ${DOCK_BOTTOM};
  left: 0;
  display: flex;
  flex-direction: column;
  gap: ${DOCK_TOAST_GAP};
  pointer-events: none;
`;

const DockWrapper = styled.div`
  display: flex;
  justify-content: center;

  & > * {
    pointer-events: auto;
  }
`;

/** 본문 자리를 그대로 채워 스피너가 화면 가운데에 놓이도록 해요. */
const LoadingFallback = styled(LoadingIndicator)`
  height: 100%;
  color: ${({ theme }) => theme.neutral[800]};
`;
