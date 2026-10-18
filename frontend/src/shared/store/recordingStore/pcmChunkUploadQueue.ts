/** PUT과 저장 확인을 동시에 진행하는 조각 수의 상한 */
const MAX_CONCURRENT_TRANSFERS = 2;

/** PCM16은 프레임 하나가 2바이트예요 */
const BYTES_PER_FRAME = 2;

type PcmChunkStatus = "RESERVED" | "VERIFIED";

/** 봉인할 때 고정하는 조각 정보. 예약 요청 본문의 descriptor와 같은 모양이에요 */
export interface PcmChunkDescriptor {
  /** 1부터 연속 증가하는 조각 번호 */
  sequence: number;
  /** 앞 조각들의 `frameCount` 합. 첫 조각은 0이에요 */
  sampleOffset: number;
  frameCount: number;
  byteLength: number;
  /** PCM 전체의 SHA-256을 패딩 있는 표준 Base64로 인코딩한 값 */
  checksumSha256: string;
}

interface ReserveResult {
  status: PcmChunkStatus;
  uploadUrl: string | null;
  requiredHeaders: Record<string, string>;
}

interface UploadParams {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  pcm: ArrayBuffer;
}

interface CompleteResult {
  status: PcmChunkStatus;
  verifiedThroughFrame: number;
}

export interface PcmChunkUploadQueueParams {
  /** 조각 예약. 도메인 훅이 세션과 탭 증명을 붙인 뮤테이션을 넘겨요 */
  reserve: (descriptor: PcmChunkDescriptor) => Promise<ReserveResult>;
  /** 예약 응답의 서명 URL로 PCM을 PUT */
  upload: (params: UploadParams) => Promise<unknown>;
  /** 조각 저장 확인 */
  complete: (sequence: number) => Promise<CompleteResult>;
}

/** 번호와 길이는 넣는 즉시 고정하고, 해시는 전송 직전에 계산해 붙여요 */
interface SealedPcmChunk extends Omit<PcmChunkDescriptor, "checksumSha256"> {
  pcm: ArrayBuffer;
}

/** 패딩 있는 표준 Base64로 인코딩한 SHA-256. 예약 요청과 S3 체크섬 헤더가 이 형식을 받아요 */
export const sha256Base64 = async (bytes: ArrayBuffer) => {
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return btoa(String.fromCharCode(...new Uint8Array(hash)));
};

/**
 * 봉인한 PCM 조각을 예약 → PUT → 저장 확인 순서로 올리는 전송 큐.
 *
 * - 넣는 순서대로 번호와 offset을 고정하고, 예약은 한 번에 하나씩 그 순서대로 보내요
 * - PUT과 저장 확인은 조각 2개까지 동시에 진행해요. 조각마다 전송은 한 번이라 같은 조각이 겹치지 않아요
 * - 예약 응답이 이미 `VERIFIED`면 PUT 없이 저장 확인만 보내 watermark를 받아요
 * - 저장 확인에서 `VERIFIED`를 받은 조각만 메모리에서 놓고 `verifiedThroughFrame`을 올려요
 * - 서버 요청은 밖에서 받아요. 이 저장소는 브라우저 안의 녹음만 다루고 API 호출은 도메인 훅이 맡아요
 */
export default class PcmChunkUploadQueue {
  private readonly reserve: PcmChunkUploadQueueParams["reserve"];
  private readonly upload: PcmChunkUploadQueueParams["upload"];
  private readonly complete: PcmChunkUploadQueueParams["complete"];

  private nextSequence = 1;
  private nextSampleOffset = 0;
  /** 저장 확인 전까지 들고 있는 조각 */
  private readonly pending = new Map<number, ArrayBuffer>();
  /** 예약을 순서대로 하나씩 보내는 사슬 */
  private reserveChain: Promise<unknown> = Promise.resolve();
  private readonly inflight = new Set<Promise<void>>();
  private transferring = 0;
  private readonly transferWaiters: Array<() => void> = [];
  private verifiedFrame = 0;

  constructor({ reserve, upload, complete }: PcmChunkUploadQueueParams) {
    this.reserve = reserve;
    this.upload = upload;
    this.complete = complete;
  }

  /** 첫 조각부터 빈틈없이 저장이 확인된 끝 프레임(그 프레임은 제외) */
  get verifiedThroughFrame() {
    return this.verifiedFrame;
  }

  /** 아직 저장 확인을 받지 못해 들고 있는 조각 번호 */
  get pendingSequences() {
    return [...this.pending.keys()];
  }

  /** 조각을 봉인해 전송을 예약해요. 돌려주는 Promise는 그 조각의 저장이 확인되면 끝나요 */
  enqueue(pcm: ArrayBuffer) {
    const frameCount = pcm.byteLength / BYTES_PER_FRAME;
    const chunk: SealedPcmChunk = {
      sequence: this.nextSequence,
      sampleOffset: this.nextSampleOffset,
      frameCount,
      byteLength: pcm.byteLength,
      pcm,
    };
    this.nextSequence += 1;
    this.nextSampleOffset += frameCount;
    this.pending.set(chunk.sequence, pcm);

    // shortcut: 실패하면 이 Promise만 거부되고 다시 보내지 않아요, 복구는 #794에서 붙여요
    const task: Promise<void> = this.transfer(chunk).finally(() => {
      this.inflight.delete(task);
    });
    this.inflight.add(task);

    return task;
  }

  /** 넣어 둔 조각이 모두 저장 확인될 때까지 기다려요 */
  async drain() {
    while (this.inflight.size > 0) await Promise.all(this.inflight);
  }

  private async transfer(chunk: SealedPcmChunk) {
    const { pcm, ...descriptor } = chunk;
    const checksum = sha256Base64(pcm);
    const reserved = this.reserveChain.then(async () =>
      this.reserve({ ...descriptor, checksumSha256: await checksum }),
    );
    // 한 조각의 실패가 뒤 조각의 예약까지 막지 않게 사슬에는 결과를 남기지 않아요
    this.reserveChain = reserved.catch(() => undefined);
    const { status, uploadUrl, requiredHeaders } = await reserved;

    await this.acquireTransferSlot();
    try {
      if (status === "RESERVED" && uploadUrl !== null) {
        await this.upload({ uploadUrl, requiredHeaders, pcm });
      }
      // 이미 VERIFIED인 조각도 저장 확인을 보내 watermark를 받아요. 서버는 같은 결과를 다시 돌려줘요
      const completed = await this.complete(descriptor.sequence);
      if (completed.status === "VERIFIED") {
        this.pending.delete(descriptor.sequence);
        // 뒤 조각의 응답이 먼저 와도 watermark가 줄지 않게 큰 값만 받아요
        this.verifiedFrame = Math.max(
          this.verifiedFrame,
          completed.verifiedThroughFrame,
        );
      }
    } finally {
      this.releaseTransferSlot();
    }
  }

  private async acquireTransferSlot() {
    if (this.transferring < MAX_CONCURRENT_TRANSFERS) {
      this.transferring += 1;

      return;
    }

    // 자리가 날 때까지 기다려요. 깨어나면 자리를 넘겨받은 상태라 수를 다시 세지 않아요
    await new Promise<void>((resolve) => this.transferWaiters.push(resolve));
  }

  private releaseTransferSlot() {
    const next = this.transferWaiters.shift();
    if (next) next();
    else this.transferring -= 1;
  }
}
