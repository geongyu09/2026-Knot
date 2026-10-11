import {
  GetDocumentTranscriptResponseDto,
  type GetDocumentTranscriptResponseRaw,
} from "@api/dto/document";
import { httpClient } from "@api/httpClient";

export const DOCUMENT_TRANSCRIPT_API_PATH = (
  workspaceId: number,
  documentId: number,
) => `/api/v1/workspaces/${workspaceId}/documents/${documentId}/transcript`;

interface GetDocumentTranscriptApiParams {
  workspaceId: number;
  documentId: number;
}

/**
 * @description 문서를 만든 전사 원문을 조회합니다. 실패는 `400` 잘못된 id · `401` 미인증 · `403` 워크스페이스 멤버 아님 · `404` 문서나 원문 없음 · `500` 저장된 원문에 구간이 없음으로 구분해요
 * @param params - 워크스페이스 ID·문서 ID
 * @returns 원문 ID·원본 녹음 길이·시작 시각 순서의 발화 구간
 * @example
 * const { segments } = await getDocumentTranscriptApi({ workspaceId: 1, documentId: 101 });
 */
export const getDocumentTranscriptApi = async ({
  workspaceId,
  documentId,
}: GetDocumentTranscriptApiParams) => {
  const response = await httpClient<GetDocumentTranscriptResponseRaw>({
    method: "get",
    url: DOCUMENT_TRANSCRIPT_API_PATH(workspaceId, documentId),
  });

  return new GetDocumentTranscriptResponseDto(response.data);
};
