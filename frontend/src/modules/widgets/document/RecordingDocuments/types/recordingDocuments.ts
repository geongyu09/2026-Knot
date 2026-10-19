/**
 * 정리 화면이 그릴 상태.
 *
 * 녹음 조회 응답으로 정한 문서 정리 상태(`getRecordingDocumentsStatus`)와 다른 값이에요.
 * 조회 결과와 오류까지 해석한 값이라, 정리 상태에는 없는 `loading` · `loadFailed`가 있어요.
 * `completed` · `recording` · `audioSaveFailed`는 이 화면에 머물 이유가 없어 다른 화면으로 보내는 상태예요.
 * `audioSaveFailed`는 PCM 조각 녹음의 서버 저장이 끝내 실패하거나 폐기되어 정리할 음성이 없는 상태예요.
 */
export type RecordingDocumentsViewStatus =
  | "loading"
  | "loadFailed"
  | "organizing"
  | "noContent"
  | "failed"
  | "completed"
  | "recording"
  | "audioSaveFailed";
