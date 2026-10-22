import {
  DOCK_HINT_MAX_SEEN_COUNT,
  DOCK_HINT_SEEN_COUNT_KEY,
  DOCK_HINT_VISIT_KEY,
  DOCK_HOVER_GUIDE_COUNT_KEY,
} from "../constants/dockHint";

/** 이번 방문에서 첫 사용 안내를 띄우기로 했는지. 아직 정하지 않았으면 `null` */
export type VisitDecision = "shown" | "hidden" | null;

/**
 * 독 안내를 몇 번 보여줬는지 브라우저에 남기고 읽어요.
 *
 * 방문 단위 판단은 탭을 닫으면 지워지는 `sessionStorage`에, 방문 횟수는 `localStorage`에 둬요.
 * 저장소를 못 쓰면 읽기는 「이미 다 본 것」으로 답해 안내가 매번 뜨지 않게 하고, 쓰기는 조용히 넘어가요.
 */
export const readVisitDecision = (): VisitDecision => {
  try {
    const decision = sessionStorage.getItem(DOCK_HINT_VISIT_KEY);

    return decision === "shown" || decision === "hidden" ? decision : null;
  } catch {
    return null;
  }
};

export const writeVisitDecision = (decision: Exclude<VisitDecision, null>) => {
  try {
    sessionStorage.setItem(DOCK_HINT_VISIT_KEY, decision);
  } catch {
    // 남길 수 없으면 이번 방문만 판단하고 넘어가요
  }
};

export const readSeenCount = () => {
  try {
    return Number(localStorage.getItem(DOCK_HINT_SEEN_COUNT_KEY)) || 0;
  } catch {
    return DOCK_HINT_MAX_SEEN_COUNT;
  }
};

export const writeSeenCount = (count: number) => {
  try {
    localStorage.setItem(DOCK_HINT_SEEN_COUNT_KEY, String(count));
  } catch {
    // 남길 수 없으면 이번 방문만 보여주고 넘어가요
  }
};

/** 안내를 띄우는 방문(처음 세 번) 안인지. 횟수는 첫 사용 안내를 실제로 띄운 방문마다 하나씩 올라요 */
export const isWithinGuideVisits = () => readSeenCount() <= DOCK_HINT_MAX_SEEN_COUNT;

type HoverGuideCounts = Partial<Record<string, number>>;

const readHoverGuideCounts = (): HoverGuideCounts => {
  try {
    return JSON.parse(sessionStorage.getItem(DOCK_HOVER_GUIDE_COUNT_KEY) ?? "{}") as HoverGuideCounts;
  } catch {
    return {};
  }
};

/** 이번 방문에서 그 버튼 안내를 몇 번 띄웠는지 */
export const readHoverGuideCount = (kind: string) => readHoverGuideCounts()[kind] ?? 0;

export const bumpHoverGuideCount = (kind: string) => {
  try {
    const counts = readHoverGuideCounts();
    counts[kind] = (counts[kind] ?? 0) + 1;
    sessionStorage.setItem(DOCK_HOVER_GUIDE_COUNT_KEY, JSON.stringify(counts));
  } catch {
    // 남길 수 없으면 이번에만 보여주고 넘어가요
  }
};
