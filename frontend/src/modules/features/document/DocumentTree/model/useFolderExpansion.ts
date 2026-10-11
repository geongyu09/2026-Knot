import { useState } from "react";

interface UseFolderExpansionParams {
  /** 지금 보는 문서가 든 폴더의 이름. 문서 보기가 아니거나 목록에 없는 문서면 undefined */
  currentTopic: string | undefined;
}

/**
 * 폴더를 펼칠지 접을지 정해요.
 *
 * 사용자가 누른 폴더는 누른 대로 두고, 누른 적 없는 폴더는 지금 보는 문서의 폴더일 때만 펼쳐요.
 * 누른 기록만 상태로 두고 펼침 여부는 그때그때 계산해서, 지금 보는 문서가 바뀌어도 상태를 맞추는 코드가 없어요.
 */
export const useFolderExpansion = ({
  currentTopic,
}: UseFolderExpansionParams) => {
  const [toggledFolders, setToggledFolders] = useState(
    () => new Map<string, boolean>(),
  );

  const isFolderExpanded = (topic: string) =>
    toggledFolders.get(topic) ?? topic === currentTopic;

  const toggleFolder = (topic: string) => {
    const isExpanded = isFolderExpanded(topic);

    setToggledFolders((prev) => new Map(prev).set(topic, !isExpanded));
  };

  return { isFolderExpanded, toggleFolder };
};
