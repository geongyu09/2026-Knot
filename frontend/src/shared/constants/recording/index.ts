/**
 * 일시정지를 뺀 녹음 시간의 상한(2시간, STT-R15).
 *
 * 이 시간에 닿으면 서버가 녹음을 끝내요. 서버 응답의 `elapsedMillis`도 이 값을 넘지 않아요.
 */
export const MAX_RECORDING_DURATION_MS = 2 * 60 * 60 * 1000;
