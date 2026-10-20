import { TOAST_MESSAGES } from "@constants/toastMessages";
import { useToast } from "@provider/context/toastContext";
import { useState } from "react";

interface CopyParams {
  text: string;
  onCopySuccess?: () => void;
}

/**
 * 글을 클립보드에 복사하는 함수를 주는 훅.
 *
 * 복사에 성공했을 때의 표시(`복사됨` 등)는 버튼마다 달라 `onCopySuccess`로 쓰는 쪽에 맡겨요.
 * 실패하면(클립보드 권한 거부, Clipboard API가 없는 브라우저) 모든 복사 버튼에서 같은 오류 토스트를 띄워요(ERR-08).
 * 버튼은 원래 모양으로 남아 다시 누를 수 있어요.
 */
const useClipboard = () => {
  const [isCopied, setIsCopied] = useState(false);
  const { show } = useToast();

  const copy = async ({ text, onCopySuccess }: CopyParams) => {
    if (!navigator.clipboard) {
      console.error("Clipboard API가 지원되지 않는 환경입니다.");
      show(TOAST_MESSAGES.COPY_FAILED);
      return;
    }

    try {
      setIsCopied(true);
      await navigator.clipboard.writeText(text);
      onCopySuccess?.();
    } catch (error) {
      console.error("텍스트 복사에 실패했습니다:", error);
      show(TOAST_MESSAGES.COPY_FAILED);
    } finally {
      setIsCopied(false);
    }
  };

  return { copy, isCopied };
};

export default useClipboard;
