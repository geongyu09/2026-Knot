import type { PATH_ROUTE } from "@routes/PATH_ROUTE";
import type { PathParam } from "react-router";

type RouteKey = keyof typeof PATH_ROUTE;

/** 지금 보고 있는 워크스페이스 ID만 채우면 갈 수 있는 화면 */
export type WorkspaceRouteKey = {
  [K in RouteKey]: [PathParam<(typeof PATH_ROUTE)[K]>] extends ["workspaceId"]
    ? [PathParam<(typeof PATH_ROUTE)[K]>] extends [never]
      ? never
      : K
    : never;
}[RouteKey];

/** 새 소식 노트의 항목 하나. 사용자가 알아챌 만한 변화 하나를 적어요 */
export interface ReleaseNoteItem {
  /** 무엇을 할 수 있게 됐는지 한 줄. 해요체로 써요 */
  title: string;
  /** 짧은 설명 */
  description: string;
  /** 변화를 보여 주는 이미지 주소 */
  image?: string;
  /** 「바로 가보기」로 옮길 화면. 지금 보고 있는 워크스페이스의 화면으로 가요 */
  link?: WorkspaceRouteKey;
  /** 사용자가 알려 준 문제를 고친 항목이면 true. 「피드백 덕분에 바뀌었어요」 칩을 붙여요 */
  isFromFeedback?: boolean;
  /** 큰 변화면 true. 노트마다 하나까지만 둬요 */
  isHighlight?: boolean;
}

/** 릴리즈 하나에 내는 새 소식 노트 */
export interface ReleaseNote {
  /** 릴리즈 버전. 예: `v0.3.0` */
  id: string;
  /** 배포 날짜. 예: `2026-10-21` */
  releasedAt: string;
  items: ReleaseNoteItem[];
}
