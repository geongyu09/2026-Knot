import { useState } from "react";

interface UseFolderExpansionParams {
  /** 지금 보는 워크스페이스의 id. 누른 기록을 워크스페이스마다 따로 둬요 */
  workspaceId: number;
  /** 지금 보는 문서가 든 폴더의 이름. 문서 보기가 아니거나 목록에 없는 문서면 undefined */
  currentTopic: string | undefined;
}

/**
 * 폴더를 펼칠지 접을지 정해요.
 *
 * 사용자가 누른 폴더는 누른 대로 두고, 누른 적 없는 폴더는 지금 보는 문서의 폴더일 때만 펼쳐요.
 * 누른 기록만 상태로 두고 펼침 여부는 그때그때 계산해서, 지금 보는 문서가 바뀌어도 상태를 맞추는 코드가 없어요.
 *
 * 누른 기록은 워크스페이스마다 따로 둬요. 폴더 이름은 워크스페이스끼리 겹칠 수 있고,
 * 워크스페이스를 바꿔도 이 목록이 화면에 남아 있을 수 있어서, 이름만으로 찾으면 다른 워크스페이스의 기록을 따르게 돼요.
 */
export const useFolderExpansion = ({
  workspaceId,
  currentTopic,
}: UseFolderExpansionParams) => {
  const [toggledFolders, setToggledFolders] = useState(
    () => new Map<string, boolean>(),
  );

  const getFolderKey = (topic: string) => `${workspaceId}/${topic}`;

  const isFolderExpanded = (topic: string) =>
    toggledFolders.get(getFolderKey(topic)) ?? topic === currentTopic;

  const toggleFolder = (topic: string) => {
    const isExpanded = isFolderExpanded(topic);

    setToggledFolders((prev) =>
      new Map(prev).set(getFolderKey(topic), !isExpanded),
    );
  };

  return { isFolderExpanded, toggleFolder };
};
