import { useEffect } from "react";

interface UseKeepFieldFocusedParams {
  /** 커서를 입력창으로 옮기는 함수 */
  onFocus: () => void;
}

/**
 * 커서가 아무 데도 없으면 독의 입력창에 둡니다. 독이 접혀 있어도 보이지 않는 입력창에 둬요.
 *
 * 한글 입력기는 커서가 입력창에 있을 때만 조립을 시작해요.
 * 입력창 밖에서 친 첫 키는 이미 완성된 자모로 오므로, 그 순간 커서를 옮겨도 "안녕"이 "ㅇㅏ녕"으로 갈라져요.
 * 그래서 키를 누르기 전부터 커서를 입력창에 둡니다.
 *
 * 들어올 때 한 번, 빈 곳을 눌러 커서가 빠졌을 때(`document.body`) 다시 둬요.
 * 다른 입력창이나 버튼처럼 커서를 받는 곳에 있거나, 글을 드래그해 고른 뒤, 대화 상자가 열려 있을 때는 그대로 둬요.
 */
export const useKeepFieldFocused = ({ onFocus }: UseKeepFieldFocusedParams) => {
  useEffect(() => {
    const focusIfIdle = () => {
      if (document.activeElement !== document.body) return;
      if (!window.getSelection()?.isCollapsed) return;
      // 대화 상자는 커서를 가두지 않아, 옮기면 뒤에 가려진 독에 글자가 들어가요
      if (document.querySelector("[aria-modal='true']")) return;

      onFocus();
    };

    focusIfIdle();

    document.addEventListener("click", focusIfIdle);

    return () => document.removeEventListener("click", focusIfIdle);
  }, [onFocus]);
};
