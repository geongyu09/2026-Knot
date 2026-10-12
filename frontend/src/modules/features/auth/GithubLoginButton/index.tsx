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

/**
 * GitHub 계정으로 로그인을 시작하는 버튼.
 *
 * 누르면 GitHub으로 넘어갈 때까지 처리 중으로 바뀌어 다시 누를 수 없어요.
 */
export default function GithubLoginButton() {
  const [isRedirecting, setIsRedirecting] = useState(false);

  // 뒤로 가기로 돌아오면 브라우저가 떠날 때의 화면을 그대로 되살려요. 처리 중이 남아 버튼을 누를 수 없게 되지 않도록 풀어요
  useEffect(() => {
    const handlePageShow = () => setIsRedirecting(false);

    window.addEventListener("pageshow", handlePageShow);

    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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
