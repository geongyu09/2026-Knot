import {
  ANSWER_DOCUMENT_TITLES,
  CANVAS_FONT_FAMILY,
  MOBILE_OTHER_DOCUMENT_TITLES,
  OTHER_DOCUMENT_TITLES,
  SCATTERED_SPEECHES,
  SYMBOL_BOUNDS,
  SYMBOL_PATH,
  WORDMARK_PATH,
  WORDMARK_SIZE,
} from "../constants/landing";
import type { Graph, GraphLabel, ParticleTarget, StageRect, StageSize } from "../types/particle";

import {
  bezierPoint,
  fitTargets,
  gaussian,
  rectInStage,
  roundedRectPoint,
  seededRandom,
  shuffle,
} from "./particleMath";

/** 녹음 파형과 탐색 연결망이 놓이는 영역. 데스크톱은 오른쪽, 모바일은 위쪽이에요. */
const visualRegion = ({ width, height, isMobile }: StageSize) =>
  isMobile
    ? { x0: width * 0.08, x1: width * 0.92, y0: height * 0.1, y1: height * 0.36 }
    : { x0: width * 0.47, x1: width * 0.9, y0: height * 0.12, y1: height * 0.62 };

/** 파형의 막대 수. 프레임마다 막대 높이를 새로 계산하므로 엔진과 같은 값을 써요. */
export const WAVE_COLUMNS = 96;

const createCanvas = ({ width, height }: StageSize) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  return canvas.getContext("2d", { willReadFrequently: true });
};

interface SamplePathParams {
  size: StageSize;
  path: string;
  /** 경로 좌표를 무대 좌표로 옮기는 변환 */
  transform: [scale: number, offsetX: number, offsetY: number];
  /** 픽셀을 훑을 범위 */
  bounds: { x0: number; x1: number; y0: number; y1: number };
  kind: number;
}

/** 경로를 화면 밖 캔버스에 칠한 뒤, 칠해진 픽셀마다 자리를 하나씩 뽑아요. */
const samplePath = ({ size, path, transform, bounds, kind }: SamplePathParams) => {
  const context = createCanvas(size);
  const targets: ParticleTarget[] = [];
  if (!context || typeof Path2D === "undefined") return targets;

  const [scale, offsetX, offsetY] = transform;
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  context.fill(new Path2D(path));

  const canvasWidth = context.canvas.width;
  const data = context.getImageData(0, 0, canvasWidth, context.canvas.height).data;
  const step = scale > 2.6 || (kind === 50 && scale > 1.25) ? 2 : 1;
  const x0 = Math.max(0, Math.floor(bounds.x0));
  const x1 = Math.min(canvasWidth, Math.ceil(bounds.x1));
  const y0 = Math.max(0, Math.floor(bounds.y0));
  const y1 = Math.min(context.canvas.height, Math.ceil(bounds.y1));

  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      if (data[(y * canvasWidth + x) * 4 + 3] <= 120) continue;
      const px = x + Math.random() * step;
      const py = y + Math.random() * step;
      targets.push({ x: px, y: py, baseX: px, baseY: py, kind, phase: 0 });
    }
  }
  return targets;
};

/** 소개 장면: knot 워드마크 */
export const buildWordmarkTargets = (size: StageSize) => {
  const { width, height, isMobile } = size;
  const scale = isMobile
    ? Math.min((width * 0.64) / WORDMARK_SIZE.width, (height * 0.15) / WORDMARK_SIZE.height)
    : Math.min((width * 0.38) / WORDMARK_SIZE.width, (height * 0.25) / WORDMARK_SIZE.height);
  const cx = width / 2;
  const cy = height * (isMobile ? 0.2 : 0.27);
  const halfWidth = (WORDMARK_SIZE.width / 2) * scale;
  const halfHeight = (WORDMARK_SIZE.height / 2) * scale;

  const targets = samplePath({
    size,
    path: WORDMARK_PATH,
    transform: [scale, cx - halfWidth, cy - halfHeight],
    bounds: { x0: cx - halfWidth - scale, x1: cx + halfWidth + scale, y0: cy - halfHeight - scale, y1: cy + halfHeight + scale },
    kind: 60,
  });
  targets.forEach((target) => {
    delete target.baseX;
    delete target.baseY;
  });
  return fitTargets({ targets: shuffle(targets), size });
};

/** 시작 장면: 파형이 문서의 줄로 이어지는 새 심볼 */
export const buildSymbolTargets = (size: StageSize) => {
  const { width, height, isMobile } = size;
  const geometry = isMobile
    ? { cx: width / 2, cy: height * 0.2, scale: (width * 0.46) / SYMBOL_BOUNDS.width }
    : {
        cx: width / 2,
        cy: height * 0.28,
        scale: Math.min((width * 0.25) / SYMBOL_BOUNDS.width, (height * 0.23) / SYMBOL_BOUNDS.height),
      };
  const left = geometry.cx - (SYMBOL_BOUNDS.width / 2) * geometry.scale;
  const top = geometry.cy - (SYMBOL_BOUNDS.height / 2) * geometry.scale;

  const targets = samplePath({
    size,
    path: SYMBOL_PATH,
    transform: [geometry.scale, left - SYMBOL_BOUNDS.x * geometry.scale, top - SYMBOL_BOUNDS.y * geometry.scale],
    bounds: {
      x0: left,
      x1: left + SYMBOL_BOUNDS.width * geometry.scale,
      y0: top,
      y1: top + SYMBOL_BOUNDS.height * geometry.scale,
    },
    kind: 50,
  });
  return fitTargets({ targets: shuffle(targets), size });
};

/** 녹음 장면: 소리에 맞춰 높이가 바뀌는 파형. 실제 높이는 엔진이 매 프레임 정해요. */
export const buildWaveTargets = (size: StageSize) => {
  const { width, height, isMobile, count } = size;
  const region = visualRegion(size);
  const x0 = region.x0;
  const x1 = isMobile ? region.x1 : width * 0.93;
  const centerY = isMobile ? height * 0.24 : height * 0.44;
  const columnWidth = (x1 - x0) / WAVE_COLUMNS;

  const targets: ParticleTarget[] = [];
  for (let i = 0; i < count; i++) {
    const column = i % WAVE_COLUMNS;
    const level = Math.random() * 2 - 1;
    targets.push({
      x: x0 + (column + 0.5) * columnWidth + (Math.random() - 0.5) * columnWidth * 0.42,
      y: centerY + level * height * 0.05,
      kind: 7,
      phase: 0,
      motion: 1,
      column,
      level,
      centerY,
      amplitudeScale: 1,
    });
  }
  return targets;
};

/** 문제 장면: 말풍선에 담겨 떠다니는 말 조각 */
export const buildSpeechTargets = (size: StageSize) => {
  const { width, height, isMobile } = size;
  const region = isMobile
    ? { x: width * 0.06, y: height * 0.1, w: width * 0.88, h: height * 0.28 }
    : { x: width * 0.47, y: height * 0.17, w: width * 0.4, h: height * 0.62 };
  const fontSize = isMobile ? 15 : 26;
  const context = createCanvas(size);
  if (!context) return fitTargets({ targets: [], size });

  context.font = `600 ${fontSize}px ${CANVAS_FONT_FAMILY}`;
  context.textBaseline = "middle";

  const bubbles = SCATTERED_SPEECHES.map(([text, fx, fy], index) => {
    const textWidth = context.measureText(text).width;
    const x = Math.min(region.x + fx * region.w, width - (isMobile ? 14 : 130) - textWidth - fontSize);
    const y = region.y + fy * region.h;
    context.fillText(text, x, y);
    return {
      rect: { x: x - fontSize * 0.75, y: y - fontSize * 0.95, w: textWidth + fontSize * 1.5, h: fontSize * 1.9 },
      index,
    };
  });

  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;
  const data = context.getImageData(0, 0, canvasWidth, canvasHeight).data;
  const targets: ParticleTarget[] = [];

  bubbles.forEach(({ rect, index }) => {
    for (let y = Math.floor(rect.y); y < rect.y + rect.h; y++) {
      for (let x = Math.floor(rect.x); x < rect.x + rect.w; x++) {
        if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) continue;
        if (data[(y * canvasWidth + x) * 4 + 3] <= 130) continue;
        const px = x + Math.random();
        const py = y + Math.random();
        targets.push({ x: px, y: py, baseX: px, baseY: py, kind: 0, phase: 0, motion: 9, group: index });
      }
    }

    const radius = rect.h / 2;
    const perimeter = 2 * (rect.w + rect.h - 4 * radius) + 2 * Math.PI * radius;
    const outlineCount = Math.round(perimeter * 1.1);
    for (let j = 0; j < outlineCount; j++) {
      const point = roundedRectPoint({ rect, radius, distance: (j / outlineCount) * perimeter });
      const offset = gaussian() * 1.1;
      const px = point.x + point.nx * offset;
      const py = point.y + point.ny * offset;
      targets.push({ x: px, y: py, baseX: px, baseY: py, kind: 4, phase: 0, motion: 9, group: index });
    }
  });

  return fitTargets({ targets: shuffle(targets), size });
};

type SandItem =
  | { kind: "outline"; rect: StageRect; radius: number; perimeter: number; weight: number }
  | { kind: "line"; rect: StageRect; scale: number; weight: number }
  | { kind: "thread"; points: { x: number; y: number }[]; index: number; weight: number };

/**
 * `data-sand`를 붙인 요소의 윤곽(`o`)과 글줄(`l`)을 따라 자리를 뽑아요.
 * 입자가 실제 화면 요소의 모양으로 모였다가, 정리가 끝나면 그 자리에 진짜 글자가 나타나요.
 */
const collectSandItems = (stage: HTMLElement, box: HTMLElement) => {
  const items: SandItem[] = [];
  box.querySelectorAll<HTMLElement>("[data-sand]").forEach((element) => {
    const rect = rectInStage(stage, element);
    if (rect.w < 2) return;
    const scale = rect.w / (element.offsetWidth || rect.w);
    if (element.dataset.sand === "o") {
      const cssRadius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const radius = Math.min(cssRadius * scale, rect.w / 2, rect.h / 2);
      const perimeter = 2 * (rect.w + rect.h - 4 * radius) + 2 * Math.PI * radius;
      items.push({ kind: "outline", rect, radius, perimeter, weight: perimeter * 1.1 });
    } else {
      items.push({ kind: "line", rect, scale, weight: rect.w * 1.8 });
    }
  });
  return items;
};

/** 문서 카드 세 장을 잇는 실. 문서끼리 이어져 있다는 것을 보여 줘요. */
const collectThreads = (stage: HTMLElement, box: HTMLElement, scale: number) => {
  const cards = Array.from(box.querySelectorAll("[data-card]")).map((card) => rectInStage(stage, card));
  if (cards.length !== 3) return [];

  const [a, b, c] = cards;
  const bend = 80 * scale;
  const curves = [
    [
      { x: a.x + a.w, y: a.y + a.h * 0.4 },
      { x: a.x + a.w + bend, y: a.y + a.h * 0.4 },
      { x: b.x - bend, y: b.y + b.h * 0.28 },
      { x: b.x, y: b.y + b.h * 0.28 },
    ],
    [
      { x: b.x + b.w * 0.35, y: b.y + b.h },
      { x: b.x + b.w * 0.35, y: b.y + b.h + bend },
      { x: c.x + c.w + bend, y: c.y + c.h * 0.45 },
      { x: c.x + c.w, y: c.y + c.h * 0.45 },
    ],
    [
      { x: a.x + a.w * 0.26, y: a.y + a.h },
      { x: a.x + a.w * 0.26, y: a.y + a.h + bend },
      { x: c.x + c.w * 0.2, y: c.y - bend },
      { x: c.x + c.w * 0.2, y: c.y },
    ],
  ];

  return curves.map((points, index): SandItem => {
    let length = 0;
    let previous = points[0];
    for (let i = 1; i <= 20; i++) {
      const point = bezierPoint(points, i / 20);
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return { kind: "thread", points, index, weight: length * 1.4 };
  });
};

const distributeSand = (items: SandItem[], size: StageSize) => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const targets: ParticleTarget[] = [];

  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const count = isLast ? Math.max(0, size.count - targets.length) : Math.round((size.count * item.weight) / total);

    for (let i = 0; i < count; i++) {
      if (item.kind === "outline") {
        const point = roundedRectPoint({ rect: item.rect, radius: item.radius, distance: (i / count) * item.perimeter });
        const offset = gaussian() * 1.1;
        targets.push({ x: point.x + point.nx * offset, y: point.y + point.ny * offset, kind: 4, phase: 0 });
      } else if (item.kind === "line") {
        const thickness = 4.5 * item.scale;
        targets.push({
          x: item.rect.x + Math.random() * item.rect.w,
          y: item.rect.y + item.rect.h / 2 - thickness / 2 + Math.random() * thickness,
          kind: 3,
          phase: 0,
        });
      } else {
        const s = Math.random();
        const point = bezierPoint(item.points, s);
        targets.push({
          x: point.x + gaussian() * 0.9,
          y: point.y + gaussian() * 0.9,
          kind: 10,
          phase: (s * 0.6 + item.index * 0.31) % 1,
        });
      }
    }
  });

  if (targets.length > size.count) targets.length = size.count;
  return fitTargets({ targets, size });
};

interface ElementTargetsParams {
  stage: HTMLElement;
  box: HTMLElement;
  size: StageSize;
}

/** 정리 장면: 주제별 문서 카드 세 장과 그 사이를 잇는 실 */
export const buildDocumentTargets = ({ stage, box, size }: ElementTargetsParams) => {
  const scale = size.isMobile ? 0.5 : 1;
  return distributeSand([...collectSandItems(stage, box), ...collectThreads(stage, box, scale)], size);
};

/** 확인 장면: 확인했어요 버튼이 있는 문서 카드 */
export const buildCardTargets = ({ stage, box, size }: ElementTargetsParams) =>
  distributeSand(collectSandItems(stage, box), size);

interface BuildGraphParams {
  stage: HTMLElement;
  input: HTMLElement;
  size: StageSize;
}

/**
 * 탐색 장면의 문서 연결망을 만들어요.
 *
 * 문서 점을 겹치지 않게 흩고, 가까운 점끼리 이어 모든 점이 닿는 연결망을 만든 뒤
 * 질문 입력창 위에 질문 점을 하나 더 둡니다. 이름표는 실·점·다른 이름표와 덜 겹치는 쪽에 붙여요.
 */
export const buildGraph = ({ stage, input, size }: BuildGraphParams): Graph => {
  const { width, isMobile } = size;
  let seed = 7;
  const random = () => {
    seed += 1;
    return seededRandom(seed * 1.37);
  };
  const region = visualRegion(size);
  const nodes: Graph["nodes"] = [];
  const minDistance = Math.min(size.width, size.height) * (isMobile ? 0.1 : 0.08);
  const nodeCount = isMobile ? 14 : 22;

  for (let tries = 0; nodes.length < nodeCount && tries < 4000; tries++) {
    const x = region.x0 + random() * (region.x1 - region.x0);
    const y = region.y0 + random() * (region.y1 - region.y0);
    if (nodes.every((node) => Math.hypot(node.x - x, node.y - y) > minDistance)) nodes.push({ x, y });
  }

  const inputRect = rectInStage(stage, input);
  const questionNode = nodes.length;
  nodes.push({ x: inputRect.x + inputRect.w / 2, y: inputRect.y - 16, isQuestion: true });

  const distance = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  const adjacency = nodes.map(() => new Set<number>());
  const edges: [number, number][] = [];
  const connect = (a: number, b: number) => {
    if (a === b || adjacency[a].has(b)) return;
    adjacency[a].add(b);
    adjacency[b].add(a);
    edges.push([a, b]);
  };

  const connected = [0];
  const rest = new Set<number>();
  for (let i = 1; i < questionNode; i++) rest.add(i);
  while (rest.size) {
    let best: [number, number] = [0, 0];
    let bestDistance = Infinity;
    connected.forEach((a) =>
      rest.forEach((b) => {
        const d = distance(a, b);
        if (d < bestDistance) {
          bestDistance = d;
          best = [a, b];
        }
      }),
    );
    connect(best[0], best[1]);
    connected.push(best[1]);
    rest.delete(best[1]);
  }

  for (let i = 0; i < questionNode; i++) {
    const neighbors: [number, number][] = [];
    for (let j = 0; j < questionNode; j++) if (j !== i) neighbors.push([distance(i, j), j]);
    neighbors.sort((p, q) => p[0] - q[0]);
    if (neighbors.length > 1 && random() < 0.55) connect(i, neighbors[1][1]);
  }

  const nearestToQuestion: [number, number][] = [];
  for (let j = 0; j < questionNode; j++) nearestToQuestion.push([distance(questionNode, j), j]);
  nearestToQuestion.sort((p, q) => p[0] - q[0]);
  connect(questionNode, nearestToQuestion[0][1]);
  if (nearestToQuestion.length > 1) connect(questionNode, nearestToQuestion[1][1]);

  const upperNodes = nodes
    .slice(0, questionNode)
    .map((node, i) => ({ i, x: node.x, y: node.y }))
    .sort((p, q) => p.y - q.y)
    .slice(0, 7)
    .sort((p, q) => p.x - q.x);
  const answerNodes = [
    upperNodes[0].i,
    upperNodes[upperNodes.length - 1].i,
    upperNodes[Math.floor(upperNodes.length / 2)].i,
  ];

  const labeledNodes = new Map<number, { text: string; questionIndex: number }>();
  answerNodes.forEach((node, questionIndex) =>
    labeledNodes.set(node, { text: ANSWER_DOCUMENT_TITLES[questionIndex], questionIndex }),
  );
  const others = isMobile ? MOBILE_OTHER_DOCUMENT_TITLES : OTHER_DOCUMENT_TITLES;
  for (let i = 1, other = 0; i < questionNode && other < others.length; i += 4) {
    if (labeledNodes.has(i)) continue;
    labeledNodes.set(i, { text: others[other], questionIndex: -1 });
    other++;
  }

  const threadSamples: { x: number; y: number }[] = [];
  edges.forEach(([a, b], edgeIndex) => {
    const { cx, cy, length } = edgeCurve({ nodes, a, b, edgeIndex });
    const steps = Math.max(6, Math.round(length / 10));
    for (let j = 1; j < steps; j++) {
      const t = j / steps;
      const u = 1 - t;
      threadSamples.push({
        x: u * u * nodes[a].x + 2 * u * t * cx + t * t * nodes[b].x,
        y: u * u * nodes[a].y + 2 * u * t * cy + t * t * nodes[b].y,
      });
    }
  });

  const measure = document.createElement("canvas").getContext("2d");
  const placed: StageRect[] = [];
  const labels: GraphLabel[] = [];
  const xMax = width - (isMobile ? 8 : 120);
  const yMin = isMobile ? 70 : 84;
  const yMax = inputRect.y - 8;
  const hit = (rect: StageRect, x: number, y: number, pad: number) =>
    x > rect.x - pad && x < rect.x + rect.w + pad && y > rect.y - pad && y < rect.y + rect.h + pad;
  const overlaps = (a: StageRect, b: StageRect) =>
    a.x < b.x + b.w + 6 && a.x + a.w + 6 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
  const order = Array.from(labeledNodes.keys()).sort(
    (i, j) => (labeledNodes.get(j)?.questionIndex ?? 0) - (labeledNodes.get(i)?.questionIndex ?? 0),
  );

  order.forEach((i) => {
    const label = labeledNodes.get(i);
    if (!label) return;
    const node = nodes[i];
    const labelHeight = 16;
    if (measure) measure.font = `${label.questionIndex >= 0 ? 600 : 400} 12px ${CANVAS_FONT_FAMILY}`;
    const labelWidth = Math.ceil(measure ? measure.measureText(label.text).width : label.text.length * 12) + 2;
    const candidates = [
      { x: node.x + 12, y: node.y - labelHeight / 2 },
      { x: node.x - 12 - labelWidth, y: node.y - labelHeight / 2 },
      { x: node.x - labelWidth / 2, y: node.y - 12 - labelHeight },
      { x: node.x - labelWidth / 2, y: node.y + 12 },
      { x: node.x + 9, y: node.y - 8 - labelHeight },
      { x: node.x + 9, y: node.y + 8 },
      { x: node.x - 9 - labelWidth, y: node.y - 8 - labelHeight },
      { x: node.x - 9 - labelWidth, y: node.y + 8 },
    ];

    let best = { ...candidates[0], w: labelWidth, h: labelHeight };
    let bestScore = Infinity;
    candidates.forEach((candidate, candidateIndex) => {
      const rect = { ...candidate, w: labelWidth, h: labelHeight };
      let score = candidateIndex * 0.4;
      if (rect.x < 8 || rect.x + rect.w > xMax || rect.y < yMin || rect.y + rect.h > yMax) score += 100;
      threadSamples.forEach((sample) => {
        if (hit(rect, sample.x, sample.y, 2)) score += 3;
      });
      nodes.forEach((other, otherIndex) => {
        if (otherIndex !== i && hit(rect, other.x, other.y, 7)) score += 12;
      });
      placed.forEach((other) => {
        if (overlaps(rect, other)) score += 40;
      });
      if (score < bestScore) {
        bestScore = score;
        best = rect;
      }
    });

    placed.push(best);
    labels.push({
      text: label.text,
      x: Math.round(best.x),
      y: Math.round(best.y),
      height: labelHeight,
      questionIndex: label.questionIndex,
    });
  });

  return { nodes, edges, adjacency, questionNode, answerNodes, labeledNodes, labels };
};

interface EdgeCurveParams {
  nodes: Graph["nodes"];
  a: number;
  b: number;
  edgeIndex: number;
}

/** 두 점을 잇는 실이 살짝 휘도록 2차 곡선의 조절점을 정해요. */
const edgeCurve = ({ nodes, a, b, edgeIndex }: EdgeCurveParams) => {
  const from = nodes[a];
  const to = nodes[b];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = (seededRandom(edgeIndex * 3.3 + 1) - 0.5) * 0.3 * length;
  return {
    cx: (from.x + to.x) / 2 - (dy / length) * bend,
    cy: (from.y + to.y) / 2 + (dx / length) * bend,
    length,
  };
};

interface BuildGraphTargetsParams {
  graph: Graph;
  questionIndex: number;
  size: StageSize;
}

/**
 * 탐색 장면: 질문 점에서 답이 되는 문서까지 가는 길을 찾아, 그 길 위의 입자에 순서를 매겨요.
 * 답을 찾는 동안 빛이 이 순서대로 질문에서 문서 쪽으로 번집니다.
 */
export const buildGraphTargets = ({ graph, questionIndex, size }: BuildGraphTargetsParams) => {
  const { nodes, edges, adjacency, questionNode, answerNodes, labeledNodes } = graph;
  const answerNode = answerNodes[questionIndex];

  const previous = new Array<number>(nodes.length).fill(-1);
  const isVisited = new Array<boolean>(nodes.length).fill(false);
  const queue = [questionNode];
  isVisited[questionNode] = true;
  while (queue.length) {
    const current = queue.shift() as number;
    if (current === answerNode) break;
    adjacency[current].forEach((next) => {
      if (isVisited[next]) return;
      isVisited[next] = true;
      previous[next] = current;
      queue.push(next);
    });
  }

  const chain: number[] = [];
  for (let current = answerNode; current !== -1; current = previous[current]) chain.unshift(current);

  const pathEdges = new Map<string, { from: number; start: number; length: number }>();
  let pathLength = 0;
  for (let i = 1; i < chain.length; i++) {
    const a = chain[i - 1];
    const b = chain[i];
    const length = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y);
    const info = { from: a, start: pathLength, length };
    pathEdges.set(`${a}-${b}`, info);
    pathEdges.set(`${b}-${a}`, info);
    pathLength += length;
  }

  let seed = 101;
  const random = () => {
    seed += 1;
    return seededRandom(seed * 0.731);
  };
  const spread = () => (random() + random() + random() - 1.5) / 1.5;
  const totalLength = edges.reduce(
    (sum, [a, b]) => sum + Math.hypot(nodes[b].x - nodes[a].x, nodes[b].y - nodes[a].y),
    0,
  );

  const targets: ParticleTarget[] = [];
  edges.forEach(([a, b], edgeIndex) => {
    const { cx, cy, length } = edgeCurve({ nodes, a, b, edgeIndex });
    const info = pathEdges.get(`${a}-${b}`);
    const count = Math.max(8, Math.round((size.count * 0.7 * length) / totalLength));
    for (let j = 0; j < count; j++) {
      const s = random();
      const u = 1 - s;
      const x = u * u * nodes[a].x + 2 * u * s * cx + s * s * nodes[b].x;
      const y = u * u * nodes[a].y + 2 * u * s * cy + s * s * nodes[b].y;
      let kind = 11;
      let phase = 0;
      if (info && pathLength > 0) {
        kind = 13;
        const along = info.from === a ? s : 1 - s;
        phase = (info.start + along * info.length) / pathLength;
      }
      targets.push({ x: x + spread() * 0.8, y: y + spread() * 0.8, kind, phase });
    }
  });

  nodes.forEach((node, i) => {
    const isLabeled = labeledNodes.has(i);
    const radius = node.isQuestion ? 7 : isLabeled ? 5 : 3;
    const dots = node.isQuestion ? 30 : isLabeled ? 24 : 12;
    const kind = node.isQuestion ? 16 : i === answerNode ? 15 : 12;
    for (let a = 0; a < dots; a++) {
      const angle = (a / dots) * Math.PI * 2;
      targets.push({ x: node.x + Math.cos(angle) * radius, y: node.y + Math.sin(angle) * radius, kind, phase: 0 });
    }
  });

  while (targets.length < size.count) {
    const node = nodes[Math.floor(random() * (nodes.length - 1))];
    targets.push({ x: node.x + spread() * 24, y: node.y + spread() * 24, kind: 6, phase: 0 });
  }

  return fitTargets({ targets, size });
};
