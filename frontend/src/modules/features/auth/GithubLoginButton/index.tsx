import Button from "@primitives/ui/Button";
import { useEffect, useState } from "react";

import GithubIcon from "@/assets/icons/github.svg";

/**
 * GitHub OAuth 진입점.
 *
 * 백엔드가 이 주소를 받으면 GitHub 로그인 페이지로 다시 보내고,
 * 로그인이 끝나면 callback까지 처리한 뒤 쿠키를 심어 프론트로 돌려보내요.
 * `/login/oauth2/code/github`는 그 과정에서 백엔드가 쓰는 주소라 프론트가 부르지 않습니다.
 */
const GITHUB_OAUTH_URL = `${process.env.API_BASE_URL}/oauth2/authorization/github`;

/** 넘어가지 못하고 화면이 남았을 때, 처리 중을 푸는 데까지 기다리는 시간 */
const REDIRECT_TIMEOUT_MS = 10_000;

/**
 * GitHub 계정으로 로그인을 시작하는 버튼.
 *
 * 누르면 GitHub으로 넘어갈 때까지 처리 중으로 바뀌어 다시 누를 수 없어요.
 * 넘어가지 못하고 이 화면이 남으면 처리 중을 풀어 다시 누를 수 있게 해요.
 */
export default function GithubLoginButton() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  // 처리 중인데 이 화면이 남는 경우는 두 가지예요. 둘 다 처리 중을 풀지 않으면 새로고침하기 전까지 버튼을 누를 수 없어요
  useEffect(() => {
    if (!isRedirecting) return;

    const stopRedirecting = () => setIsRedirecting(false);

    // 뒤로 가기로 돌아오면 브라우저가 떠날 때의 화면을 그대로 되살리고 pageshow를 알려요
    window.addEventListener("pageshow", stopRedirecting);
    // 브라우저의 중지 버튼이나 Esc로 이동이 멈추면 브라우저가 알려 주지 않아, 시간이 지나면 풀어요
    const timerId = window.setTimeout(stopRedirecting, REDIRECT_TIMEOUT_MS);

    return () => {
      window.removeEventListener("pageshow", stopRedirecting);
      window.clearTimeout(timerId);
    };
  }, [isRedirecting]);

  const handleClick = () => {
    setIsRedirecting(true);
    window.location.href = GITHUB_OAUTH_URL;
  };

  return (
    <Button
      size="lg"
      isFullWidth
      isLoading={isRedirecting}
      onClick={handleClick}
    >
      <GithubIcon />
      GitHub으로 시작하기
    </Button>
  );
}
