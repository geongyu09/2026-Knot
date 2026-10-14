import { authCsrfHandlers } from "./api/v1/auth/csrf";
import { authMeHandlers } from "./api/v1/auth/me";
import { authNicknameHandlers } from "./api/v1/auth/nickname";
import { chatMessagesHandlers } from "./api/v1/conversations/[sessionId]";
import { invitationPreviewHandlers } from "./api/v1/invitations/[tokenOrCode]";
import { invitationAcceptHandlers } from "./api/v1/invitations/accept";
import { lastViewedWorkspaceHandlers } from "./api/v1/members/me/lastViewedWorkspace";
import { workspacesHandlers } from "./api/v1/workspaces";
import { workspaceHandlers } from "./api/v1/workspaces/[workspaceId]";
import { workspaceConversationsHandlers } from "./api/v1/workspaces/[workspaceId]/conversations";
import { documentGenerationJobRetryHandlers } from "./api/v1/workspaces/[workspaceId]/documentGenerationJobs/[jobId]/retry";
import { documentsHandlers } from "./api/v1/workspaces/[workspaceId]/documents";
import { documentHandlers } from "./api/v1/workspaces/[workspaceId]/documents/[documentId]";
import { documentConfirmationsHandlers } from "./api/v1/workspaces/[workspaceId]/documents/[documentId]/confirmations";
import { documentMyConfirmationHandlers } from "./api/v1/workspaces/[workspaceId]/documents/[documentId]/confirmations/me";
import { documentTranscriptHandlers } from "./api/v1/workspaces/[workspaceId]/documents/[documentId]/transcript";
import { workspaceInvitationHandlers } from "./api/v1/workspaces/[workspaceId]/invitation";
import { workspaceInvitationsHandlers } from "./api/v1/workspaces/[workspaceId]/invitations";
import { workspaceInvitationReissueHandlers } from "./api/v1/workspaces/[workspaceId]/invitations/reissue";
import { workspaceLeaveHandlers } from "./api/v1/workspaces/[workspaceId]/members/me";
import { workspaceRecordingsHandlers } from "./api/v1/workspaces/[workspaceId]/recordings";
import { recordingHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]";
import { workspaceSearchConversationsHandlers } from "./api/v1/workspaces/[workspaceId]/search/conversations";
import { workspaceSearchConversationQuestionsHandlers } from "./api/v1/workspaces/[workspaceId]/search/conversations/[conversationId]/questions";
import { recordingAudioUploadCompleteHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioUploadComplete";
import { recordingAudioUploadUrlHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/audioUploadUrl";
import { recordingEndHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/end";
import { recordingHeartbeatHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/heartbeat";
import { recordingPauseHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/pause";
import { recordingResumeHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/[recordingId]/resume";
import { currentRecordingHandlers } from "./api/v1/workspaces/[workspaceId]/recordings/current";

// 리다이렉트 엔드포인트(OAuth 시작·로그아웃)는 XHR 응답이 아니라 두지 않아요
export const handlers = [
  ...authMeHandlers,
  ...authCsrfHandlers,
  ...authNicknameHandlers,
  ...lastViewedWorkspaceHandlers,
  ...workspacesHandlers,
  ...workspaceHandlers,
  ...workspaceInvitationHandlers,
  ...workspaceInvitationsHandlers,
  ...workspaceInvitationReissueHandlers,
  ...workspaceLeaveHandlers,
  ...workspaceConversationsHandlers,
  ...workspaceRecordingsHandlers,
  ...currentRecordingHandlers,
  ...recordingHandlers,
  ...recordingPauseHandlers,
  ...recordingResumeHandlers,
  ...recordingEndHandlers,
  ...recordingHeartbeatHandlers,
  ...recordingAudioUploadUrlHandlers,
  ...recordingAudioUploadCompleteHandlers,
  ...documentGenerationJobRetryHandlers,
  ...documentsHandlers,
  ...documentHandlers,
  ...documentConfirmationsHandlers,
  ...documentMyConfirmationHandlers,
  ...documentTranscriptHandlers,
  ...invitationAcceptHandlers,
  ...invitationPreviewHandlers,
  ...chatMessagesHandlers,
  ...workspaceSearchConversationsHandlers,
  ...workspaceSearchConversationQuestionsHandlers,
];
