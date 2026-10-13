import { PATH_ROUTE } from "@routes/PATH_ROUTE";
import { useMatch } from "react-router";

/**
 * 지금 보는 문서의 id를 돌려줘요. 문서 보기 화면이 아니면 null이에요.
 *
 * 문서 목록은 홈 · 탐색 · 문서 화면 어디에나 놓이므로, 주소가 문서 보기 경로인지부터 확인해요.
 * id가 숫자인지는 확인하지 않아요. 숫자가 아니면 어느 문서의 id와도 같지 않아 표시할 문서가 없을 뿐이에요.
 */
export const useCurrentDocumentId = () => {
  const documentMatch = useMatch(PATH_ROUTE.DOCUMENT);
  const currentDocumentId =
    documentMatch === null ? null : Number(documentMatch.params.documentId);

  return { currentDocumentId };
};
