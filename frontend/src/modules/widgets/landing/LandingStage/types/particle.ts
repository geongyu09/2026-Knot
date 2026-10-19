/**
 * 입자 하나가 모일 자리.
 *
 * `kind`는 그릴 때 어떤 색 묶음에 넣을지 정하는 번호예요. 같은 장면 안에서도 윤곽선·글줄·연결선처럼
 * 역할마다 색이 달라서 자리마다 따로 둡니다.
 */
export interface ParticleTarget {
  x: number;
  y: number;
  kind: number;
  /** 연결선을 따라 빛이 흐를 때 이 자리가 선 위의 어디쯤인지(0~1) */
  phase: number;
  /** 제자리에서 흔들리는 자리의 기준 위치 */
  baseX?: number;
  baseY?: number;
  /** 매 프레임 자리가 바뀌는 방식. 1은 녹음 파형, 2는 스크롤 안내의 휠 점, 3은 스크롤 안내의 마우스 윤곽, 9는 떠다니는 말 조각이에요. */
  motion?: 1 | 2 | 3 | 9;
  /** 파형의 몇 번째 막대인지 */
  column?: number;
  /** 파형 막대 안에서의 세로 위치(-1~1) */
  level?: number;
  centerY?: number;
  /** 파형 높이의 배율 */
  amplitudeScale?: number;
  /** 말 조각이 흔들리는 박자를 서로 엇갈리게 하는 번호 */
  group?: number;
  /** 스크롤 안내의 휠 점이 한 번에 굴러 내려가는 거리(px) */
  travel?: number;
}

/** 화면 위를 움직이는 입자 하나의 현재 상태 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  nextHomeX: number;
  nextHomeY: number;
  kind: number;
  nextKind: number;
  phase: number;
  nextPhase: number;
  target: ParticleTarget | null;
  nextTarget: ParticleTarget | null;
  /** 색의 진하기 묶음(0~2). 입자마다 정해 두어 같은 모양 안에서도 농담이 섞여요. */
  shade: number;
  size: number;
  delay: number;
  pendingMode: string;
  mode: string;
  targetIndex: number;
  isWaiting: boolean;
}

/** 입자 자리를 계산할 때 필요한 무대 크기 */
export interface StageSize {
  width: number;
  height: number;
  isMobile: boolean;
  count: number;
}

export interface StageRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 탐색 장면의 연결망에 붙는 문서 이름표 */
export interface GraphLabel {
  text: string;
  x: number;
  y: number;
  height: number;
  /** 답이 되는 질문 번호. 답과 상관없는 문서는 -1이에요. */
  questionIndex: number;
}

export interface Graph {
  nodes: { x: number; y: number; isQuestion?: boolean }[];
  edges: [number, number][];
  adjacency: Set<number>[];
  questionNode: number;
  answerNodes: number[];
  labeledNodes: Map<number, { text: string; questionIndex: number }>;
  labels: GraphLabel[];
}
