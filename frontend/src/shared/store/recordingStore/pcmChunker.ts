/** 서버가 받는 PCM 조각의 샘플링 레이트 */
export const PCM_SAMPLE_RATE = 16_000;

/** 조각 하나의 프레임 수(5초) */
export const PCM_CHUNK_FRAMES = PCM_SAMPLE_RATE * 5;

/** AudioWorklet에 등록하는 processor 이름. 수집기와 processor가 같은 값을 써야 해요 */
export const PCM_PROCESSOR_NAME = "pcm-processor";

/** 한 프레임의 채널들을 평균내 mono로 합치고 -1~1로 잘라 PCM16 값으로 바꿔요 */
export const toPcm16 = (channels: Float32Array[], frame: number) => {
  let sum = 0;
  for (let channel = 0; channel < channels.length; channel += 1) {
    sum += channels[channel][frame];
  }

  const mono = Math.max(-1, Math.min(1, sum / channels.length));

  return Math.round(mono * (mono < 0 ? 0x8000 : 0x7fff));
};

/**
 * 받은 소리를 PCM16 little-endian으로 모으다가 `PCM_CHUNK_FRAMES`가 차면 조각으로 내보내요.
 * `flush()`는 남은 1프레임 이상을 마지막 조각으로 내보내고, 다음 소리는 새 조각부터 세요.
 * 처리 배열 길이에 기대지 않아 한 번의 `push` 안에서도 경계를 나눠요.
 */
export class PcmChunker {
  private readonly onChunk: (pcm: ArrayBuffer) => void;
  private buffer = new ArrayBuffer(PCM_CHUNK_FRAMES * 2);
  private view = new DataView(this.buffer);
  private frameCount = 0;

  constructor(onChunk: (pcm: ArrayBuffer) => void) {
    this.onChunk = onChunk;
  }

  push(channels: Float32Array[]) {
    const frames = channels.length > 0 ? channels[0].length : 0;

    for (let frame = 0; frame < frames; frame += 1) {
      this.view.setInt16(this.frameCount * 2, toPcm16(channels, frame), true);
      this.frameCount += 1;
      if (this.frameCount === PCM_CHUNK_FRAMES) this.emit(this.buffer);
    }
  }

  flush() {
    if (this.frameCount > 0) {
      this.emit(this.buffer.slice(0, this.frameCount * 2));
    }
  }

  private emit(pcm: ArrayBuffer) {
    this.onChunk(pcm);
    this.buffer = new ArrayBuffer(PCM_CHUNK_FRAMES * 2);
    this.view = new DataView(this.buffer);
    this.frameCount = 0;
  }
}
