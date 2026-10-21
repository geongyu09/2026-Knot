import { httpClient } from "@api/httpClient";
import {
  createHttpError,
  HTTP_ERROR_TYPE,
  type HttpErrorType,
} from "@api/httpClient/error";
import { mockServer } from "@api/mock/server";
import { SseRequestError } from "@api/sse/requestSseStream";
import { CancelledError } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { getErrorReportLevel, shouldReportError } from ".";

const httpError = (type: HttpErrorType, code?: string) =>
  createHttpError({ type, code });

const sseError = (status: number, code = "UNKNOWN") =>
  new SseRequestError({ status, code, message: `SSE 요청 실패: ${status}` });

const isReported = (error: unknown, isOnline = true) =>
  shouldReportError({ error, isOnline });

describe("shouldReportError", () => {
  describe("인증 만료", () => {
    it("401은 로그인 화면으로 보내는 예상 오류라 보고하지 않는다", () => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.unauthorized))).toBe(false);
      expect(isReported(sseError(401, "UNAUTHENTICATED"))).toBe(false);
    });
  });

  describe("400", () => {
    it.each([
      "VALIDATION_ERROR",
      "INVALID_MEMBER_DATA",
      "INVALID_WORKSPACE_NAME",
    ])("사용자 입력 검증 오류 %s는 보고하지 않는다", (code) => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.badRequest, code))).toBe(
        false,
      );
      expect(isReported(sseError(400, code))).toBe(false);
    });

    it.each([
      "INVALID_REQUEST_BODY",
      "INVALID_PARAMETER",
      "MISSING_PARAMETER",
      "INVALID_RECORDING_DATA",
      undefined,
    ])("요청 계약 위반 %s는 보고한다", (code) => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.badRequest, code))).toBe(
        true,
      );
    });
  });

  describe("403", () => {
    it.each(["CSRF_INVALID", "FORBIDDEN", undefined])(
      "CSRF 재시도 뒤에도 남은 403(%s)은 보고한다",
      (code) => {
        expect(isReported(httpError(HTTP_ERROR_TYPE.forbidden, code))).toBe(
          true,
        );
        expect(isReported(sseError(403, code))).toBe(true);
      },
    );

    it("httpClient가 CSRF 토큰을 다시 받아 보내도 403이면 그 오류를 보고한다", async () => {
      mockServer.use(
        http.post("*/__report-csrf", () =>
          HttpResponse.json({ code: "CSRF_INVALID" }, { status: 403 }),
        ),
      );

      const error = await httpClient
        .post("/__report-csrf")
        .catch((e: unknown) => e);

      expect(isReported(error)).toBe(true);
    });

    it("워크스페이스 멤버가 아닌 403은 선택 화면으로 보내는 예상 오류라 보고하지 않는다", () => {
      expect(
        isReported(
          httpError(HTTP_ERROR_TYPE.forbidden, "WORKSPACE_ACCESS_DENIED"),
        ),
      ).toBe(false);
    });

    // 대화 화면은 새 대화로 옮기고, 답변 칸은 실패 안내를 보여 줘요
    it("볼 수 없는 탐색 대화의 403은 탐색 화면이 처리하는 예상 오류라 보고하지 않는다", () => {
      expect(
        isReported(
          httpError(HTTP_ERROR_TYPE.forbidden, "SEARCH_ACCESS_DENIED"),
        ),
      ).toBe(false);
      expect(isReported(sseError(403, "SEARCH_ACCESS_DENIED"))).toBe(false);
    });

    // 녹음 화면이 아직 안내하지 않아 사용자는 녹음이 이어지는 줄 알아요
    it("녹음 제어권을 잃은 403은 화면이 처리하지 않아 보고한다", () => {
      expect(
        isReported(
          httpError(HTTP_ERROR_TYPE.forbidden, "RECORDING_CONTROL_DENIED"),
        ),
      ).toBe(true);
    });
  });

  describe("404 · 409 · 429", () => {
    it.each([
      [HTTP_ERROR_TYPE.notFound, "DOCUMENT_NOT_FOUND"],
      [HTTP_ERROR_TYPE.notFound, "WORKSPACE_NOT_FOUND"],
      [HTTP_ERROR_TYPE.conflict, "RECORDING_ALREADY_ENDED"],
      [HTTP_ERROR_TYPE.tooManyRequests, undefined],
    ])("화면이 안내하는 %s(%s)는 보고하지 않는다", (type, code) => {
      expect(isReported(httpError(type, code))).toBe(false);
    });

    it("없는 API 경로 404는 계약 위반이라 보고한다", () => {
      expect(
        isReported(
          httpError(HTTP_ERROR_TYPE.notFound, "REQUEST_PATH_NOT_FOUND"),
        ),
      ).toBe(true);
    });

    it("SSE 요청의 409는 보고하지 않는다", () => {
      expect(isReported(sseError(409, "ANSWER_ALREADY_IN_PROGRESS"))).toBe(
        false,
      );
    });
  });

  describe("그 밖의 4xx와 5xx", () => {
    it("405 · 415 같은 나머지 4xx는 보고한다", () => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.clientError))).toBe(true);
      expect(isReported(sseError(415, "UNSUPPORTED_MEDIA_TYPE"))).toBe(true);
    });

    it("5xx는 보고한다", () => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.serverError))).toBe(true);
      expect(isReported(sseError(503))).toBe(true);
    });
  });

  describe("요청 취소", () => {
    it.each([
      ["axios 취소", new axios.CanceledError()],
      ["react-query 취소", new CancelledError()],
      ["AbortController 취소", new DOMException("aborted", "AbortError")],
    ])("%s는 보고하지 않는다", (_, error) => {
      expect(isReported(error)).toBe(false);
    });

    // 새로고침, 탭 닫기, 다른 주소로 이동할 때 브라우저가 진행 중이던 요청을 끊어요
    it("페이지를 떠나며 끊긴 요청(Request aborted)은 보고하지 않는다", () => {
      const error = createHttpError({
        type: HTTP_ERROR_TYPE.network,
        cause: new AxiosError("Request aborted", AxiosError.ECONNABORTED),
      });

      expect(isReported(error)).toBe(false);
    });

    it("시간 초과는 취소가 아니라 보고한다", () => {
      const error = createHttpError({
        type: HTTP_ERROR_TYPE.network,
        cause: new AxiosError(
          "timeout of 10000ms exceeded",
          AxiosError.ECONNABORTED,
        ),
      });

      expect(isReported(error)).toBe(true);
    });
  });

  describe("네트워크 오류", () => {
    it("오프라인에서 난 네트워크 오류는 보고하지 않는다", () => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.network), false)).toBe(false);
      expect(isReported(new TypeError("Failed to fetch"), false)).toBe(false);
    });

    it("온라인인데 응답을 받지 못한 오류는 보고한다", () => {
      expect(isReported(httpError(HTTP_ERROR_TYPE.network), true)).toBe(true);
      expect(isReported(new TypeError("Failed to fetch"), true)).toBe(true);
    });

    it.each([
      ["페이지를 떠나는 중", { isPageHiding: true }],
      ["숨긴 탭", { isHidden: true }],
    ])("%s에 응답을 받지 못한 오류는 보고하지 않는다", (_, state) => {
      expect(
        shouldReportError({
          error: httpError(HTTP_ERROR_TYPE.network),
          isOnline: true,
          ...state,
        }),
      ).toBe(false);
      expect(
        shouldReportError({
          error: new TypeError("Failed to fetch"),
          isOnline: true,
          ...state,
        }),
      ).toBe(false);
    });

    it("숨긴 탭이어도 응답을 받은 5xx는 보고한다", () => {
      expect(
        shouldReportError({
          error: httpError(HTTP_ERROR_TYPE.serverError),
          isOnline: true,
          isHidden: true,
        }),
      ).toBe(true);
    });

    it("오프라인이어도 네트워크와 관계없는 TypeError는 보고한다", () => {
      expect(
        isReported(new TypeError("Cannot read properties of undefined"), false),
      ).toBe(true);
    });
  });

  describe("마이크 연결", () => {
    const microphoneError = (name: string) =>
      new DOMException("마이크를 받지 못했어요", name);

    it.each(["NotAllowedError", "NotFoundError"])(
      "녹음에서 마이크 권한 거절이나 장치 없음(%s)은 마이크 안내 창이 안내하는 예상 오류라 보고하지 않는다",
      (name) => {
        expect(
          shouldReportError({
            error: microphoneError(name),
            isOnline: true,
            feature: "recording",
          }),
        ).toBe(false);
      },
    );

    it.each(["NotReadableError", "OverconstrainedError"])(
      "녹음에서 마이크를 다른 앱이 쓰는 등 사용자가 고칠 수 없는 실패(%s)는 보고한다",
      (name) => {
        expect(
          shouldReportError({
            error: microphoneError(name),
            isOnline: true,
            feature: "recording",
          }),
        ).toBe(true);
      },
    );

    // DOM 조작 실패(removeChild 등)도 NotFoundError라 녹음 밖에서는 빼지 않아요
    it("녹음 밖의 NotFoundError는 보고한다", () => {
      expect(isReported(microphoneError("NotFoundError"))).toBe(true);
    });
  });

  it("요청과 관계없는 렌더링 오류는 보고한다", () => {
    expect(isReported(new Error("렌더링 실패"))).toBe(true);
  });
});

describe("getErrorReportLevel", () => {
  it.each([
    ["응답을 받지 못한 요청 실패", httpError(HTTP_ERROR_TYPE.network)],
    [
      "시간 초과 실패",
      createHttpError({
        type: HTTP_ERROR_TYPE.network,
        cause: new AxiosError(
          "timeout of 10000ms exceeded",
          AxiosError.ECONNABORTED,
        ),
      }),
    ],
    ["응답을 받지 못한 SSE 요청 실패", new TypeError("Failed to fetch")],
  ])("%s는 warning이다", (_, error) => {
    expect(getErrorReportLevel(error)).toBe("warning");
  });

  it.each([
    ["5xx", httpError(HTTP_ERROR_TYPE.serverError)],
    ["요청 계약 위반 400", httpError(HTTP_ERROR_TYPE.badRequest)],
    ["SSE 5xx", sseError(503)],
    ["렌더링", new Error("렌더링 실패")],
  ])("%s 오류는 error다", (_, error) => {
    expect(getErrorReportLevel(error)).toBe("error");
  });
});
