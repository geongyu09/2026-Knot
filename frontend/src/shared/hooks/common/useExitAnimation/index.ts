import { useLayoutEffect, useState, type RefObject } from "react";

interface UseExitAnimationParams<T> {
  /** 지금 보여 줄 값. 닫히면 `null`이에요 */
  value: T | null;
  /** 닫힘 애니메이션이 도는 요소. 그 안의 자식 애니메이션까지 함께 기다려요 */
  ref: RefObject<Element | null>;
}

/** 끝이 있는 애니메이션만 골라요. 안에서 무한히 도는 스피너를 기다리면 영영 닫히지 않아요 */
const getFiniteAnimations = (element: Element) => {
  // getAnimations를 모르는 환경(jsdom 등)에서는 기다릴 애니메이션이 없는 것으로 봐요
  if (typeof element.getAnimations !== "function") return [];

  return element
    .getAnimations({ subtree: true })
    .filter(
      (animation) => animation.effect?.getComputedTiming().endTime !== Infinity,
    );
};

/**
 * 값이 `null`로 바뀌어도 닫힘 애니메이션이 끝날 때까지 직전 값을 들고 있어요.
 *
 * - `renderedValue`: 화면에 그릴 값. 열려 있으면 `value`, 닫히는 중이면 직전 값, 다 닫히면 `null`이에요
 * - `isExiting`: 닫히는 중인지. 쓰는 쪽은 이 동안 닫힘 애니메이션을 거는 스타일로 바꿔요
 *
 * 닫히는 중으로 그린 뒤 `ref` 안에서 도는 애니메이션이 모두 끝나거나 취소되기를 기다려 직전 값을 놓아요.
 * 도는 애니메이션이 없으면(움직임 줄이기 설정, 애니메이션을 모르는 테스트 환경) 그린 직후 바로 놓아요.
 * 닫히는 중에 새 값이 들어오면 기다리지 않고 바로 새 값을 그려요.
 *
 * 무엇을 열고 닫을지는 쓰는 쪽이 그대로 들고 있고, 이 훅은 그 값을 조금 늦게 놓는 일만 해요.
 */
const useExitAnimation = <T,>({ value, ref }: UseExitAnimationParams<T>) => {
  const [previousValue, setPreviousValue] = useState(value);
  const [exitingValue, setExitingValue] = useState<T | null>(null);

  // 값이 바뀐 렌더링에서 바로 직전 값을 붙잡아야, 닫힌 순간에도 한 프레임도 비지 않아요
  if (value !== previousValue) {
    setPreviousValue(value);
    setExitingValue(value === null ? previousValue : null);
  }

  const isExiting = value === null && exitingValue !== null;

  // 닫힘 스타일이 그려진 직후에 재야 새로 걸린 닫힘 애니메이션이 잡혀요
  useLayoutEffect(() => {
    if (!isExiting) return;

    const animations = ref.current ? getFiniteAnimations(ref.current) : [];

    if (animations.length === 0) {
      setExitingValue(null);
      return;
    }

    let isCancelled = false;

    // 취소된 애니메이션의 finished는 실패로 끝나므로 allSettled로 기다려요
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(() => {
      if (!isCancelled) setExitingValue(null);
    });

    return () => {
      isCancelled = true;
    };
  }, [isExiting, ref]);

  return { renderedValue: value ?? exitingValue, isExiting };
};

export default useExitAnimation;
