import type { ParticleIconHandle } from "@composites/ParticleIcon";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { DockParticlesHandle } from "../ui/DockParticles";

interface UseDockParticleEffectsParams {
  /** 독 껍데기. 입자 좌표의 기준이에요 */
  formRef: RefObject<HTMLFormElement | null>;
  isExpanded: boolean;
  canSubmit: boolean;
}

/** 펼침·접힘 모션이 어느 정도 진행된 뒤 아이콘이 모이기 시작해요(ms) */
const ASSEMBLE_DELAY = { expand: 160, collapse: 120 };

/**
 * 독의 입자 반응을 언제 일으킬지 정해요.
 *
 * 처음 나타나거나 펼치고 접을 때는 고스트 아이콘이 입자로 모이고 테두리에 실이 한 번 지나가요.
 * 보낼 수 있게 되면 화살표가 입자로 모이고, 녹음 버튼을 누르면 그 자리에서 입자가 터지며 실이 한 바퀴 돌아요.
 * 좌표는 모두 독 왼쪽 위 기준이라 요소를 받아 가운데를 계산해요.
 */
export const useDockParticleEffects = ({
  formRef,
  isExpanded,
  canSubmit,
}: UseDockParticleEffectsParams) => {
  const particlesRef = useRef<DockParticlesHandle>(null);
  const collapsedGhostRef = useRef<ParticleIconHandle>(null);
  const expandedGhostRef = useRef<ParticleIconHandle>(null);
  const sendIconRef = useRef<ParticleIconHandle>(null);
  const isFirstRender = useRef(true);

  const centerOf = useCallback(
    (element: Element | null | undefined) => {
      const form = formRef.current;
      if (!form || !element) return null;
      const formRect = form.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - formRect.left + rect.width / 2,
        y: rect.top - formRect.top + rect.height / 2,
      };
    },
    [formRef],
  );

  /** 요소 가운데에서 입자가 터져 나와요 */
  const burstAt = useCallback(
    (element: Element | null | undefined, count?: number) => {
      const center = centerOf(element);
      if (center) particlesRef.current?.burst(center.x, center.y, count);
    },
    [centerOf],
  );

  /** 요소 가운데에서 입자가 터지고, 가장 가까운 테두리에서 실이 한 바퀴 돌아요 */
  const traceFrom = useCallback(
    (element: Element | null | undefined) => {
      const center = centerOf(element);
      if (!center) return;
      particlesRef.current?.burst(center.x, center.y);
      particlesRef.current?.trace(center.x, center.y);
    },
    [centerOf],
  );

  useEffect(() => {
    const ghostRef = isExpanded ? expandedGhostRef : collapsedGhostRef;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      ghostRef.current?.assemble();
      return;
    }

    const timer = setTimeout(
      () => {
        ghostRef.current?.assemble();
        const form = formRef.current;
        if (form) {
          particlesRef.current?.trace(
            isExpanded ? 0 : form.clientWidth,
            form.clientHeight / 2,
            0.7,
          );
        }
      },
      isExpanded ? ASSEMBLE_DELAY.expand : ASSEMBLE_DELAY.collapse,
    );

    return () => clearTimeout(timer);
  }, [formRef, isExpanded]);

  useEffect(() => {
    if (canSubmit) sendIconRef.current?.assemble();
  }, [canSubmit]);

  return {
    particlesRef,
    collapsedGhostRef,
    expandedGhostRef,
    sendIconRef,
    burstAt,
    traceFrom,
  };
};
