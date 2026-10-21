import { TOAST_MESSAGES } from "@constants/toastMessages";
import { useToast } from "@provider/context/toastContext";
import { consumeAuthSessionExpired } from "@utils/authSession";
import { useEffect } from "react";

/**
 * 로그인 화면에 도착했을 때, 로그인했던 이 탭의 토큰 재발급이 거절돼 온 것이면 로그인 만료 토스트를 띄우는 도메인 훅(ERR-07).
 *
 * 로그인 화면으로 보내는 곳은 여러 가드와 화면이라, 보내는 쪽마다 토스트를 싣지 않고 도착한 로그인 화면에서 한 번 확인해요.
 * 만료인지는 `httpClient`가 남긴 기록(`authSession`)으로 알아요. 처음 온 비로그인 사용자에게는 기록이 없어 띄우지 않아요.
 * 기록은 읽을 때 지워서, 다시 들어오거나 새로고침해도 또 띄우지 않아요.
 */
const useSessionExpiredToast = () => {
  const { show } = useToast();

  useEffect(() => {
    if (consumeAuthSessionExpired()) show(TOAST_MESSAGES.SESSION_EXPIRED);
  }, [show]);
};

export default useSessionExpiredToast;
