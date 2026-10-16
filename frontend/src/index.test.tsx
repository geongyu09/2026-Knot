import { useDialog } from "@provider/context/dialogContext";
import { fireEvent, screen } from "@testing-library/react";
import posthog from "posthog-js";
import { useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { init: vi.fn() } }));

const { NEXT_PATH, NEXT_TEXT } = vi.hoisted(() => ({
  NEXT_PATH: "/next",
  NEXT_TEXT: "다음 화면",
}));

// 실제 화면 대신 모달을 띄우는 테스트용 화면만 두고, 프로바이더 조립(index.tsx)은 그대로 써요.
// 이 호출은 import보다 먼저 실행되므로 JSX 대신 끌어올려지는 함수 선언을 넘겨요
vi.mock("@routes/routes", () => ({
  routes: [
    { path: "/", Component: OpenerPage },
    { path: NEXT_PATH, Component: NextPage },
  ],
}));

function NextPage() {
  return <p>{NEXT_TEXT}</p>;
}

interface MoveDialogProps {
  close: () => void;
}

/** 모달 안에서 라우터 훅을 직접 쓰는 모달 */
function MoveDialog({ close }: MoveDialogProps) {
  const navigate = useNavigate();

  const handleMoveClick = () => {
    close();
    navigate(NEXT_PATH);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="이동할까요?">
      <button type="button" onClick={handleMoveClick}>
        이동
      </button>
    </div>
  );
}

function OpenerPage() {
  const { open } = useDialog();

  return (
    <button
      type="button"
      onClick={() => open(({ close }) => <MoveDialog close={close} />)}
    >
      모달 열기
    </button>
  );
}

describe("앱 진입점", () => {
  it("화면에서 띄운 모달 안에서 다른 화면으로 이동할 수 있다", async () => {
    document.body.innerHTML = '<div id="root"></div>';

    // index.tsx는 불러오는 순간 #root에 앱을 그려요
    await import("./index");

    fireEvent.click(await screen.findByRole("button", { name: "모달 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "이동" }));

    expect(await screen.findByText(NEXT_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // 모듈을 다시 불러오면 위 테스트가 쓰는 dialogContext와 어긋나므로 이 묶음은 맨 뒤에 둬요
  describe("PostHog 사용 기록", () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="root"></div>';
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.mocked(posthog.init).mockClear();
    });

    it("키와 주소가 있으면 사용 기록을 켠다", async () => {
      vi.stubEnv("POSTHOG_KEY", "phc_test");
      vi.stubEnv("POSTHOG_HOST", "https://us.i.posthog.com");

      await import("./index");

      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({ api_host: "https://us.i.posthog.com" }),
      );
    });

    it("키가 없으면 사용 기록을 켜지 않는다", async () => {
      await import("./index");

      expect(posthog.init).not.toHaveBeenCalled();
    });
  });
});
