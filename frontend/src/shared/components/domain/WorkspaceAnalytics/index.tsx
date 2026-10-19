import useSearchAnswerAnalytics from "@hooks/domain/search/useSearchAnswerAnalytics";
import type { ReactNode } from "react";

interface WorkspaceAnalyticsProps {
  children: ReactNode;
}

/**
 * 워크스페이스 화면에서 일어난 일을 사용 기록으로 보내는 컴포넌트.
 *
 * 감싼 화면을 그대로 그리고, 놓여 있는 동안 탐색 답변의 결과 · 떠남 · 돌아옴을 보내요.
 * 화면 코드와 섞이지 않도록 워크스페이스 레이아웃을 바깥에서 감싸요. 레이아웃이 그리는 것과 동작은 바꾸지 않아요.
 */
export default function WorkspaceAnalytics({
  children,
}: WorkspaceAnalyticsProps) {
  useSearchAnswerAnalytics();

  return children;
}
