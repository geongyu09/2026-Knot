import { describe, expect, it } from "vitest";

import { getRecordingDocumentsStatus } from ".";

describe("getRecordingDocumentsStatus", () => {
  it.each(["RECORDING", "PAUSED"] as const)(
    "아직 끝내지 않은 녹음(%s)은 recording이다",
    (sessionStatus) => {
      expect(
        getRecordingDocumentsStatus({
          sessionStatus,
          transcriptionStatus: null,
          documentGeneration: null,
        }),
      ).toBe("recording");
    },
  );

  it.each([null, "PROCESSING", "SUCCEEDED"] as const)(
    "끝낸 녹음의 문서 생성이 아직 접수되지 않았으면(전사 상태 %s) organizing이다",
    (transcriptionStatus) => {
      expect(
        getRecordingDocumentsStatus({
          sessionStatus: "ENDED",
          transcriptionStatus,
          documentGeneration: null,
        }),
      ).toBe("organizing");
    },
  );

  it.each(["QUEUED", "RUNNING"] as const)(
    "문서 생성이 대기 중이거나 진행 중(%s)이면 organizing이다",
    (documentGenerationStatus) => {
      expect(
        getRecordingDocumentsStatus({
          sessionStatus: "ENDED",
          transcriptionStatus: "SUCCEEDED",
          documentGeneration: { status: documentGenerationStatus },
        }),
      ).toBe("organizing");
    },
  );

  it("문서가 모두 만들어졌으면 completed다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        transcriptionStatus: "SUCCEEDED",
        documentGeneration: { status: "SUCCEEDED" },
      }),
    ).toBe("completed");
  });

  it("문서로 정리할 내용이 없었으면 noContent다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        transcriptionStatus: "SUCCEEDED",
        documentGeneration: { status: "NO_CONTENT" },
      }),
    ).toBe("noContent");
  });

  it("문서 생성이 실패로 끝났으면 failed다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        transcriptionStatus: "SUCCEEDED",
        documentGeneration: { status: "FAILED" },
      }),
    ).toBe("failed");
  });

  it("전사가 실패했으면 문서 생성 결과가 없어도 failed다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        transcriptionStatus: "FAILED",
        documentGeneration: null,
      }),
    ).toBe("failed");
  });

  it("서버가 버린 녹음(DISCARDED)은 unsupported다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "DISCARDED",
        transcriptionStatus: null,
        documentGeneration: null,
      }),
    ).toBe("unsupported");
  });

  it("타입에 없는 세션 상태를 받으면 unsupported다", () => {
    expect(
      getRecordingDocumentsStatus({
        // @ts-expect-error 타입에 없는 값을 서버가 보낸 경우를 확인해요
        sessionStatus: "ARCHIVED",
        transcriptionStatus: null,
        documentGeneration: null,
      }),
    ).toBe("unsupported");
  });

  it("타입에 없는 전사 상태를 받으면 문서 생성 결과가 올 때까지 organizing이다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        // @ts-expect-error 타입에 없는 값을 서버가 보낸 경우를 확인해요
        transcriptionStatus: "QUEUED",
        documentGeneration: null,
      }),
    ).toBe("organizing");
  });

  it("타입에 없는 문서 생성 상태를 받으면 unsupported다", () => {
    expect(
      getRecordingDocumentsStatus({
        sessionStatus: "ENDED",
        transcriptionStatus: "SUCCEEDED",
        // @ts-expect-error 타입에 없는 값을 서버가 보낸 경우를 확인해요
        documentGeneration: { status: "CANCELLED" },
      }),
    ).toBe("unsupported");
  });
});
