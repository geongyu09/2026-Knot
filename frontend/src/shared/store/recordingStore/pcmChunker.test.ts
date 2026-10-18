import { describe, expect, it } from "vitest";

import { PCM_CHUNK_FRAMES, PcmChunker, toPcm16 } from "./pcmChunker";

const frames = (count: number, value = 0) =>
  new Float32Array(count).fill(value);

const frameCountOf = (pcm: ArrayBuffer) => pcm.byteLength / 2;

const sampleAt = (pcm: ArrayBuffer, frame: number) =>
  new DataView(pcm).getInt16(frame * 2, true);

const createChunker = () => {
  const chunks: ArrayBuffer[] = [];
  const chunker = new PcmChunker((pcm) => chunks.push(pcm));

  return { chunks, chunker };
};

const pushInBlocks = ({
  chunker,
  total,
  blockSize,
}: {
  chunker: PcmChunker;
  total: number;
  blockSize: number;
}) => {
  for (let pushed = 0; pushed < total; pushed += blockSize) {
    chunker.push([frames(Math.min(blockSize, total - pushed))]);
  }
};

describe("toPcm16", () => {
  it("여러 채널을 평균내 mono로 합친다", () => {
    expect(toPcm16([frames(1, 0.2), frames(1, 0.4)], 0)).toBe(
      Math.round(0.3 * 0x7fff),
    );
    expect(toPcm16([frames(1, 0.5), frames(1, -0.5)], 0)).toBe(0);
  });

  it("-1~1 밖의 값은 잘라 낸다", () => {
    expect(toPcm16([frames(1, 1.5)], 0)).toBe(32767);
    expect(toPcm16([frames(1, -1.5)], 0)).toBe(-32768);
  });
});

describe("PcmChunker", () => {
  it("PCM16을 little-endian으로 쓴다", () => {
    const { chunks, chunker } = createChunker();

    chunker.push([frames(1, 1)]);
    chunker.flush();

    expect([...new Uint8Array(chunks[0])]).toEqual([0xff, 0x7f]);
  });

  it("입력 프레임 수와 출력 프레임 수가 같다", () => {
    const { chunks, chunker } = createChunker();

    pushInBlocks({ chunker, total: 1000, blockSize: 128 });
    chunker.flush();

    expect(chunks.map(frameCountOf)).toEqual([1000]);
  });

  it("4.9초는 조각을 내지 않다가 flush에서 한 조각으로 봉인한다", () => {
    const { chunks, chunker } = createChunker();

    pushInBlocks({ chunker, total: 78_400, blockSize: 128 });
    expect(chunks).toHaveLength(0);

    chunker.flush();
    expect(chunks.map(frameCountOf)).toEqual([78_400]);
  });

  it("5초가 차면 바로 조각을 내고 flush는 아무것도 내지 않는다", () => {
    const { chunks, chunker } = createChunker();

    pushInBlocks({ chunker, total: PCM_CHUNK_FRAMES, blockSize: 128 });
    expect(chunks.map(frameCountOf)).toEqual([PCM_CHUNK_FRAMES]);

    chunker.flush();
    expect(chunks).toHaveLength(1);
  });

  it("5.1초는 5초 조각과 1초 미만 꼬리로 나뉜다", () => {
    const { chunks, chunker } = createChunker();

    pushInBlocks({ chunker, total: 81_600, blockSize: 128 });
    expect(chunks.map(frameCountOf)).toEqual([PCM_CHUNK_FRAMES]);

    chunker.flush();
    expect(chunks.map(frameCountOf)).toEqual([PCM_CHUNK_FRAMES, 1600]);
  });

  it("0프레임 조각은 만들지 않는다", () => {
    const { chunks, chunker } = createChunker();

    chunker.flush();
    chunker.push([]);
    chunker.push([frames(0)]);
    chunker.flush();

    expect(chunks).toHaveLength(0);
  });

  it("처리 길이가 128이 아니어도 한 번의 push 안에서 경계를 나눈다", () => {
    const { chunks, chunker } = createChunker();
    const ramp = Float32Array.from({ length: 81_600 }, (_, i) => i / 100_000);

    chunker.push([ramp]);
    chunker.flush();

    expect(chunks.map(frameCountOf)).toEqual([PCM_CHUNK_FRAMES, 1600]);
    expect(sampleAt(chunks[0], PCM_CHUNK_FRAMES - 1)).toBe(
      toPcm16([ramp], PCM_CHUNK_FRAMES - 1),
    );
    expect(sampleAt(chunks[1], 0)).toBe(toPcm16([ramp], PCM_CHUNK_FRAMES));
  });

  it("flush 뒤 이어서 받은 소리는 새 조각부터 센다", () => {
    const { chunks, chunker } = createChunker();

    chunker.push([frames(1000, 0.1)]);
    chunker.flush();
    chunker.push([frames(PCM_CHUNK_FRAMES, 0.2)]);

    expect(chunks.map(frameCountOf)).toEqual([1000, PCM_CHUNK_FRAMES]);
    expect(sampleAt(chunks[1], 0)).toBe(toPcm16([frames(1, 0.2)], 0));

    chunker.flush();
    expect(chunks).toHaveLength(2);
  });
});
