/** 입자가 모이는 모양. `cloud`는 구름 같은 구슬, `mic`는 마이크 아이콘, `arrow`는 오른쪽 화살표예요. */
export type ParticleOrbShape = "cloud" | "mic" | "arrow";

/** 색 톤. `idle`은 녹음 전의 붉은빛, `recording`은 녹음 중의 청록빛이에요. */
export type ParticleOrbTone = "idle" | "recording";

/** 밝은 면부터 그늘까지 다섯 단계와 뒤쪽 면 색. 순서대로 `rgba()` 문자열이에요. */
export type ParticleOrbPalette = [string, string, string, string, string, string];

/** 캔버스 밖에서 부를 수 있는 동작 */
export interface ParticleOrbHandle {
  /** 가운데에서 파동을 한 번 퍼뜨려요. 누를 때 써요 */
  pulse: () => void;
}
