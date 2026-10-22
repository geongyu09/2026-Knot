import type { ReleaseNote } from "@/shared/types/releaseNote";

/**
 * 새 소식 패널에 보여 줄 노트. 최신 노트를 배열 맨 위에 둬요(NEWS-R8).
 *
 * 기획자가 릴리즈 직전에 이 파일 맨 위에 그 버전의 노트를 더해 develop으로 PR을 올려요.
 * 알릴 변화가 없는 릴리즈는 노트를 더하지 않고 릴리즈 PR 본문에 「새 소식: 없음」을 적어요.
 * 쓰는 기준과 순서는 Notion 「릴리즈 노트」를 따라요.
 * https://app.notion.com/p/3feb435175228125a4bac00f35c39df5
 *
 * 문구는 Figma 패널 목록을 그대로 썼어요.
 * https://www.figma.com/design/jyDFCKX5AIztZessq4H7nQ/knot?node-id=4696-29495
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "v0.2.0",
    releasedAt: "2026-10-20",
    items: [
      {
        title: "탐색으로 돌아오면 하던 대화가 그대로 있어요",
        description:
          "홈에 다녀와도 위쪽 「탐색」을 누르면 마지막으로 보던 대화가 열려요. 받던 답변도 이어서 보여요.",
        link: "CHAT",
      },
      {
        title: "다른 화면으로 옮기면 맨 위부터 보여요",
        description:
          "앞 화면에서 내린 자리에서 시작하지 않아요. 뒤로 가기로 돌아오면 보던 자리에서 이어서 볼 수 있어요.",
      },
    ],
  },
  {
    id: "v0.1.0",
    releasedAt: "2026-10-19",
    items: [
      {
        title: "마이크 권한이 꺼져 있으면 켜는 방법을 알려 드려요",
        description:
          "권한을 거부한 뒤 「다시 시도」를 눌러도 같은 안내만 뜨던 문제를 고쳤어요. 이제 브라우저에서 마이크를 허용하는 방법을 알려 드려요.",
        isFromFeedback: true,
      },
      {
        title: "문서 정리에 실패해도 다시 시도할 수 있어요",
        description:
          "녹음을 글로 옮기다 실패하면 정리 화면의 「다시 시도」로 처음부터 다시 맡길 수 있어요.",
      },
    ],
  },
];
