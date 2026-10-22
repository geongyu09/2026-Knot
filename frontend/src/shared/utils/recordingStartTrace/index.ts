/**
 * 녹음 버튼을 누른 뒤 어디서 시간이 가는지 개발 서버에서만 콘솔에 남겨요.
 *
 * 누름 → 마이크 연결 → 서버 시작 요청 → 녹음 화면 그리기까지의 구간을 `performance.mark`로 찍고,
 * 녹음 화면이 그려지면 한 줄로 모아 보여 줘요. 배포 빌드에서는 아무것도 하지 않아요.
 */
const isEnabled = process.env.NODE_ENV === "development" && typeof performance !== "undefined";

const PREFIX = "knot:recording-start:";

export const markRecordingStart = (step: "click" | "mic-connected" | "server-started" | "navigated" | "screen-painted") => {
  if (!isEnabled) return;
  performance.mark(`${PREFIX}${step}`);
  if (step !== "screen-painted") return;

  const at = (name: string) => {
    const entries = performance.getEntriesByName(`${PREFIX}${name}`, "mark");
    return entries.length ? entries[entries.length - 1].startTime : undefined;
  };
  const click = at("click");
  if (click === undefined) return;
  const ms = (name: string) => { const t = at(name); return t === undefined ? "-" : `${Math.round(t - click)}ms`; };
  console.info(
    `[녹음 시작] 마이크 연결 ${ms("mic-connected")} → 서버 시작 ${ms("server-started")} → 화면 이동 ${ms("navigated")} → 녹음 화면 그려짐 ${ms("screen-painted")}`,
  );
  performance.clearMarks();
};
