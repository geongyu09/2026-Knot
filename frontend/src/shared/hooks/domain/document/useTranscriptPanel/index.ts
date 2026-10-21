import useMeQuery from "@api/queries/useMeQuery";
import { SCREEN_CONDITION } from "@constants/breakpoint";
import useMediaQuery from "@hooks/common/useMediaQuery";
import {
  readIsOpenLastTime,
  useTranscriptPanelStore,
} from "@store/transcriptPanelStore";

/**
 * 문서 보기 화면의 원문 패널이 열려 있는지와 여닫는 함수를 주는 도메인 훅.
 *
 * 열림 여부는 전역 저장소에 있어, GNB의 원문 버튼과 패널을 놓는 곳이 따로 불러도 같은 값을 봐요.
 *
 * 문서를 처음 보는 회원에게는 열어 두고, 그다음부터는 회원이 마지막에 둔 상태를 다음 문서에도 그대로 적용해요(DOC-R3).
 * 마지막 상태는 회원마다 브라우저에 남겨요. 서버에는 저장하지 않아 다른 브라우저에서는 이어지지 않아요.
 *
 * 회원 정보를 받기 전에는 누가 둔 상태인지 알 수 없어 닫힘으로 봐요.
 * 열림으로 보면, 닫아 둔 회원에게 패널이 잠깐 열렸다 닫히고 원문 요청도 한 번 나가요.
 *
 * 1024 미만에서는 원문이 본문을 덮으므로(RESP-R3) 버튼으로 열기 전에는 닫혀 있고,
 * 좁은 화면에서 여닫은 값은 데스크톱에서 쓸 다음번 상태로 남기지 않아요.
 */
const useTranscriptPanel = () => {
  const { data: me } = useMeQuery();
  const memberId = me?.memberId;
  const isOpenThisVisit = useTranscriptPanelStore(
    (state) => state.isOpenThisVisit,
  );
  const changeIsOpen = useTranscriptPanelStore((state) => state.changeIsOpen);
  const { isMatched: isBelowDesktop } = useMediaQuery(
    SCREEN_CONDITION.belowDesktop,
  );

  const isOpenLastTime =
    !isBelowDesktop && memberId !== undefined && readIsOpenLastTime(memberId);
  // 이번 방문에서 버튼으로 정한 값이 있으면 그 값을, 아직 누르지 않았으면 지난번에 둔 값을 따라요
  const isTranscriptPanelOpen = isOpenThisVisit ?? isOpenLastTime;

  const toggleTranscriptPanel = () => {
    changeIsOpen({
      memberId: isBelowDesktop ? undefined : memberId,
      isOpen: !isTranscriptPanelOpen,
    });
  };

  return { isTranscriptPanelOpen, toggleTranscriptPanel };
};

export default useTranscriptPanel;
