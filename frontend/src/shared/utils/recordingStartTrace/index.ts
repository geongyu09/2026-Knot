/**
 * 녹음 버튼을 누른 뒤 어디서 시간이 가는지 개발 서버에서만 남겨요.
 *
 * 누름 → 마이크 권한 → 오디오 준비 → 조각 수집기 → 서버 시작 → 화면 이동 → 녹음 화면 그리기까지를 `performance.mark`로 찍고,
 * 그 사이 메인 스레드를 50ms 넘게 막은 작업도 함께 모아요. 녹음 화면이 그려지면 한 줄로 콘솔에 보여 주고
 * 개발 서버의 `/__dev/recording-trace`로도 보내 파일에 남겨요. 배포 빌드에서는 아무것도 하지 않아요.
 */
const isEnabled = process.env.NODE_ENV === "development" && typeof performance !== "undefined";

const PREFIX = "knot:recording-start:";

export type RecordingStartStep =
  | "click"
  | "mic-granted"
  | "audio-ready"
  | "pcm-ready"
  | "mic-connected"
  | "server-started"
  | "navigated"
  | "screen-painted";

const STEP_LABEL: Record<Exclude<RecordingStartStep, "click">, string> = {
  "mic-granted": "마이크 권한",
  "audio-ready": "오디오 준비",
  "pcm-ready": "조각 수집기",
  "mic-connected": "마이크 연결 끝",
  "server-started": "서버 시작",
  navigated: "화면 이동",
  "screen-painted": "녹음 화면 그려짐",
};

let longTasks: Array<[number, number]> = [];
let observer: PerformanceObserver | null = null;

const watchLongTasks = () => {
  longTasks = [];
  if (observer || typeof PerformanceObserver === "undefined") return;
  try {
    observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration >= 50) longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
      });
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    observer = null;
  }
};

export const markRecordingStart = (step: RecordingStartStep) => {
  if (!isEnabled) return;
  performance.mark(`${PREFIX}${step}`);
  if (step === "click") {
    watchLongTasks();
    return;
  }
  if (step !== "screen-painted") return;

  const at = (name: string) => {
    const entries = performance.getEntriesByName(`${PREFIX}${name}`, "mark");
    return entries.length ? entries[entries.length - 1].startTime : undefined;
  };
  const click = at("click");
  if (click === undefined) return;
  const parts = (Object.keys(STEP_LABEL) as Array<keyof typeof STEP_LABEL>).map((name) => {
    const t = at(name);
    return `${STEP_LABEL[name]} ${t === undefined ? "-" : `${Math.round(t - click)}ms`}`;
  });
  const blocks = longTasks.filter(([start]) => start >= click - 20).map(([start, duration]) => `${Math.round(start - click)}ms에 ${duration}ms`);
  const line = `[녹음 시작] ${parts.join(" → ")} | 메인 스레드 막힘: ${blocks.length ? blocks.join(", ") : "없음"}`;
  console.info(line);
  try {
    navigator.sendBeacon("/__dev/recording-trace", JSON.stringify({ at: new Date().toISOString(), line, userAgent: navigator.userAgent }));
  } catch {
    // 개발 서버가 아니면 콘솔에만 남겨요
  }
  performance.clearMarks();
  observer?.disconnect();
  observer = null;
};
