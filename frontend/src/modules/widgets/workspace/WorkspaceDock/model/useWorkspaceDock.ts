import { TOAST_MESSAGES } from "@constants/toastMessages";
import useOutsideClick from "@hooks/common/useOutsideClick";
import useConversationId from "@hooks/domain/search/useConversationId";
import useSearchAnswerControl from "@hooks/domain/search/useSearchAnswerControl";
import useSearchAnswerStatus from "@hooks/domain/search/useSearchAnswerStatus";
import useWorkspaceNav from "@hooks/domain/workspace/useWorkspaceNav";
import { useToast } from "@provider/context/toastContext";
import { captureAnalyticsEvent } from "@utils/captureAnalyticsEvent";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SubmitEvent,
} from "react";
import { useParams } from "react-router";

import { useKeepFieldFocused } from "./useKeepFieldFocused";
import { useTypeToStartChat } from "./useTypeToStartChat";

/**
 * 하단 독의 열림 상태와 질문 입력을 다룹니다.
 *
 * 접혀 있을 때는 동그란 버튼 하나뿐이고, 누르면 입력창이 펼쳐지면서 커서가 바로 입력창에 놓여요.
 * 화면 아무 데서나 글자를 쳐도 같은 자리로 이어져요(`useTypeToStartChat`).
 * 한글 첫 글자가 갈라지지 않게, 커서가 아무 데도 없으면 접혀 있어도 입력창에 둬요(`useKeepFieldFocused`).
 * 접힌 독에서 글자가 들어오면 같은 입력창 그대로 펼쳐요.
 * 독 바깥을 누르면 다시 접힙니다. 적던 글은 지우지 않고 들고 있다가 다시 열 때 그대로 돌려줘요.
 * 탐색 화면은 채팅이 곧 화면 자체라 독을 늘 펼쳐 둡니다. 그래서 그 화면에서는 접히지 않고 입력만 비워져요.
 *
 * 질문은 홈·탐색 어디서든 이 자리에서 바로 보냅니다. 탐색 대화 화면이면 그 대화에 이어 묻고, 아니면 새 대화를 시작해요.
 * 새 대화는 서버가 접수하면 그 대화 주소로 옮겨 가요(`useSearchAnswerControl`).
 * 보내면 입력창을 바로 비우고, 접수 전에 거절되면 보낸 질문을 되돌려 다시 보낼 수 있게 하고 오류 토스트로 알려요(SEARCH-R4).
 * 답변을 기다리거나 받는 중에는 보내지 않아요(SEARCH-R6).
 *
 * 접힌 독이 펼쳐지면 버튼으로 열었는지, 글자를 쳐서 열었는지를 사용 기록(`dock_chat_opened`)으로 남겨요.
 */
export const useWorkspaceDock = () => {
  const { workspaceId } = useParams();
  const { conversationId } = useConversationId();
  const { isChatActive } = useWorkspaceNav();
  const { sendQuestion } = useSearchAnswerControl();
  const { isAnswerPending } = useSearchAnswerStatus();
  const { show } = useToast();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpandedByUser, setIsExpandedByUser] = useState(false);
  const [message, setMessage] = useState("");
  /** 커서를 입력창으로 옮겨 달라고 요청한 횟수. 값이 바뀔 때마다 한 번씩 옮겨요 */
  const [focusRequestCount, setFocusRequestCount] = useState(0);

  const isExpanded = isChatActive || isExpandedByUser;
  const canSubmit = message.trim().length > 0 && !isAnswerPending;

  useEffect(() => {
    if (focusRequestCount === 0) return;

    focusAtEnd(textareaRef.current);
  }, [focusRequestCount]);

  const requestFocus = () => setFocusRequestCount((prev) => prev + 1);

  const collapse = () => setIsExpandedByUser(false);

  // 늘 펼쳐 두는 탐색 화면에서는 접을 것이 없어 바깥 클릭을 보지 않아요
  const { ref: formRef } = useOutsideClick<HTMLFormElement>({
    isEnabled: isExpandedByUser,
    onOutsideClick: collapse,
  });

  const handleExpand = () => {
    if (!isExpanded) {
      captureAnalyticsEvent({ event: "dock_chat_opened", properties: { trigger: "button" } });
    }
    setIsExpandedByUser(true);
    requestFocus();
  };

  const handleReset = () => {
    collapse();
    setMessage("");
  };

  const focusField = useCallback(() => focusAtEnd(textareaRef.current), []);

  // 누른 키가 처리되기 전에 커서가 입력창에 있어야 그 키가 입력창에 들어가요. 펼치는 건 글자가 들어온 뒤예요
  useTypeToStartChat({ onTypeStart: focusField });

  useKeepFieldFocused({ onFocus: focusField });

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    // 접힌 독에 글자가 들어왔다면 화면 아무 데서나 쳐서 연 거예요
    if (!isExpanded) {
      captureAnalyticsEvent({ event: "dock_chat_opened", properties: { trigger: "typing" } });
    }
    setMessage(e.target.value);
    setIsExpandedByUser(true);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 접힌 독에는 남겨 둔 글이 보이지 않으므로, 보내거나 지우지 않아요
    if (!isExpanded) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }

    if (e.key === "Escape") {
      handleReset();
      return;
    }

    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.nativeEvent.isComposing) return; // 글자 조립 중일 때 폼 제출 막기

    e.preventDefault(); // "Enter" 입력 시 textarea 기본 동작(줄바꿈) 막기
    e.currentTarget.form?.requestSubmit();
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || !workspaceId) return;

    const question = message.trim();

    setMessage("");
    // 버튼을 눌러 보냈다면 커서가 버튼에 가 있으므로 이어서 적을 수 있게 되돌려 놔요
    requestFocus();

    const { isAcceptFailed } = await sendQuestion({
      workspaceId: Number(workspaceId),
      conversationId,
      content: question,
    });

    if (!isAcceptFailed) return;

    setMessage(question);
    show(TOAST_MESSAGES.QUESTION_SEND_FAILED);
  };

  return {
    formRef,
    textareaRef,
    isExpanded,
    /** 화면(탐색) 때문에 펼쳐 둔 것인지. 사용자가 접은 게 아니라 화면이 바뀌어 접히면 접힘 모션이 없어요 */
    isExpandedByScreen: isChatActive,
    message,
    canSubmit,
    handleExpand,
    handleChange,
    handleKeyDown,
    handleSubmit,
  };
};

/** 커서를 입력창 맨 끝에 둬요. 값을 코드로 채우면 커서가 맨 앞에 남아, 이어 친 글자가 적던 글 앞에 끼어들어요 */
const focusAtEnd = (field: HTMLTextAreaElement | null) => {
  if (!field) return;

  // 화면 아래에 놓인 독으로 화면이 튀지 않게 해요
  field.focus({ preventScroll: true });
  field.setSelectionRange(field.value.length, field.value.length);
};
