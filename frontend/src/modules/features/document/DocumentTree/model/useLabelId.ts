import { useId } from "react";

/** 머리말 「문서」와 `aria-labelledby`를 잇는 id를 돌려줘요. */
export const useLabelId = () => {
  const labelId = useId();

  return { labelId };
};
