interface ShapeTarget {
  /** 모양 가운데를 원점으로 한 위치(px) */
  x: number;
  y: number;
}

interface SampleShapeTargetsParams {
  /** 24×24 좌표계에 모양을 그려요. 선과 면의 색은 이미 검정이에요 */
  draw: (context: CanvasRenderingContext2D) => void;
  /** 그릴 모양의 한 변(px) */
  size: number;
  /** 자리를 뽑는 간격(px). 작을수록 촘촘해요 */
  step?: number;
}

/** 선명하게 뽑으려고 실제보다 크게 그린 뒤 줄여요 */
const OVERSAMPLE = 3;

/**
 * 모양을 캔버스에 그려 입자가 모일 자리를 뽑아요.
 *
 * 랜딩이 글자 자리를 뽑는 방식과 같아요. 아이콘처럼 24×24로 정의된 모양을 `size`로 키워 그린 뒤
 * 칠해진 픽셀의 위치를 돌려줘요. 캔버스를 못 쓰는 환경(jsdom)에서는 빈 배열이에요.
 */
export const sampleShapeTargets = ({ draw, size, step = 1 }: SampleShapeTargetsParams): ShapeTarget[] => {
  const canvas = document.createElement("canvas");
  const side = Math.ceil(size * OVERSAMPLE);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  if (!context) return [];

  context.scale((size * OVERSAMPLE) / 24, (size * OVERSAMPLE) / 24);
  context.strokeStyle = "#000";
  context.fillStyle = "#000";
  context.lineCap = "round";
  context.lineJoin = "round";
  draw(context);

  const { data } = context.getImageData(0, 0, side, side);
  const stride = Math.max(1, Math.round(step * OVERSAMPLE));
  const targets: ShapeTarget[] = [];
  for (let y = 0; y < side; y += stride) {
    for (let x = 0; x < side; x += stride) {
      if (data[(y * side + x) * 4 + 3] <= 160) continue;
      targets.push({ x: x / OVERSAMPLE - size / 2, y: y / OVERSAMPLE - size / 2 });
    }
  }
  return targets;
};
