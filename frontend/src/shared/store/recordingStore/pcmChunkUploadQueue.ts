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
 * - 예약 응답이 이미 `VERIFIED`면 PUT 없이 저장 확인만 보내요
 * - 서버 요청은 밖에서 받아요. 이 저장소는 브라우저 안의 녹음만 다루고 API 호출은 도메인 훅이 맡아요
 */
export default class PcmChunkUploadQueue {
  private readonly reserve: PcmChunkUploadQueueParams["reserve"];
  private readonly upload: PcmChunkUploadQueueParams["upload"];
  private readonly complete: PcmChunkUploadQueueParams["complete"];

  private nextSequence = 1;
  private nextSampleOffset = 0;
  /** 예약을 순서대로 하나씩 보내는 사슬 */
  private reserveChain: Promise<unknown> = Promise.resolve();

  constructor({ reserve, upload, complete }: PcmChunkUploadQueueParams) {
    this.reserve = reserve;
    this.upload = upload;
    this.complete = complete;
  }

  /** 조각을 봉인해 전송을 예약해요. 돌려주는 Promise는 그 조각의 저장 확인 응답을 받으면 끝나요 */
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

    // shortcut: 실패하면 이 Promise만 거부되고 다시 보내지 않아요, 복구는 #794에서 붙여요
    return this.transfer(chunk);
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

    if (status === "RESERVED" && uploadUrl !== null) {
      await this.upload({ uploadUrl, requiredHeaders, pcm });
    }
    // 이미 VERIFIED인 조각도 저장 확인을 보내요. 서버는 같은 결과를 다시 돌려줘요
    await this.complete(descriptor.sequence);
  }
}
