import { useEffect } from "react";

import isTypingTarget from "../utils/isTypingTarget";

interface UseTypeToStartChatParams {
  /** 글자 키를 눌렀을 때 부를 함수. 키가 처리되기 전에 커서를 입력창으로 옮겨야 해요 */
  onTypeStart: () => void;
}

/**
 * 화면 아무 데서나 글자를 치면 독에서 이어 쓰게 합니다.
 *
 * 누른 글자를 직접 채우지 않고, 키가 처리되기 전에 커서만 입력창으로 옮겨 브라우저가 그 키를 입력창에 넣게 합니다.
 * 한글은 입력기가 자음과 모음을 조립하므로, 완성된 "ㅇ"을 먼저 채우면 이어 친 "ㅏ"와 합쳐지지 않아요.
 *
 * 아래는 가로채지 않습니다. 화면이 늘어나도 다른 조작을 잡아먹지 않게 하려는 것입니다.
 * - `Ctrl`·`Cmd`·`Alt`가 눌린 조합 (브라우저·앱 단축키)
 * - 글자가 아닌 키 (`Tab`·`Enter`·방향키처럼 이름이 두 글자 이상인 키)
 * - 이미 입력창·contenteditable에 적고 있을 때
 */
export const useTypeToStartChat = ({
  onTypeStart,
}: UseTypeToStartChatParams) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // 입력기가 조립을 시작했으면 키 이름이 "Process"로 와요
      if (e.key.length !== 1 && e.key !== "Process") return;

      onTypeStart();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onTypeStart]);
};
