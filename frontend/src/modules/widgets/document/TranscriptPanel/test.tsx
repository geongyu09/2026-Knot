import {
  GetDocumentResponseDto,
  GetDocumentTranscriptResponseDto,
} from "@api/dto/document";
import {
  documentDetailsResponse,
  documentTranscriptsResponse,
} from "@api/mock/responses/document";
import { mockServer } from "@api/mock/server";
import type { DocumentTranscriptResponse } from "@api/mock/types/document";
import { ThemeProvider } from "@emotion/react";
import { theme } from "@provider/themeProvider";
import { getRouterPath, PATH_ROUTE } from "@routes/PATH_ROUTE";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { formatDate } from "@utils/formatDate";
import { formatDurationFromSeconds } from "@utils/formatDurationFromSeconds";
import { formatRecordingTime } from "@utils/formatRecordingTime";
import { http, HttpResponse } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import TranscriptPanel from ".";

const [transcriptResponse] = documentTranscriptsResponse;
const expectedTranscript = new GetDocumentTranscriptResponseDto(
  transcriptResponse,
);
const expectedDocument = new GetDocumentResponseDto(documentDetailsResponse[0]);
const WORKSPACE_ID = "1";
const DOCUMENT_ID = String(expectedDocument.id);
// 경로 파라미터 자리에 무엇이 와도 잡도록 fetch 상수 대신 패턴을 적어요
const DOCUMENT_REQUEST =
  "*/api/v1/workspaces/:workspaceId/documents/:documentId";
const TRANSCRIPT_REQUEST = `${DOCUMENT_REQUEST}/transcript`;
const PANEL_TITLE = "원문";
const FOOTER_NOTICE =
  "이 문서를 만든 원본이에요. 전사 전체를 그대로 볼 수 있어요";
const MILLIS_PER_SECOND = 1000;

const renderTranscriptPanel = (documentId = DOCUMENT_ID) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: PATH_ROUTE.DOCUMENT, element: <TranscriptPanel /> }],
    {
      initialEntries: [
        getRouterPath({
          routeKey: "DOCUMENT",
          params: { workspaceId: WORKSPACE_ID, documentId },
        }),
      ],
    },
  );

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
};

const respondWithTranscript = (response: DocumentTranscriptResponse) =>
  mockServer.use(
    http.get(TRANSCRIPT_REQUEST, () => HttpResponse.json(response)),
  );

const findPanel = () => screen.findByRole("region", { name: PANEL_TITLE });

/** 발화 줄. 원문을 받은 뒤에 보여요 */
const findLines = async () =>
  within(await findPanel()).findAllByRole("listitem");

/** 발화 줄에 보이는 시각. 서버가 준 ms를 초로 바꿔 `분:초`로 보여 줘요 */
const formatLineTime = (startMillis: number) =>
  formatRecordingTime(startMillis / MILLIS_PER_SECOND);

describe("TranscriptPanel", () => {
  it("제목 「원문」과 문서를 만든 날짜, 녹음 길이를 보여 준다", async () => {
    renderTranscriptPanel();

    const panel = within(await findPanel());

    expect(
      panel.getByRole("heading", { level: 2, name: PANEL_TITLE }),
    ).toBeInTheDocument();
    expect(
      await panel.findByText(formatDate(expectedDocument.createdAt)),
    ).toBeInTheDocument();
    expect(
      panel.getByText(
        formatDurationFromSeconds(expectedTranscript.recordingDurationSeconds),
      ),
    ).toBeInTheDocument();
  });

  it("발화 줄마다 시각과 「참여자 N:」, 문장을 서버가 준 순서대로 보여 준다", async () => {
    renderTranscriptPanel();

    const lines = await findLines();

    expect(lines).toHaveLength(expectedTranscript.segments.length);
    expectedTranscript.segments.forEach(
      ({ startMillis, speakerNumber, text }, index) => {
        const line = within(lines[index]);

        expect(line.getByText(formatLineTime(startMillis))).toBeInTheDocument();

        // 화자 번호가 없는 구간은 다음 테스트에서 봐요
        if (speakerNumber === null) return;

        expect(
          line.getByText(`참여자 ${speakerNumber}: ${text}`),
        ).toBeInTheDocument();
      },
    );
  });

  it("화자 번호가 없는 구간은 화자 없이 문장만 보여 준다", async () => {
    const lineIndex = expectedTranscript.segments.findIndex(
      ({ speakerNumber }) => speakerNumber === null,
    );
    const { text } = expectedTranscript.segments[lineIndex];

    renderTranscriptPanel();

    const line = (await findLines())[lineIndex];

    expect(within(line).getByText(text)).toBeInTheDocument();
    expect(line).not.toHaveTextContent("참여자");
  });

  it("한 시간이 넘은 발화의 시각은 시:분:초로 보여 준다", async () => {
    const response = {
      ...transcriptResponse,
      segments: [
        {
          startMillis: (60 * 60 + 2 * 60 + 3) * MILLIS_PER_SECOND,
          endMillis: null,
          speakerNumber: 1,
          text: "한 시간이 지났네요.",
        },
      ],
    } satisfies DocumentTranscriptResponse;
    const [segment] = new GetDocumentTranscriptResponseDto(response).segments;

    respondWithTranscript(response);
    renderTranscriptPanel();

    const [line] = await findLines();

    expect(
      within(line).getByText(formatLineTime(segment.startMillis)),
    ).toBeInTheDocument();
    expect(formatLineTime(segment.startMillis)).toBe("1:02:03");
  });

  it("발화 아래에 원문 안내 문구를 보여 준다", async () => {
    renderTranscriptPanel();

    await findLines();

    expect(
      within(await findPanel()).getByText(FOOTER_NOTICE),
    ).toBeInTheDocument();
  });

  it("주소의 문서 id로 원문을 한 번 요청한다", async () => {
    const [, otherDocument] = documentDetailsResponse;
    const requestedDocumentIds: unknown[] = [];

    mockServer.use(
      http.get(TRANSCRIPT_REQUEST, ({ params }) => {
        requestedDocumentIds.push(params.documentId);

        return HttpResponse.json(transcriptResponse);
      }),
    );

    renderTranscriptPanel(String(otherDocument.id));

    await findLines();

    expect(requestedDocumentIds).toEqual([String(otherDocument.id)]);
  });

  it("문서 상세를 받지 못해도 원문과 녹음 길이는 보여 주고, 만든 날짜만 뺀다", async () => {
    let documentRequestCount = 0;

    mockServer.use(
      http.get(DOCUMENT_REQUEST, () => {
        documentRequestCount += 1;

        return new HttpResponse(null, { status: 500 });
      }),
    );

    renderTranscriptPanel();

    const lines = await findLines();
    const panel = within(await findPanel());

    await waitFor(() => expect(documentRequestCount).toBe(1));

    expect(lines).toHaveLength(expectedTranscript.segments.length);
    expect(
      panel.getByText(
        formatDurationFromSeconds(expectedTranscript.recordingDurationSeconds),
      ),
    ).toBeInTheDocument();
    expect(
      panel.queryByText(formatDate(expectedDocument.createdAt)),
    ).not.toBeInTheDocument();
  });
});
