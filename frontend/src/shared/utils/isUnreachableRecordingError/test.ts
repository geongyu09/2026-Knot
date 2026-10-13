import { createHttpError, HTTP_ERROR_TYPE } from "@api/httpClient/error";
import { describe, expect, it } from "vitest";

import { isUnreachableRecordingError } from ".";

describe("isUnreachableRecordingError", () => {
  it("404면 오류 코드와 관계없이 true를 돌려준다", () => {
    expect(
      isUnreachableRecordingError(
        createHttpError({
          type: HTTP_ERROR_TYPE.notFound,
          code: "RECORDING_NOT_FOUND",
        }),
      ),
    ).toBe(true);
    expect(
      isUnreachableRecordingError(
        createHttpError({ type: HTTP_ERROR_TYPE.notFound }),
      ),
    ).toBe(true);
  });

  it("워크스페이스 멤버가 아니라는 403이면 true를 돌려준다", () => {
    expect(
      isUnreachableRecordingError(
        createHttpError({
          type: HTTP_ERROR_TYPE.forbidden,
          code: "WORKSPACE_ACCESS_DENIED",
        }),
      ),
    ).toBe(true);
  });

  it("최초 탭 증명이나 CSRF가 맞지 않은 403이면 false를 돌려준다", () => {
    expect(
      isUnreachableRecordingError(
        createHttpError({
          type: HTTP_ERROR_TYPE.forbidden,
          code: "RECORDING_CONTROL_DENIED",
        }),
      ),
    ).toBe(false);
    expect(
      isUnreachableRecordingError(
        createHttpError({ type: HTTP_ERROR_TYPE.forbidden, code: "FORBIDDEN" }),
      ),
    ).toBe(false);
  });

  it("그 밖의 HTTP 에러나 네트워크 에러면 false를 돌려준다", () => {
    expect(
      isUnreachableRecordingError(
        createHttpError({ type: HTTP_ERROR_TYPE.serverError }),
      ),
    ).toBe(false);
    expect(
      isUnreachableRecordingError(
        createHttpError({ type: HTTP_ERROR_TYPE.network }),
      ),
    ).toBe(false);
  });

  it("HTTP 에러가 아니면 false를 돌려준다", () => {
    expect(isUnreachableRecordingError(new Error("boom"))).toBe(false);
    expect(isUnreachableRecordingError(undefined)).toBe(false);
  });
});
