import { describe, expect, it } from "vitest";

import { groupDocumentsByTopic } from ".";

describe("groupDocumentsByTopic", () => {
  it("폴더를 이름순으로 놓는다", () => {
    const folders = groupDocumentsByTopic({
      topics: [
        { topic: "회원 관리", documentCount: 1 },
        { topic: "사용자 인터뷰", documentCount: 1 },
        { topic: "주간 회의", documentCount: 1 },
      ],
      documents: [
        { id: 3, topic: "회원 관리", recordingSessionId: 13 },
        { id: 2, topic: "사용자 인터뷰", recordingSessionId: 12 },
        { id: 1, topic: "주간 회의", recordingSessionId: 11 },
      ],
    });

    expect(folders.map(({ topic }) => topic)).toEqual([
      "사용자 인터뷰",
      "주간 회의",
      "회원 관리",
    ]);
  });

  it("영문 이름의 폴더는 대소문자를 가리지 않고 이름순으로 놓는다", () => {
    const folders = groupDocumentsByTopic({
      topics: [
        { topic: "QA", documentCount: 0 },
        { topic: "figma 리뷰", documentCount: 0 },
      ],
      documents: [],
    });

    expect(folders.map(({ topic }) => topic)).toEqual(["figma 리뷰", "QA"]);
  });

  it("한글 이름의 폴더를 영문 이름의 폴더보다 위에 놓는다", () => {
    const folders = groupDocumentsByTopic({
      topics: [
        { topic: "QA", documentCount: 0 },
        { topic: "회원 관리", documentCount: 0 },
        { topic: "figma 리뷰", documentCount: 0 },
        { topic: "주간 회의", documentCount: 0 },
      ],
      documents: [],
    });

    expect(folders.map(({ topic }) => topic)).toEqual([
      "주간 회의",
      "회원 관리",
      "figma 리뷰",
      "QA",
    ]);
  });

  it("폴더 안의 문서는 최근 녹음에서 나온 문서가 위에 오게 놓는다", () => {
    // 받은 순서(문서를 만든 순서)와 녹음한 순서가 달라요. 먼저 한 녹음(11)의 문서가 가장 늦게 만들어졌어요
    const [folder] = groupDocumentsByTopic({
      topics: [{ topic: "주간 회의", documentCount: 3 }],
      documents: [
        { id: 3, topic: "주간 회의", recordingSessionId: 11 },
        { id: 2, topic: "주간 회의", recordingSessionId: 13 },
        { id: 1, topic: "주간 회의", recordingSessionId: 12 },
      ],
    });

    expect(folder.documents).toEqual([
      { id: 2, topic: "주간 회의", recordingSessionId: 13 },
      { id: 1, topic: "주간 회의", recordingSessionId: 12 },
      { id: 3, topic: "주간 회의", recordingSessionId: 11 },
    ]);
  });

  it("같은 녹음에서 나온 문서는 받은 순서를 그대로 지킨다", () => {
    const [folder] = groupDocumentsByTopic({
      topics: [{ topic: "주간 회의", documentCount: 4 }],
      documents: [
        { id: 4, topic: "주간 회의", recordingSessionId: 11 },
        { id: 3, topic: "주간 회의", recordingSessionId: 12 },
        { id: 2, topic: "주간 회의", recordingSessionId: 11 },
        { id: 1, topic: "주간 회의", recordingSessionId: 12 },
      ],
    });

    expect(folder.documents.map(({ id }) => id)).toEqual([3, 1, 4, 2]);
  });

  it("폴더마다 따로 최근 녹음순으로 놓는다", () => {
    const folders = groupDocumentsByTopic({
      topics: [
        { topic: "주간 회의", documentCount: 2 },
        { topic: "회원 관리", documentCount: 2 },
      ],
      documents: [
        { id: 4, topic: "주간 회의", recordingSessionId: 11 },
        { id: 3, topic: "회원 관리", recordingSessionId: 12 },
        { id: 2, topic: "주간 회의", recordingSessionId: 14 },
        { id: 1, topic: "회원 관리", recordingSessionId: 13 },
      ],
    });

    expect(folders).toEqual([
      {
        topic: "주간 회의",
        documentCount: 2,
        documents: [
          { id: 2, topic: "주간 회의", recordingSessionId: 14 },
          { id: 4, topic: "주간 회의", recordingSessionId: 11 },
        ],
      },
      {
        topic: "회원 관리",
        documentCount: 2,
        documents: [
          { id: 1, topic: "회원 관리", recordingSessionId: 13 },
          { id: 3, topic: "회원 관리", recordingSessionId: 12 },
        ],
      },
    ]);
  });

  it("넘겨받은 문서 배열의 순서는 바꾸지 않는다", () => {
    const documents = [
      { id: 2, topic: "주간 회의", recordingSessionId: 11 },
      { id: 1, topic: "주간 회의", recordingSessionId: 12 },
    ];

    groupDocumentsByTopic({
      topics: [{ topic: "주간 회의", documentCount: 2 }],
      documents,
    });

    expect(documents.map(({ id }) => id)).toEqual([2, 1]);
  });

  it("폴더의 문서 수는 받은 문서를 세지 않고 서버가 준 값을 쓴다", () => {
    const [folder] = groupDocumentsByTopic({
      topics: [{ topic: "회원 관리", documentCount: 12 }],
      documents: [{ id: 1, topic: "회원 관리", recordingSessionId: 11 }],
    });

    expect(folder.documentCount).toBe(12);
    expect(folder.documents).toHaveLength(1);
  });

  it("주제 목록에 없는 주제의 문서도 폴더를 만들어 넣고, 문서 수는 받은 문서를 센다", () => {
    const folders = groupDocumentsByTopic({
      topics: [{ topic: "회원 관리", documentCount: 1 }],
      documents: [
        { id: 3, topic: "새 주제", recordingSessionId: 13 },
        { id: 2, topic: "회원 관리", recordingSessionId: 12 },
        { id: 1, topic: "새 주제", recordingSessionId: 11 },
      ],
    });

    expect(folders).toEqual([
      {
        topic: "새 주제",
        documentCount: 2,
        documents: [
          { id: 3, topic: "새 주제", recordingSessionId: 13 },
          { id: 1, topic: "새 주제", recordingSessionId: 11 },
        ],
      },
      {
        topic: "회원 관리",
        documentCount: 1,
        documents: [{ id: 2, topic: "회원 관리", recordingSessionId: 12 }],
      },
    ]);
  });

  it("받은 문서가 하나도 없는 주제도 폴더로 남긴다", () => {
    const folders = groupDocumentsByTopic({
      topics: [{ topic: "회원 관리", documentCount: 3 }],
      documents: [],
    });

    expect(folders).toEqual([
      { topic: "회원 관리", documentCount: 3, documents: [] },
    ]);
  });

  it("주제도 문서도 없으면 빈 배열을 돌려준다", () => {
    expect(groupDocumentsByTopic({ topics: [], documents: [] })).toEqual([]);
  });
});
