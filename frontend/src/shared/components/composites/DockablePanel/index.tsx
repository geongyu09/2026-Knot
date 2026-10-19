import { css, keyframes } from "@emotion/react";
import styled from "@emotion/styled";
import useExitAnimation from "@hooks/common/useExitAnimation";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import useDockablePanel from "./model/useDockablePanel";

interface DockablePanelProps {
  /** 트리거 버튼의 접근성 이름 */
  label: string;
  /** 트리거 버튼 안에 그릴 아이콘 */
  icon: ReactNode;
  /** 고정했을 때 패널이 옮겨 갈 자리의 DOM id */
  dockTargetId: string;
  /**
   * 고정 여부를 바깥에서 정할 때 넘겨요.
   *
   * 넘기지 않으면 패널이 스스로 여닫아요. 같은 자리를 여러 패널이 나눠 써서
   * 하나만 고정돼야 할 때만 `onDockedChange`와 함께 넘기면 돼요.
   */
  isDocked?: boolean;
  /** 트리거를 눌러 고정 여부가 바뀌었을 때 알려줘요 */
  onDockedChange?: (isDocked: boolean) => void;
  /** 패널에 그릴 내용. 패널의 껍데기(너비·배경·라운드)는 이 내용이 스스로 가져요 */
  children: ReactNode;
}

/**
 * 스치면 띄우고 누르면 자리를 차지하는 패널.
 *
 * 닫힌 패널은 `useExitAnimation`이 물러나는 애니메이션이 끝날 때까지 조금 더 그려 둬요.
 * 겹쳐 뜬 패널이 고정되며 닫힐 때는 같은 자리에 고정 패널이 들어오므로 기다리지 않고 바로 지워요.
 */
export default function DockablePanel({
  label,
  icon,
  dockTargetId,
  isDocked: dockedProp,
  onDockedChange,
  children,
}: DockablePanelProps) {
  const panelId = useId();
  const { isDocked, isPeeking, dockTarget, rootProps, triggerProps } =
    useDockablePanel({ dockTargetId, dockedProp, onDockedChange });
  const floatingPanelRef = useRef<HTMLDivElement>(null);
  const dockedPanelRef = useRef<HTMLDivElement>(null);
  const { renderedValue: isFloatingRendered, isExiting: isFloatingClosing } =
    useExitAnimation({ value: isPeeking || null, ref: floatingPanelRef });
  const { renderedValue: isDockedRendered, isExiting: isDockedClosing } =
    useExitAnimation({ value: isDocked || null, ref: dockedPanelRef });

  return (
    <Root {...rootProps}>
      <Trigger
        type="button"
        aria-label={label}
        aria-controls={panelId}
        aria-expanded={isDocked || isPeeking}
        aria-pressed={isDocked}
        $isDocked={isDocked}
        {...triggerProps}
      >
        {icon}
      </Trigger>

      {isFloatingRendered && !isDocked && (
        <FloatingPanel
          ref={floatingPanelRef}
          id={panelId}
          data-overlay-state={isFloatingClosing ? "closing" : "open"}
          inert={isFloatingClosing}
        >
          {children}
        </FloatingPanel>
      )}

      {isDockedRendered &&
        dockTarget !== null &&
        createPortal(
          <DockedPanel
            ref={dockedPanelRef}
            id={panelId}
            data-overlay-state={isDockedClosing ? "closing" : "open"}
            inert={isDockedClosing}
          >
            {children}
          </DockedPanel>,
          dockTarget,
        )}
    </Root>
  );
}

const Root = styled.div`
  display: flex;
`;

const Trigger = styled.button<{ $isDocked: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5625rem; /* 9px */
  border: 1px solid
    ${({ theme, $isDocked }) =>
      $isDocked ? theme.neutral[700] : theme.neutral[200]};
  border-radius: 62.4375rem; /* 999px */
  background-color: ${({ theme, $isDocked }) =>
    $isDocked ? theme.neutral[700] : theme.neutral[0]};
  color: ${({ theme, $isDocked }) =>
    $isDocked ? theme.neutral[0] : theme.neutral[800]};
  box-shadow: ${({ theme }) => theme.shadow02};
  transition:
    background-color 0.2s ease-in,
    color 0.2s ease-in;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.sub.accent[500]};
    outline-offset: 2px;
  }
`;

/** 왼쪽에서 살며시 밀려 들어오는 등장 모션. 자리를 차지할 때도 겹쳐 뜰 때도 같은 방향으로 나와요 */
const slideInFromLeft = keyframes`
  from {
    transform: translateX(-0.75rem); /* 12px */
    opacity: 0;
  }
`;

/** 들어온 쪽으로 조금 물러나며 옅어지는 퇴장 모션 */
const slideOutToLeft = keyframes`
  to {
    transform: translateX(-0.5rem); /* 8px */
    opacity: 0;
  }
`;

/**
 * 등장은 길고 끝이 부드럽게 감속하고, 퇴장은 짧고 담백하게 빠져요.
 * 레일이 벌어지고 좁혀지는 속도(`WorkspaceLayout`의 `DockRail`)와 맞춰야 함께 밀리는 것처럼 보여요.
 */
const panelMotionStyle = css`
  animation: ${slideInFromLeft} 0.34s cubic-bezier(0.22, 1, 0.36, 1);

  &[data-overlay-state="closing"] {
    animation: ${slideOutToLeft} 0.22s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    &[data-overlay-state="closing"] {
      animation: none;
    }
  }
`;

/**
 * 겹쳐 뜬 패널. 화면 왼쪽 위에 고정으로 놓여요.
 *
 * 트리거마다 다른 자리에 붙지 않고 늘 같은 자리에 뜨는 건 디자인이 그렇게 잡혀 있어서예요.
 */
const FloatingPanel = styled.div`
  position: fixed;
  top: 5.5rem; /* 88px */
  bottom: 8.5rem; /* 136px */
  left: 2.5rem; /* 40px */
  z-index: 20;
  ${panelMotionStyle}
`;

/**
 * 자리를 차지한 패널. 옮겨 간 자리를 그대로 채워요.
 *
 * 물러나는 동안 레일이 함께 좁혀지므로, 내용이 레일 밖으로 넘치지 않게 잘라요.
 * 다른 패널이 같은 자리에 들어오면 물러나기를 기다리지 않고 바로 비켜, 두 패널이 나란히 서지 않아요.
 */
const DockedPanel = styled.div`
  width: 100%;
  height: 100%;
  ${panelMotionStyle}

  &[data-overlay-state="closing"] {
    overflow: hidden;
  }

  &[data-overlay-state="closing"]:not(:only-child) {
    display: none;
  }
`;
