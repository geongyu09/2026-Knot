import type { ParticleIconHandle } from "@composites/ParticleIcon";
import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { DockParticlesHandle } from "../ui/DockParticles";

interface UseDockParticleEffectsParams {
  /** 독 껍데기. 입자 좌표의 기준이에요 */
  formRef: RefObject<HTMLFormElement | null>;
  canSubmit: boolean;
}

/**
 * 독의 입자 반응을 언제 일으킬지 정해요.
 *
 * 보낼 수 있게 되면 화살표가 입자로 모이고, 녹음 버튼을 누르면 그 자리에서 입자가 터지며 실이 한 바퀴 돌아요.
 * 좌표는 모두 독 왼쪽 위 기준이라 요소를 받아 가운데를 계산해요.
 */
export const useDockParticleEffects = ({
  formRef,
  canSubmit,
}: UseDockParticleEffectsParams) => {
  const particlesRef = useRef<DockParticlesHandle>(null);
  const sendIconRef = useRef<ParticleIconHandle>(null);

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
    if (canSubmit) sendIconRef.current?.assemble();
  }, [canSubmit]);

  return {
    particlesRef,
    sendIconRef,
    burstAt,
    traceFrom,
  };
};
