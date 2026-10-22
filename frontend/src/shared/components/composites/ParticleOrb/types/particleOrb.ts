/**
 * 입자가 모이는 모양. `disc`는 테두리 고리 안에 붉은 원이 든 녹음 버튼, `cloud`는 구름 같은 구슬, `mic`는 마이크 아이콘,
 * `arrow`는 오른쪽 화살표, `wave`는 소리 크기의 흐름을 보여 주는 입자 구름 파형(조용하면 가는 선),
 * `bubble`은 점 세 개가 든 말풍선, `typing`은 그 점들이 입력 중처럼 튀는 말풍선이에요.
 */
export type ParticleOrbShape = "disc" | "cloud" | "mic" | "arrow" | "wave" | "bubble" | "typing";

/** 색 톤. `idle`은 녹음 전의 붉은빛, `neutral`은 어두운 바탕 위의 밝은 회색이에요. */
export type ParticleOrbTone = "idle" | "neutral";

/** 밝은 면부터 그늘까지 다섯 단계와 뒤쪽 면 색. 순서대로 `rgba()` 문자열이에요. */
export type ParticleOrbPalette = [string, string, string, string, string, string];

/** 캔버스 밖에서 부를 수 있는 동작 */
export interface ParticleOrbHandle {
  /** 가운데에서 파동을 한 번 퍼뜨려요. 누를 때 써요 */
  pulse: () => void;
  /** 입자를 바깥으로 살짝 흩뜨려요. 녹음 버튼에 올려 원이 입자로 분해됐다가 다음 모양으로 모일 때 써요 */
  scatter: () => void;
}
