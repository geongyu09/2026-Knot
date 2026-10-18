import { HTTP_ERROR_TYPE, isHttpError } from "@api/httpClient/error";
import useCompleteRecordingAudioChunkMutation from "@api/mutations/useCompleteRecordingAudioChunkMutation";
import useCompleteRecordingAudioUploadMutation from "@api/mutations/useCompleteRecordingAudioUploadMutation";
import useEndRecordingMutation from "@api/mutations/useEndRecordingMutation";
import useIssueRecordingAudioUploadUrlMutation from "@api/mutations/useIssueRecordingAudioUploadUrlMutation";
import usePauseRecordingMutation from "@api/mutations/usePauseRecordingMutation";
import useReserveRecordingAudioChunkMutation from "@api/mutations/useReserveRecordingAudioChunkMutation";
import useResumeRecordingMutation from "@api/mutations/useResumeRecordingMutation";
import useSendRecordingHeartbeatMutation from "@api/mutations/useSendRecordingHeartbeatMutation";
import useStartRecordingMutation from "@api/mutations/useStartRecordingMutation";
import useUploadRecordingAudioChunkMutation from "@api/mutations/useUploadRecordingAudioChunkMutation";
import useUploadRecordingAudioMutation from "@api/mutations/useUploadRecordingAudioMutation";
import { recordingKeys } from "@api/queryKey/recording";
import { RECORDING_AUDIO_MODE } from "@constants/recording";
import useNavigateToRecordingDocuments from "@hooks/domain/recording/useNavigateToRecordingDocuments";
import useNavigateToWorkspaceHome from "@hooks/domain/workspace/useNavigateToWorkspaceHome";
import {
  type RecordingSession,
  useRecordingStore,
} from "@store/recordingStore";
import {
  createBackoff,
  isTransientApiError,
  type PcmAudioSeal,
} from "@store/recordingStore/pcmChunkUploadQueue";
import { useQueryClient } from "@tanstack/react-query";
import { isClosedRecordingError } from "@utils/isClosedRecordingError";
import { isRetryableAudioUploadError } from "@utils/isRetryableAudioUploadError";
import { isUnreachableRecordingError } from "@utils/isUnreachableRecordingError";
import { logRequestError } from "@utils/logRequestError";
import {
  clearRecordingStartProof,
  getRecordingControlProof,
  getRecordingStartProof,
} from "@utils/recordingControlProof";
import { useCallback, useRef } from "react";
import useEndRecordingDialog from "../useEndRecordingDialog";

/** 최종 오디오 업로드가 일시 실패했을 때 다시 시도하는 최대 횟수(첫 시도 제외) */
const AUDIO_UPLOAD_MAX_RETRIES = 3;

/** 종료 뒤 서버가 PCM 조각을 받아 주는 시간. 종료 응답이 시한을 주지 않으면 종료 시각에 더해요 */
const CHUNK_ACCEPT_WINDOW_MS = 120 * 1000;

/** 종료 봉인이 거절된 서버 오류 코드. 봉인 없이 한 번 더 끝내 예약한 조각을 보존해요 */
const SEAL_REJECTED_CODES = [
  "INVALID_AUDIO_SEAL",
  "AUDIO_SEAL_CONFLICT",
  "AUDIO_MODE_CONFLICT",
];

/** 서버가 조각을 받아 주는 시한(ISO 8601). 종료 시각을 모르면 지금부터 재요 */
const acceptUntilFrom = (endedAt: string | null) =>
  new Date(
    (endedAt ? new Date(endedAt).getTime() : Date.now()) +
      CHUNK_ACCEPT_WINDOW_MS,
  ).toISOString();

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * PCM 녹음의 일시정지·이어서 녹음을 순서대로 처리하는 사슬. 봉인과 서버 응답을 기다리는 동안 연타가 겹치지 않게 해요.
 * 훅을 쓰는 화면(독·녹음 바)이 여럿이라 모듈에 둬요
 */
let pcmControlChain: Promise<unknown> = Promise.resolve();

// Babel 8은 .ts에서도 JSX를 켜서 `<T>(…) =>`를 태그로 읽으니 function 선언으로 둬요
function runInOrder<T>(task: () => Promise<T>) {
  const result = pcmControlChain.then(task);
  // 앞 작업이 실패해도 다음 작업은 이어 가요
  pcmControlChain = result.catch(() => undefined);

  return result;
}

const isPcmSession = () =>
  useRecordingStore.getState().session?.audioMode === "PCM16_CHUNKS_V1";

interface HandleControlErrorParams {
  action: string;
  error: unknown;
  workspaceId: number;
}

interface UploadRecordedAudioParams {
  workspaceId: number;
  recordingId: number;
  audio: Blob;
}

type ControlProof = NonNullable<ReturnType<typeof getRecordingControlProof>>;

// TODO: 실패 안내·재시도 정책은 기획 논의가 필요해요. 정해질 때까지 안내 UI 없이 콘솔에만 남겨요(#465)
/**
 * 녹음을 시작·일시정지·이어서 녹음·끝내며 서버 녹음 세션과 맞추는 도메인 훅.
 *
 * - 시작: 마이크 권한 → 시작 요청이 성공해야 브라우저 녹음을 시작해요. 시작 요청이 실패하면 마이크를 꺼요.
 *   서버가 409로 거절하거나, 남아 있던 증명의 녹음을 돌려주면(200) 이어받지 않고 거절로 돌려줘요.
 *   돌려준 녹음이 이미 끝났거나 버려졌으면 새 증명으로 한 번만 다시 보내요. 시작 중에 다시 불러도 겹쳐 보내지 않아요.
 *   저장 방식이 PCM이면 시작 요청에 `audioMode`를 싣고, 조각 예약·PUT·저장 확인 요청에 세션과 최초 탭 증명을 묶어 저장소에 넘겨요.
 * - 일시정지·이어서 녹음(WebM): 브라우저 녹음을 먼저 바꾸고 서버에 알려요. 서버 요청이 실패해도 다시 보내지 않고
 *   사용자가 누른 대로 둬요.
 * - 일시정지·이어서 녹음(PCM): 일시정지는 남은 소리를 봉인해 큐에 넣은 뒤 서버에 알리고, 이어서 녹음은 서버 재개가
 *   성공한 뒤에 수집을 이어 가요. 연타는 앞 요청이 끝난 뒤 순서대로 처리해요.
 * - 끝내기(WebM): 확인 창에서 [녹음 끝내기]를 고르면 종료 요청 → 업로드 URL 발급 → 오디오 PUT → 업로드 완료 확인 → 녹음 비우기 → 그 녹음의 문서 정리 화면.
 *   끝내는 동안에는 확인 창을 다시 띄우지 않아요. 종료가 실패하면 녹음을 그대로 두고,
 *   업로드가 일시 실패하면 URL 발급부터 3번까지 다시 시도하고, 그래도 실패하면 오디오를 버리고 홈으로 가요.
 *   종료 요청이 이미 끝났거나 버려진 녹음으로 거절돼도 정리할 오디오가 없어 홈으로 가요.
 *   워크스페이스를 옮길 때처럼 부른 쪽이 따로 확인받고 갈 곳도 정하면 `endRecordingWithoutConfirm`으로 끝내요.
 * - 끝내기(PCM): 수집을 멈추고 마지막 조각을 봉인한 뒤, 예약 응답을 아직 받지 못한 조각을 `audioSeal`에 담아 종료 요청을 보내요.
 *   성공하면 응답의 시한을 큐에 주고 녹음을 비워 바로 정리 화면으로 가고, 남은 조각은 큐가 뒤에서 올려요.
 *   응답을 못 받았거나 5xx, 429면 같은 봉인으로 1, 2, 4초 뒤, 그 뒤 4초 간격으로 다시 보내고, 봉인이 거절되면 봉인 없이 한 번 더 보내요.
 *   서버가 먼저 끝낸 녹음(409 `RECORDING_ALREADY_ENDED`)은 예약한 조각만 종료 뒤 120초까지 올리고, 그 밖의 거절은 조각도 버려요. 둘 다 홈으로 가요.
 *   큐에 조각이 남아 있는 동안은 새 녹음을 시작하지 않아요(`uploading`). 안내 화면은 #814에서 붙여요.
 * - 생존 신호: 응답의 서버 상태를 따라가요. 서버가 끝낸 녹음(`ENDED`)이면 종료 요청 없이 WebM은 여기까지의 오디오를 올리고,
 *   PCM은 남은 소리를 봉인하지 않고 버린 뒤 예약한 조각만 종료 뒤 120초까지 올려요.
 *   버렸거나(`DISCARDED`) 더는 볼 수 없는 녹음(403 `WORKSPACE_ACCESS_DENIED`, 404)이면 오디오와 조각을 버려요. 모두 홈으로 가요.
 *   그 밖의 실패는 다시 보내지 않고 부르는 쪽의 다음 주기에 맡겨요. 끝내는 중에는 보내지 않아요.
 * - 일시정지나 이어서 녹음이 서버에서 이미 끝난 녹음(409 `RECORDING_ALREADY_ENDED`)이라고 거절되면 오디오를 버리지 않고
 *   생존 신호를 바로 한 번 보내 그 응답대로 처리해요. 이미 버려진 녹음(409)이면 오디오를 버리고 홈으로 가요.
 *
 * 최초 탭 증명은 sessionStorage에 두고, 실패는 안내 없이 콘솔에만 남겨요.
 * 독의 마이크 끊김 알림처럼 효과 안에서 부르는 곳이 있어 동작의 참조를 고정해요.
 */
const useRecordingControl = () => {
  const { navigateToWorkspaceHome } = useNavigateToWorkspaceHome();
  const { navigateToRecordingDocuments } = useNavigateToRecordingDocuments();
  //TODO: shared훅에서 mutate 제거하기
  const { mutateAsync: startRecordingSession } = useStartRecordingMutation();
  const { mutateAsync: pauseRecordingSession } = usePauseRecordingMutation();
  const { mutateAsync: resumeRecordingSession } = useResumeRecordingMutation();
  const { mutateAsync: endRecordingSession } = useEndRecordingMutation();
  const { mutateAsync: sendRecordingHeartbeat } =
    useSendRecordingHeartbeatMutation();
  const { mutateAsync: issueAudioUploadUrl } =
    useIssueRecordingAudioUploadUrlMutation();
  const { mutateAsync: uploadAudio } = useUploadRecordingAudioMutation();
  const { mutateAsync: completeAudioUpload } =
    useCompleteRecordingAudioUploadMutation();
  const { mutateAsync: reserveAudioChunk } =
    useReserveRecordingAudioChunkMutation();
  const { mutateAsync: uploadAudioChunk } =
    useUploadRecordingAudioChunkMutation();
  const { mutateAsync: completeAudioChunk } =
    useCompleteRecordingAudioChunkMutation();
  const { openEndRecordingDialog } = useEndRecordingDialog();
  const queryClient = useQueryClient();
  const isStartingRef = useRef(false);

  /** 녹음을 버리고 다음 녹음은 새 시작 요청으로 보내도록 증명을 지워요. `acceptUntil`을 주면 PCM 큐는 그때까지 남은 조각을 올려요 */
  const clearRecording = useCallback(
    (workspaceId: number, acceptUntil?: string) => {
      useRecordingStore.getState().discardRecording({ acceptUntil });
      clearRecordingStartProof();
      // 녹음하는 동안 받아 둔 녹음 중 응답이 다른 탭의 녹음으로 보이지 않게, 비우고 새로 받아요
      void queryClient.resetQueries({
        queryKey: recordingKeys.current(workspaceId),
      });
    },
    [queryClient],
  );

  //TODO: shared훅에서 라우팅 제거하기
  /** 녹음을 비우고 홈으로 가요 */
  const closeRecording = useCallback(
    (workspaceId: number, acceptUntil?: string) => {
      clearRecording(workspaceId, acceptUntil);
      navigateToWorkspaceHome({
        workspaceId: String(workspaceId),
        replace: true,
      });
    },
    [clearRecording, navigateToWorkspaceHome],
  );

  /**
   * 일시 실패면 URL 발급부터 최대 `AUDIO_UPLOAD_MAX_RETRIES`번 다시 시도해요. 최종 실패는 콘솔에만 남겨요.
   * 업로드 완료를 확인받았으면 `true`를 돌려줘요
   */
  const uploadRecordedAudio = useCallback(
    async ({ workspaceId, recordingId, audio }: UploadRecordedAudioParams) => {
      for (let retryCount = 0; ; retryCount += 1) {
        try {
          // 만료됐거나 PUT이 깨진 URL을 다시 쓰지 않도록 매번 새로 받아요. 쓰지 않은 예약이면 서버가 같은 uploadId를 줘요
          const { uploadId, uploadUrl } = await issueAudioUploadUrl({
            workspaceId,
            recordingId,
            contentType: audio.type,
            contentLength: audio.size,
          });
          await uploadAudio({ uploadUrl, audio });
          await completeAudioUpload({ workspaceId, recordingId, uploadId });

          return true;
        } catch (error) {
          if (
            retryCount < AUDIO_UPLOAD_MAX_RETRIES &&
            isRetryableAudioUploadError(error)
          ) {
            continue;
          }

          logRequestError("녹음 파일 업로드", error);

          return false;
        }
      }
    },
    [completeAudioUpload, issueAudioUploadUrl, uploadAudio],
  );

  /**
   * 생존 신호를 보내고 응답의 서버 상태에 맞춰 녹음을 이어 가거나 닫아요.
   * 실패는 콘솔에만 남기고 다시 보내지 않아요. 다음 신호는 부르는 쪽의 주기에 맡겨요
   */
  const sendHeartbeat = useCallback(async () => {
    const { session, isEnding } = useRecordingStore.getState();
    const proof = getRecordingControlProof();
    if (!session || !proof || isEnding) return;

    // 응답을 기다리는 사이 끝내기 시작했거나 닫은 녹음이면, 늦은 응답으로 지금 화면을 바꾸지 않아요
    const isLateResponse = () => {
      const current = useRecordingStore.getState();

      return (
        current.isEnding || current.session?.recordingId !== session.recordingId
      );
    };

    try {
      const { status, elapsedMillis, endedAt } = await sendRecordingHeartbeat({
        ...session,
        ...proof,
      });
      if (isLateResponse()) return;

      if (status === "ENDED" && session.audioMode === "PCM16_CHUNKS_V1") {
        // 서버가 먼저 끝낸 녹음은 봉인할 수 없어 남은 소리를 버리고, 예약한 조각만 시한 안에 올려요
        closeRecording(session.workspaceId, acceptUntilFrom(endedAt));
      } else if (status === "ENDED") {
        // 서버가 이미 끝낸 녹음이라 종료 요청 없이 여기까지의 오디오를 올려요
        const audio = await useRecordingStore.getState().stopRecording();
        await uploadRecordedAudio({ ...session, audio });
        closeRecording(session.workspaceId);
      } else if (status === "DISCARDED") {
        closeRecording(session.workspaceId);
      } else {
        useRecordingStore.getState().syncElapsedTime(elapsedMillis);
      }
    } catch (error) {
      logRequestError("녹음 생존 신호", error);
      if (!isLateResponse() && isUnreachableRecordingError(error)) {
        closeRecording(session.workspaceId);
      }
    }
  }, [closeRecording, sendRecordingHeartbeat, uploadRecordedAudio]);

  const handleControlError = useCallback(
    ({ action, error, workspaceId }: HandleControlErrorParams) => {
      logRequestError(action, error);

      // 서버가 끝낸 녹음은 오디오를 올려야 해서 버리지 않고, 생존 신호의 응답으로 마저 처리해요
      if (isHttpError(error) && error.code === "RECORDING_ALREADY_ENDED") {
        void sendHeartbeat();

        return;
      }

      if (isClosedRecordingError(error)) closeRecording(workspaceId);
    },
    [closeRecording, sendHeartbeat],
  );

  /** 마이크를 받아 서버에 녹음을 열어요. 결과는 `started`·`microphoneUnavailable`·`refused`·`failed`예요 */
  const connectAndStartRecording = useCallback(
    async (workspaceId: number) => {
      const store = useRecordingStore.getState();
      const isPcm = RECORDING_AUDIO_MODE === "PCM16_CHUNKS_V1";

      try {
        const isConnected = await store.connectMicrophone({
          audioMode: RECORDING_AUDIO_MODE,
        });
        if (!isConnected) return "microphoneUnavailable";
      } catch (error) {
        // 서버가 받는 형식으로 녹음할 수 없는 브라우저예요. 안내는 다른 실패와 함께 정해요(#465).
        // PCM 수집기를 만들지 못했을 때 WebM으로 다시 시작하는 일은 #799에서 붙여요
        logRequestError("녹음 시작", error);
        useRecordingStore.getState().discardRecording();

        return "failed";
      }

      const requestStart = () =>
        startRecordingSession({
          workspaceId,
          ...getRecordingStartProof(),
          // WebM일 때는 보내지 않아 PCM 켜기(#799) 전까지 지금과 같은 요청이 나가요
          audioMode: isPcm ? RECORDING_AUDIO_MODE : undefined,
        });

      try {
        let session = await requestStart();

        if (session.status === "ENDED" || session.status === "DISCARDED") {
          clearRecordingStartProof();
          session = await requestStart();
        } else if (!session.isCreated) {
          // 새로고침 전 녹음이 아직 열려 있어요. 이어 녹음은 이후 버전이라 이어받지 않아요(#374)
          useRecordingStore.getState().discardRecording();

          return "refused";
        }

        const sessionIds = { workspaceId, recordingId: session.recordingId };
        const { tabId, controlToken } = getRecordingStartProof();
        useRecordingStore.getState().startRecording({
          ...sessionIds,
          // 조각 큐는 React 밖에서 돌아 뮤테이션을 직접 쓰지 못하므로, 세션과 최초 탭 증명을 묶은 요청 함수를 넘겨요
          chunkRequests: isPcm
            ? {
                reserve: (descriptor) =>
                  reserveAudioChunk({
                    ...sessionIds,
                    tabId,
                    controlToken,
                    ...descriptor,
                  }),
                upload: uploadAudioChunk,
                complete: (sequence) =>
                  completeAudioChunk({
                    ...sessionIds,
                    tabId,
                    controlToken,
                    sequence,
                  }),
              }
            : undefined,
        });

        return "started";
      } catch (error) {
        // 응답을 못 받았거나 거절됐어도 서버엔 열렸을 수 있어, 다음 시작이 같은 요청으로 가도록 증명은 남겨요
        logRequestError("녹음 시작", error);
        useRecordingStore.getState().discardRecording();

        return isHttpError(error, HTTP_ERROR_TYPE.conflict)
          ? "refused"
          : "failed";
      }
    },
    [
      completeAudioChunk,
      reserveAudioChunk,
      startRecordingSession,
      uploadAudioChunk,
    ],
  );

  /**
   * 녹음을 시작해요. 결과는 `started`·`microphoneUnavailable`·`refused`·`failed`·`ignored`·`uploading`이고,
   * 마이크를 받지 못했거나 서버가 거절한 경우만 부른 쪽이 안내해요
   */
  const startRecording = useCallback(
    async (workspaceId: number) => {
      const { status, isUploadingChunks } = useRecordingStore.getState();
      if (status !== "idle") return "started";
      // 지난 녹음의 조각을 아직 올리는 중이면 새 녹음을 열지 않아요. 안내 화면은 #814에서 붙여요
      if (isUploadingChunks) return "uploading";
      // 같은 증명으로 시작이 겹치면 두 번째 응답(200 RECORDING)이 첫 녹음을 남은 녹음으로 오인해요
      if (isStartingRef.current) return "ignored";

      isStartingRef.current = true;
      try {
        return await connectAndStartRecording(workspaceId);
      } finally {
        isStartingRef.current = false;
      }
    },
    [connectAndStartRecording],
  );

  const sendPause = useCallback(async () => {
    const { session, isEnding } = useRecordingStore.getState();
    const proof = getRecordingControlProof();
    if (!session || !proof || isEnding) return;

    try {
      await pauseRecordingSession({ ...session, ...proof });
    } catch (error) {
      handleControlError({
        action: "일시정지",
        error,
        workspaceId: session.workspaceId,
      });
    }
  }, [handleControlError, pauseRecordingSession]);

  /** 서버에 일시정지를 알려요. 마이크가 끊겨 브라우저가 먼저 멈춘 경우에도 불러요 */
  const syncPause = useCallback(
    () => (isPcmSession() ? runInOrder(sendPause) : sendPause()),
    [sendPause],
  );

  const pauseRecording = useCallback(async () => {
    const pause = async () => {
      if (useRecordingStore.getState().isEnding) return;

      // PCM은 남은 소리를 봉인해 큐에 넣은 뒤 서버에 알려요. 이미 올리던 조각은 큐가 계속 올려요
      await useRecordingStore.getState().pauseRecording();
      await sendPause();
    };

    await (isPcmSession() ? runInOrder(pause) : pause());
  }, [sendPause]);

  /** PCM 녹음을 이어 가요. 서버 재개가 성공한 뒤에 수집을 이어 가므로, 실패하면 일시정지로 남아요 */
  const resumePcmRecording = useCallback(async () => {
    const store = useRecordingStore.getState();
    if (store.isEnding || store.status !== "paused") {
      return store.status === "recording";
    }

    try {
      const isReady = await store.ensureMicrophone();
      if (!isReady) return false;
    } catch (error) {
      // 새 마이크로 수집기를 만들지 못했어요. 마이크를 받지 못한 것처럼 안내해 다시 시도하게 해요
      logRequestError("이어서 녹음", error);

      return false;
    }

    const { session } = useRecordingStore.getState();
    const proof = getRecordingControlProof();
    if (session && proof) {
      try {
        await resumeRecordingSession({ ...session, ...proof });
      } catch (error) {
        handleControlError({
          action: "이어서 녹음",
          error,
          workspaceId: session.workspaceId,
        });

        return true;
      }
    }

    return useRecordingStore.getState().resumeRecording();
  }, [handleControlError, resumeRecordingSession]);

  /** 이어서 녹음해요. 마이크를 다시 받지 못하면 `false`를 돌려주고 서버에는 알리지 않아요 */
  const resumeRecording = useCallback(async () => {
    if (isPcmSession()) return runInOrder(resumePcmRecording);

    const store = useRecordingStore.getState();
    if (store.isEnding) return false;

    const isResumed = await store.resumeRecording();
    if (!isResumed) return false;

    const { session } = useRecordingStore.getState();
    const proof = getRecordingControlProof();
    if (!session || !proof) return true;

    try {
      await resumeRecordingSession({ ...session, ...proof });
    } catch (error) {
      handleControlError({
        action: "이어서 녹음",
        error,
        workspaceId: session.workspaceId,
      });
    }

    return true;
  }, [handleControlError, resumePcmRecording, resumeRecordingSession]);

  /**
   * PCM 녹음을 봉인해 끝내요. 일시 실패는 같은 봉인으로 간격을 두고 다시 보내고, 봉인이 거절되면 봉인 없이 한 번 더 보내요.
   * 성공하면 `uploaded`로 정리 화면으로 가고, 남은 조각은 큐가 시한까지 뒤에서 올려요.
   * 서버가 먼저 끝낸 녹음은 예약한 조각만 올리고, 그 밖의 거절은 조각도 버려요. 둘 다 `notUploaded`예요
   */
  const endPcmRecording = useCallback(
    async (session: RecordingSession, proof: ControlProof) => {
      let audioSeal: PcmAudioSeal | undefined = await useRecordingStore
        .getState()
        .sealRecording();
      const nextDelay = createBackoff();

      for (;;) {
        try {
          const { endedAt, audioSave } = await endRecordingSession({
            ...session,
            ...proof,
            audioSeal,
          });
          clearRecording(
            session.workspaceId,
            audioSave?.acceptUntil ?? acceptUntilFrom(endedAt),
          );

          return "uploaded";
        } catch (error) {
          logRequestError("녹음 종료", error);

          if (isTransientApiError(error)) {
            // 끝내는 중 생존 신호를 보내지 않아 30초가 넘으면 서버가 먼저 끝내고 409로 알려요
            await wait(nextDelay());
          } else if (
            audioSeal &&
            isHttpError(error) &&
            SEAL_REJECTED_CODES.includes(error.code ?? "")
          ) {
            audioSeal = undefined;
          } else {
            const isEndedByServer =
              isHttpError(error) && error.code === "RECORDING_ALREADY_ENDED";
            clearRecording(
              session.workspaceId,
              isEndedByServer ? acceptUntilFrom(null) : undefined,
            );

            return "notUploaded";
          }
        }
      }
    },
    [clearRecording, endRecordingSession],
  );

  /**
   * 확인 창 없이 녹음을 끝내 올린 뒤 비워요. 이동은 부른 쪽이 정해요.
   * 결과는 `uploaded`(업로드 완료를 확인받음. PCM은 봉인해 끝냄)·`notUploaded`(끝냈지만 오디오를 올리지 못함)·`notEnded`예요.
   * `notEnded`는 이미 끝내는 중이거나 종료 요청이 실패해 녹음을 이어 가는 경우예요
   */
  const endRecordingWithoutConfirm = useCallback(async () => {
    const { session, isEnding, beginEnding } = useRecordingStore.getState();
    const proof = getRecordingControlProof();
    if (!session || !proof || isEnding) return "notEnded";

    // 응답을 기다리는 동안 다시 눌러도 종료 요청이 겹치지 않게 먼저 표시해요
    beginEnding();

    if (session.audioMode === "PCM16_CHUNKS_V1") {
      return endPcmRecording(session, proof);
    }

    try {
      await endRecordingSession({ ...session, ...proof });
    } catch (error) {
      logRequestError("녹음 종료", error);

      // 서버에서 이미 끝났거나 버려진 녹음이면 올릴 곳이 없어 오디오를 버리고 끝낸 것으로 봐요
      if (isClosedRecordingError(error)) {
        clearRecording(session.workspaceId);

        return "notUploaded";
      }

      useRecordingStore.getState().cancelEnding();

      return "notEnded";
    }

    const audio = await useRecordingStore.getState().stopRecording();
    const isUploaded = await uploadRecordedAudio({ ...session, audio });
    clearRecording(session.workspaceId);

    return isUploaded ? "uploaded" : "notUploaded";
  }, [
    clearRecording,
    endPcmRecording,
    endRecordingSession,
    uploadRecordedAudio,
  ]);

  const endRecording = useCallback(() => {
    // 끝내는 동안 다시 눌러도 이미 끝내는 중이라 확인 창을 또 띄우지 않아요
    if (useRecordingStore.getState().isEnding) return;

    openEndRecordingDialog({
      onEnd: async () => {
        const { session } = useRecordingStore.getState();
        if (!session) return;

        const result = await endRecordingWithoutConfirm();
        if (result === "notEnded") return;

        const workspaceId = String(session.workspaceId);
        // 올린 오디오가 있어야 문서가 만들어지므로, 올리지 못한 녹음은 정리 화면 대신 홈으로 보내요
        if (result === "uploaded") {
          navigateToRecordingDocuments({
            workspaceId,
            recordingId: session.recordingId,
            replace: true,
          });
        } else {
          navigateToWorkspaceHome({ workspaceId, replace: true });
        }
      },
    });
  }, [
    endRecordingWithoutConfirm,
    navigateToRecordingDocuments,
    navigateToWorkspaceHome,
    openEndRecordingDialog,
  ]);

  return {
    startRecording,
    pauseRecording,
    syncPause,
    resumeRecording,
    sendHeartbeat,
    endRecording,
    endRecordingWithoutConfirm,
  };
};

export default useRecordingControl;
