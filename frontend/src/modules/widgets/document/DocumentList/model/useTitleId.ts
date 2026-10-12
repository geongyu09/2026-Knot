import { useId } from "react";

/** 섹션 제목과 `aria-labelledby`를 잇는 id를 돌려줘요. */
export const useTitleId = () => {
  const titleId = useId();

  return { titleId };
};
