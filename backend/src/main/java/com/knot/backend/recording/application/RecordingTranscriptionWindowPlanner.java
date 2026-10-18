package com.knot.backend.recording.application;

import com.knot.backend.recording.application.dto.result.PreparedWindowSource;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.model.AudioChunkDescriptor;
import com.knot.backend.recording.domain.model.AudioManifestPart;
import com.knot.backend.recording.domain.model.RecordingAudioChunk;
import com.knot.backend.recording.domain.model.RecordingAudioChunkStatus;
import com.knot.backend.recording.domain.model.RecordingTranscriptionWindow;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class RecordingTranscriptionWindowPlanner {
    private static final long MIN_CORE_FRAMES = 16_000;
    private static final int MAX_PIPELINE_VERSION_LENGTH = 64;

    private final ObjectMapper mapper;

    public RecordingTranscriptionWindowPlanner(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public List<RecordingTranscriptionWindow> plan(
            long recordingId,
            String pipelineVersion,
            long coreFrames,
            long contextFrames,
            List<RecordingAudioChunk> orderedChunks,
            Instant now
    ) {
        validateInput(
                recordingId,
                pipelineVersion,
                coreFrames,
                contextFrames,
                orderedChunks,
                now
        );
        List<RecordingAudioChunk> prefix = contiguousPrefix(
                recordingId,
                orderedChunks
        );
        if (prefix.isEmpty()) {
            return List.of();
        }
        RecordingAudioChunk last = prefix.getLast();
        long availableFrames = last.getSampleOffset() + last.getFrameCount();
        List<RecordingTranscriptionWindow> windows = new ArrayList<>();
        int firstPartIndex = 0;
        for (long coreStart = 0; coreStart + coreFrames + contextFrames <= availableFrames; coreStart += coreFrames) {
            long coreEnd = coreStart + coreFrames;
            long inputStart = Math.max(
                    0,
                    coreStart - contextFrames
            );
            long inputEnd = coreEnd + contextFrames;
            while (firstPartIndex < prefix.size() && endFrame(prefix.get(firstPartIndex)) <= inputStart) {
                firstPartIndex++;
            }
            List<AudioManifestPart> parts = overlappingParts(
                    prefix,
                    firstPartIndex,
                    inputEnd
            );
            String manifestJson = mapper.writeValueAsString(
                    new WindowManifest(
                            1,
                            inputStart,
                            inputEnd,
                            parts
                    )
            );
            windows.add(
                    RecordingTranscriptionWindow.queued(
                            recordingId,
                            pipelineVersion,
                            windows.size(),
                            coreStart,
                            coreEnd,
                            inputStart,
                            inputEnd,
                            manifestJson,
                            UUID.randomUUID(),
                            now
                    )
            );
        }
        return List.copyOf(windows);
    }

    public List<RecordingTranscriptionWindow> planFinal(
            long recordingId,
            String pipelineVersion,
            long coreFrames,
            long contextFrames,
            long totalFrames,
            List<AudioManifestPart> frozenParts,
            Instant now
    ) {
        validateInput(
                recordingId,
                pipelineVersion,
                coreFrames,
                contextFrames,
                List.of(),
                now
        );
        validateFrozenCoverage(
                recordingId,
                totalFrames,
                frozenParts
        );
        List<RecordingTranscriptionWindow> windows = new ArrayList<>();
        int firstPartIndex = 0;
        for (long coreStart = 0; coreStart < totalFrames; coreStart += coreFrames) {
            long coreEnd = Math.min(
                    coreStart + coreFrames,
                    totalFrames
            );
            long inputStart = Math.max(
                    0,
                    coreStart - contextFrames
            );
            long inputEnd = Math.min(
                    coreEnd + contextFrames,
                    totalFrames
            );
            while (firstPartIndex < frozenParts.size() && frozenParts.get(firstPartIndex)
                    .sampleOffset()
                    + frozenParts.get(firstPartIndex)
                            .frameCount() <= inputStart) {
                firstPartIndex++;
            }
            List<AudioManifestPart> parts = new ArrayList<>();
            for (int index = firstPartIndex; index < frozenParts.size(); index++) {
                AudioManifestPart part = frozenParts.get(index);
                if (part.sampleOffset() >= inputEnd) {
                    break;
                }
                parts.add(part);
            }
            String manifest = mapper.writeValueAsString(
                    new WindowManifest(
                            1,
                            inputStart,
                            inputEnd,
                            parts
                    )
            );
            windows.add(
                    RecordingTranscriptionWindow.queued(
                            recordingId,
                            pipelineVersion,
                            windows.size(),
                            coreStart,
                            coreEnd,
                            inputStart,
                            inputEnd,
                            manifest,
                            UUID.randomUUID(),
                            now
                    )
            );
        }
        return List.copyOf(windows);
    }

    public List<RecordingTranscriptionWindow> planPrepared(
            long recordingId,
            String pipelineVersion,
            long coreFrames,
            long contextFrames,
            PreparedWindowSource source,
            Instant now
    ) {
        validateInput(
                recordingId,
                pipelineVersion,
                coreFrames,
                contextFrames,
                List.of(),
                now
        );
        if (source == null || source.totalFrames() <= 0
                || source.totalFrames() > AudioChunkDescriptor.MAX_TOTAL_FRAME_COUNT
                || source.byteLength() != 44 + source.totalFrames() * 2 || source.storageKey() == null
                || !source.storageKey()
                        .matches("recordings/" + recordingId + "/prepared/[a-f0-9-]{36}/[a-f0-9]{64}\\.wav")
                || source.versionId() == null || source.versionId()
                        .isBlank()
                || "null".equals(source.versionId()) || source.checksumSha256() == null || !source.checksumSha256()
                        .matches("[A-Za-z0-9+/]{43}=")) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        List<RecordingTranscriptionWindow> planned = new ArrayList<>();
        for (long coreStart = 0; coreStart < source.totalFrames(); coreStart += coreFrames) {
            long coreEnd = Math.min(
                    coreStart + coreFrames,
                    source.totalFrames()
            );
            long inputStart = Math.max(
                    0,
                    coreStart - contextFrames
            );
            long inputEnd = Math.min(
                    coreEnd + contextFrames,
                    source.totalFrames()
            );
            if (inputEnd - inputStart > 960_000) {
                throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
            }
            String manifest = mapper.writeValueAsString(
                    new PreparedManifest(
                            2,
                            "PREPARED_WAV",
                            inputStart,
                            inputEnd,
                            source
                    )
            );
            planned.add(
                    RecordingTranscriptionWindow.queued(
                            recordingId,
                            pipelineVersion,
                            planned.size(),
                            coreStart,
                            coreEnd,
                            inputStart,
                            inputEnd,
                            manifest,
                            UUID.randomUUID(),
                            now
                    )
            );
        }
        return List.copyOf(planned);
    }

    private record PreparedManifest(
            int schemaVersion,
            String sourceKind,
            long inputStartFrame,
            long inputEndFrame,
            PreparedWindowSource source
    ) {
    }

    private void validateFrozenCoverage(
            long recordingId,
            long totalFrames,
            List<AudioManifestPart> parts
    ) {
        if (totalFrames <= 0 || totalFrames > AudioChunkDescriptor.MAX_TOTAL_FRAME_COUNT || parts == null
                || parts.isEmpty()) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
        int expectedSequence = 1;
        long expectedOffset = 0;
        for (AudioManifestPart part : parts) {
            if (part == null || part.sequence() != expectedSequence || part.sampleOffset() != expectedOffset
                    || part.storageKey() == null || !part.storageKey()
                            .startsWith("recordings/" + recordingId + "/")
                    || (part.versionId() != null && (part.versionId()
                            .isBlank() || "null".equals(part.versionId())))) {
                throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
            }
            new AudioChunkDescriptor(
                    part.sequence(),
                    part.sampleOffset(),
                    part.frameCount(),
                    part.byteLength(),
                    part.checksumSha256()
            );
            expectedSequence++;
            expectedOffset += part.frameCount();
        }
        if (expectedOffset != totalFrames) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
    }

    private void validateInput(
            long recordingId,
            String pipelineVersion,
            long coreFrames,
            long contextFrames,
            List<RecordingAudioChunk> orderedChunks,
            Instant now
    ) {
        if (recordingId <= 0 || pipelineVersion == null || pipelineVersion.isBlank()
                || pipelineVersion.length() > MAX_PIPELINE_VERSION_LENGTH || coreFrames < MIN_CORE_FRAMES
                || coreFrames > AudioChunkDescriptor.MAX_TOTAL_FRAME_COUNT || contextFrames < 0
                || contextFrames > AudioChunkDescriptor.MAX_TOTAL_FRAME_COUNT || orderedChunks == null || now == null) {
            throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
        }
    }

    private List<RecordingAudioChunk> contiguousPrefix(
            long recordingId,
            List<RecordingAudioChunk> orderedChunks
    ) {
        List<RecordingAudioChunk> prefix = new ArrayList<>();
        int expectedSequence = 1;
        long expectedOffset = 0;
        for (RecordingAudioChunk chunk : orderedChunks) {
            if (chunk == null || chunk.getRecordingId() != recordingId) {
                throw new RecordingException(RecordingErrorCode.INVALID_RECORDING_DATA);
            }
            if (chunk.getSequence() != expectedSequence || chunk.getSampleOffset() != expectedOffset
                    || chunk.getStatus() != RecordingAudioChunkStatus.VERIFIED) {
                break;
            }
            prefix.add(chunk);
            expectedSequence++;
            expectedOffset = endFrame(chunk);
        }
        return prefix;
    }

    private List<AudioManifestPart> overlappingParts(
            List<RecordingAudioChunk> prefix,
            int firstPartIndex,
            long inputEnd
    ) {
        List<AudioManifestPart> parts = new ArrayList<>();
        for (int index = firstPartIndex; index < prefix.size(); index++) {
            RecordingAudioChunk chunk = prefix.get(index);
            if (chunk.getSampleOffset() >= inputEnd) {
                break;
            }
            parts.add(
                    new AudioManifestPart(
                            chunk.getSequence(),
                            chunk.getSampleOffset(),
                            chunk.getFrameCount(),
                            chunk.getStorageKey(),
                            chunk.getChecksumSha256(),
                            chunk.getStorageVersionId()
                    )
            );
        }
        return parts;
    }

    private long endFrame(RecordingAudioChunk chunk) {
        return chunk.getSampleOffset() + chunk.getFrameCount();
    }

    private record WindowManifest(
            int schemaVersion,
            long inputStartFrame,
            long inputEndFrame,
            List<AudioManifestPart> parts
    ) {
    }
}
