import { roundedRectPoint } from "@utils/particleMotion";

/** 입자가 모일 자리 하나. `kind`는 글자, 윤곽처럼 색을 달리 그릴 묶음이에요 */
export interface BubbleTarget {
  x: number;
  y: number;
  kind: "text" | "outline";
}

interface SampleBubbleTargetsParams {
  text: string;
  fontSize: number;
  fontFamily: string;
  /** 글자 자리를 뽑는 간격(px). 1이면 랜딩처럼 픽셀마다, 2면 절반이에요 */
  step?: number;
}

/** 가운데에 몰린 -1~1 난수. 랜딩이 입자를 선 둘레에 퍼뜨릴 때 쓰는 것과 같아요 */
const gaussian = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

/**
 * 랜딩 문제 장면의 말풍선처럼, 글자와 둥근 윤곽선을 입자 자리로 뽑아요.
 *
 * 글자를 캔버스에 찍어 칠해진 픽셀을 자리로 삼고, 글자를 감싸는 알약 윤곽을 따라 입자를 흩뿌려요.
 * 크기와 밀도는 랜딩과 같아요(윤곽은 둘레 1px당 1.1개, 윤곽에서 ±1.1px 흔들림). 자리는 말풍선 가운데가 원점이에요.
 * 캔버스를 못 쓰는 환경(jsdom)에서는 빈 배열이고 `width`, `height`는 0이에요.
 */
export const sampleBubbleTargets = ({ text, fontSize, fontFamily, step = 1 }: SampleBubbleTargetsParams) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { targets: [] as BubbleTarget[], width: 0, height: 0 };

  const font = `600 ${fontSize}px ${fontFamily}`;
  context.font = font;
  const textWidth = context.measureText(text).width;
  const width = Math.ceil(textWidth + fontSize * 1.5);
  const height = Math.ceil(fontSize * 1.9);
  canvas.width = width;
  canvas.height = height;
  context.font = font;
  context.textBaseline = "middle";
  context.fillStyle = "#000";
  context.fillText(text, fontSize * 0.75, height / 2);

  const { data } = context.getImageData(0, 0, width, height);
  const targets: BubbleTarget[] = [];
  const stride = Math.max(1, Math.round(step));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (data[(y * width + x) * 4 + 3] <= 130) continue;
      targets.push({ x: x + Math.random() - width / 2, y: y + Math.random() - height / 2, kind: "text" });
    }
  }

  const radius = height / 2;
  const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const outlineCount = Math.round(perimeter * 1.1);
  for (let i = 0; i < outlineCount; i++) {
    const point = roundedRectPoint({ width, height, radius, distance: i / outlineCount });
    const offset = gaussian() * 1.1;
    targets.push({ x: point.x + point.nx * offset - width / 2, y: point.y + point.ny * offset - height / 2, kind: "outline" });
  }

  return { targets, width, height };
};

interface SamplePillTargetsParams {
  width: number;
  height: number;
  /** 가운데 점의 반지름(px) */
  dotRadius: number;
}

/**
 * 알약 윤곽과 가운데 점을 입자 자리로 뽑아요. 독의 녹음 자리를 뜻하는 모양이에요.
 * 밀도는 말풍선 윤곽과 같고, 점은 가운데가 빽빽한 구름처럼 채워요. 가운데가 원점이에요.
 */
export const samplePillTargets = ({ width, height, dotRadius }: SamplePillTargetsParams) => {
  const targets: BubbleTarget[] = [];
  const radius = Math.min(width, height) / 2;
  const perimeter = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const outlineCount = Math.round(perimeter * 1.1);
  for (let i = 0; i < outlineCount; i++) {
    const point = roundedRectPoint({ width, height, radius, distance: i / outlineCount });
    const offset = gaussian() * 1.1;
    targets.push({ x: point.x + point.nx * offset - width / 2, y: point.y + point.ny * offset - height / 2, kind: "outline" });
  }
  const dotCount = Math.round(dotRadius * dotRadius * 2.2);
  for (let i = 0; i < dotCount; i++) {
    const r = dotRadius * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    targets.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r, kind: "text" });
  }
  return { targets, width, height };
};
