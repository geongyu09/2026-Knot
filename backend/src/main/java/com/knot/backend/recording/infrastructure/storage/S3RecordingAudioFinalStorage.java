package com.knot.backend.recording.infrastructure.storage;

import com.knot.backend.recording.application.RecordingAudioFinalStorage;
import com.knot.backend.recording.domain.RecordingErrorCode;
import com.knot.backend.recording.domain.RecordingException;
import com.knot.backend.recording.domain.AudioStorageAccessDeniedException;
import com.knot.backend.recording.domain.model.AudioManifestPart;
import com.knot.backend.recording.domain.model.StoredAudioChunk;
import java.io.InputStream;
import java.nio.file.Path;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ChecksumMode;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

public class S3RecordingAudioFinalStorage implements RecordingAudioFinalStorage {
    private final S3Client client;
    private final String bucket;
    private final String keyPrefix;

    public S3RecordingAudioFinalStorage(
            S3Client client,
            String bucket,
            String keyPrefix
    ) {
        this.client = client;
        this.bucket = bucket;
        this.keyPrefix = java.util.Objects.requireNonNullElse(
                keyPrefix,
                ""
        );
    }

    @Override
    public InputStream openChunk(AudioManifestPart part) {
        if (part.isMissing() || part.versionId()
                .isBlank() || "null".equals(part.versionId())) {
            throw new RecordingException(RecordingErrorCode.AUDIO_CHUNK_MISMATCH);
        }
        try {
            return client.getObject(
                    GetObjectRequest.builder()
                            .bucket(bucket)
                            .key(keyPrefix + part.storageKey())
                            .versionId(part.versionId())
                            .checksumMode(ChecksumMode.ENABLED)
                            .build()
            );
        } catch (S3Exception exception) {
            if (exception.statusCode() == 403 || exception.statusCode() == 401) {
                throw new AudioStorageAccessDeniedException(exception);
            }
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        } catch (SdkException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        }
    }

    @Override
    public InputStream openFinalRange(
            String storageKey,
            String versionId,
            long firstByte,
            long byteLength
    ) {
        if (versionId == null || versionId.isBlank() || "null".equals(versionId) || firstByte < 0 || byteLength <= 0
                || firstByte > Long.MAX_VALUE - byteLength) {
            throw new RecordingException(RecordingErrorCode.AUDIO_CHUNK_MISMATCH);
        }
        long lastByte = firstByte + byteLength - 1;
        try {
            ResponseInputStream<GetObjectResponse> response = client.getObject(
                    GetObjectRequest.builder()
                            .bucket(bucket)
                            .key(keyPrefix + storageKey)
                            .versionId(versionId)
                            .range("bytes=" + firstByte + "-" + lastByte)
                            .build()
            );
            String contentRange = response.response()
                    .contentRange();
            String expectedPrefix = "bytes " + firstByte + "-" + lastByte + "/";
            if (response.response()
                    .contentLength() == null
                    || response.response()
                            .contentLength() != byteLength
                    || contentRange == null || !contentRange.startsWith(expectedPrefix)
                    || !validRangeTotal(
                            contentRange.substring(expectedPrefix.length()),
                            lastByte
                    ) || response.response()
                            .versionId() == null
                    || !versionId.equals(
                            response.response()
                                    .versionId()
                    )) {
                response.abort();
                throw new RecordingException(RecordingErrorCode.AUDIO_CHUNK_MISMATCH);
            }
            return response;
        } catch (S3Exception exception) {
            if (exception.statusCode() == 403 || exception.statusCode() == 401) {
                throw new AudioStorageAccessDeniedException(exception);
            }
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        } catch (SdkException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        }
    }

    private boolean validRangeTotal(
            String value,
            long lastByte
    ) {
        try {
            return value.matches("[1-9][0-9]*") && Long.parseLong(value) > lastByte;
        } catch (NumberFormatException exception) {
            return false;
        }
    }

    @Override
    public StoredAudioChunk uploadFinal(
            String storageKey,
            Path file,
            long byteLength,
            String checksumSha256
    ) {
        try {
            client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(keyPrefix + storageKey)
                            .contentType("audio/wav")
                            .contentLength(byteLength)
                            .checksumSHA256(checksumSha256)
                            .ifNoneMatch("*")
                            .build(),
                    RequestBody.fromFile(file)
            );
        } catch (S3Exception exception) {
            if (exception.statusCode() == 403 || exception.statusCode() == 401) {
                throw new AudioStorageAccessDeniedException(exception);
            }
            if (exception.statusCode() != 412) {
                throw new RecordingException(
                        RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                        exception
                );
            }
        } catch (SdkException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        }
        StoredAudioChunk stored = findStoredFinal(storageKey);
        if (!stored.exists() || stored.byteLength() != byteLength || !"audio/wav".equals(stored.contentType())
                || !checksumSha256.equals(stored.checksumSha256()) || stored.versionId() == null || stored.versionId()
                        .isBlank()
                || "null".equals(stored.versionId())) {
            throw new RecordingException(RecordingErrorCode.AUDIO_CHUNK_MISMATCH);
        }
        return stored;
    }

    @Override
    public StoredAudioChunk findStoredFinal(String storageKey) {
        try {
            HeadObjectResponse response = client.headObject(
                    HeadObjectRequest.builder()
                            .bucket(bucket)
                            .key(keyPrefix + storageKey)
                            .checksumMode(ChecksumMode.ENABLED)
                            .build()
            );
            return new StoredAudioChunk(
                    true,
                    java.util.Objects.requireNonNullElse(
                            response.contentLength(),
                            -1L
                    ),
                    response.contentType(),
                    response.checksumSHA256(),
                    response.versionId()
            );
        } catch (S3Exception exception) {
            if (exception.statusCode() == 403 || exception.statusCode() == 401) {
                throw new AudioStorageAccessDeniedException(exception);
            }
            if (exception.statusCode() == 404) {
                return StoredAudioChunk.missing();
            }
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        } catch (SdkException exception) {
            throw new RecordingException(
                    RecordingErrorCode.AUDIO_STORAGE_UNAVAILABLE,
                    exception
            );
        }
    }
}
