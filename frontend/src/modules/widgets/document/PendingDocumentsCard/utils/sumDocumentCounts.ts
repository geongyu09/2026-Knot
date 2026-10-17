interface DocumentTopic {
  /** 서버가 센 그 주제의 문서 수 */
  documentCount: number;
}

/**
 * 주제별 문서 수를 모두 더해 전체 문서 수를 돌려줘요.
 *
 * 받은 문서를 세지 않고 서버가 센 수를 더해요. 문서가 아주 많아 다 받지 못했을 때도 전체 수가 맞아요.
 *
 * @example
 * sumDocumentCounts([{ documentCount: 3 }, { documentCount: 4 }]); // 7
 */
export const sumDocumentCounts = (topics: DocumentTopic[]) =>
  topics.reduce((count, { documentCount }) => count + documentCount, 0);
