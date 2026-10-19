import { useDialog } from "@provider/context/dialogContext";
import CenteredLayout from "@pages/_layout/CenteredLayout";
import { useToast } from "@provider/context/toastContext";
import { act, fireEvent, screen } from "@testing-library/react";
import { attachAnalyticsWorkspace } from "@utils/analyticsWorkspace";
import { syncAnalyticsUser } from "@utils/syncAnalyticsUser";
import posthog from "posthog-js";
import { useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({ default: { init: vi.fn() } }));
vi.mock("@utils/syncAnalyticsUser", () => ({ syncAnalyticsUser: vi.fn() }));
// 테스트마다 모듈을 새로 불러와도 init에 넘긴 함수와 같은 함수인지 비교할 수 있게 고정해요
vi.mock("@utils/analyticsWorkspace", () => ({
  attachAnalyticsWorkspace: vi.fn(),
}));

const { NEXT_PATH, NEXT_TEXT } = vi.hoisted(() => ({
  NEXT_PATH: "/next",
  NEXT_TEXT: "다음 화면",
}));

const COPY_FAILED = "복사하지 못했어요. 다시 시도해 주세요.";

// 실제 화면 대신 모달을 띄우는 테스트용 화면만 두고, 프로바이더 조립(index.tsx)은 그대로 써요.
// 이 호출은 import보다 먼저 실행되므로 JSX 대신 끌어올려지는 함수 선언을 넘겨요
vi.mock("@routes/routes", () => ({
  routes: [
    {
      Component: CenteredLayout,
      children: [
        { path: "/", Component: OpenerPage },
        { path: NEXT_PATH, Component: NextPage },
      ],
    },
  ],
}));

function NextPage() {
  return <p>{NEXT_TEXT}</p>;
}

interface MoveDialogProps {
  close: () => void;
}

/** 모달 안에서 라우터 훅과 토스트를 직접 쓰는 모달 */
function MoveDialog({ close }: MoveDialogProps) {
  const navigate = useNavigate();
  const { show } = useToast();

  const handleMoveClick = () => {
    close();
    navigate(NEXT_PATH);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="이동할까요?">
      <button type="button" onClick={handleMoveClick}>
        이동
      </button>
      <button
        type="button"
        onClick={() => show({ variant: "error", message: COPY_FAILED })}
      >
        복사 실패 알리기
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

  it("화면에서 띄운 모달 안에서 토스트를 띄울 수 있다", async () => {
    if (!document.getElementById("root")) {
      document.body.innerHTML = '<div id="root"></div>';
    }

    // index.tsx는 처음 불러올 때만 앱을 그려서, 이미 그려졌으면 뒤로 가기처럼 첫 화면으로 되돌려요
    await import("./index");
    act(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    fireEvent.click(await screen.findByRole("button", { name: "모달 열기" }));
    fireEvent.click(screen.getByRole("button", { name: "복사 실패 알리기" }));

    expect(await screen.findByText(COPY_FAILED)).toBeInTheDocument();
  });

  // 모듈을 다시 불러오면 위 테스트가 쓰는 dialogContext와 어긋나므로 이 묶음은 맨 뒤에 둬요
  describe("PostHog 사용 기록", () => {
    beforeEach(() => {
      vi.resetModules();
      // 모듈을 다시 읽은 Provider와 이전 테스트 화면의 Context가 섞이지 않게 해요.
      vi.doMock("./App", () => ({ default: () => null }));
      document.body.innerHTML = '<div id="root"></div>';
    });

    afterEach(() => {
      vi.doUnmock("./App");
      vi.unstubAllEnvs();
      vi.mocked(posthog.init).mockClear();
      vi.mocked(syncAnalyticsUser).mockClear();
    });

    it("키가 있으면 사용 기록을 우리 주소의 중계 경로로 보내게 켜고, 로그인 확인 결과로 사용자를 식별하게 연결한다", async () => {
      vi.stubEnv("POSTHOG_KEY", "phc_test");

      await import("./index");

      expect(posthog.init).toHaveBeenCalledWith(
        "phc_test",
        expect.objectContaining({
          api_host: "/relay/p",
          ui_host: "https://us.posthog.com",
          before_send: attachAnalyticsWorkspace,
        }),
      );
      expect(syncAnalyticsUser).toHaveBeenCalledTimes(1);
    });

    it("키가 없으면 사용 기록을 켜지 않고 사용자 식별도 연결하지 않는다", async () => {
      await import("./index");

      expect(posthog.init).not.toHaveBeenCalled();
      expect(syncAnalyticsUser).not.toHaveBeenCalled();
    });
  });
});
