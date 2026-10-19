import { afterEach, describe, expect, it, vi } from "vitest";

import { clearAuthReturnPath, readAuthReturnPath, saveAuthReturnPath } from ".";

const RETURN_PATH = "/invite/X35D3S";

describe("authReturnPath", () => {
  afterEach(() => sessionStorage.clear());

  it("저장한 주소를 읽고, 읽은 뒤에도 남아 있다", () => {
    saveAuthReturnPath(RETURN_PATH);

    expect(readAuthReturnPath()).toBe(RETURN_PATH);
    expect(readAuthReturnPath()).toBe(RETURN_PATH);
  });

  it("지우면 undefined를 돌려준다", () => {
    saveAuthReturnPath(RETURN_PATH);

    clearAuthReturnPath();

    expect(readAuthReturnPath()).toBeUndefined();
  });

  it("저장한 적이 없으면 undefined를 돌려준다", () => {
    expect(readAuthReturnPath()).toBeUndefined();
  });

  it("sessionStorage가 예외를 던져도 터지지 않는다", () => {
    const throwStorageError = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      throwStorageError,
    );
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      throwStorageError,
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(
      throwStorageError,
    );

    expect(() => saveAuthReturnPath(RETURN_PATH)).not.toThrow();
    expect(readAuthReturnPath()).toBeUndefined();
    expect(() => clearAuthReturnPath()).not.toThrow();
  });
});
