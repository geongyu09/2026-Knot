package com.knot.backend.recording.infrastructure.storage;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

class S3RecordingAudioPrefixDeletionTest {
    private S3Client client;
    private S3RecordingAudioStorage storage;

    @BeforeEach
    void setUp() {
        client = mock(S3Client.class);
        storage = new S3RecordingAudioStorage(null, client, "bucket", "dev/", Duration.ofMinutes(15));
        when(client.getBucketVersioning(any(GetBucketVersioningRequest.class)))
                .thenReturn(GetBucketVersioningResponse.builder().status(BucketVersioningStatus.ENABLED).build());
    }

    @Test
    void deletesEveryVersionAndMarkerAndRechecksEmptyPrefix() {
        // given
        when(client.listObjectVersions(any(ListObjectVersionsRequest.class))).thenReturn(
                ListObjectVersionsResponse.builder().versions(
                        ObjectVersion.builder().key("dev/recordings/1/chunks/1").versionId("v1").build(),
                        ObjectVersion.builder().key("dev/recordings/1/chunks/1").versionId("v2").build())
                        .deleteMarkers(DeleteMarkerEntry.builder().key("dev/recordings/1/chunks/1").versionId("m1").build())
                        .build(),
                ListObjectVersionsResponse.builder().build());
        // when
        storage.deleteRecordingPrefix("recordings/1/chunks/");
        // then
        verify(client, times(3)).deleteObject(any(DeleteObjectRequest.class));
        verify(client, times(2)).listObjectVersions(argThat((ListObjectVersionsRequest request) ->
                request.prefix().equals("dev/recordings/1/chunks/") && request.keyMarker() == null));
    }

    @ParameterizedTest
    @ValueSource(strings = {"recordings/", "recordings/1", "recordings/0/", "recordings/1/../2/", ""})
    void refusesBroadOrMalformedPrefixes(String prefix) {
        // given
        clearInvocations(client);
        // when
        org.assertj.core.api.ThrowableAssert.ThrowingCallable action = () -> storage.deleteRecordingPrefix(prefix);
        // then
        assertThatThrownBy(action).isInstanceOf(com.knot.backend.recording.domain.RecordingException.class);
        verifyNoInteractions(client);
    }

    @Test
    void rejectsUnexpectedObjectOutsideOwnedPrefix() {
        // given
        when(client.listObjectVersions(any(ListObjectVersionsRequest.class))).thenReturn(
                ListObjectVersionsResponse.builder().versions(
                        ObjectVersion.builder().key("dev/recordings/11/chunks/1").versionId("v1").build()).build());
        // when
        org.assertj.core.api.ThrowableAssert.ThrowingCallable action = () -> storage.deleteRecordingPrefix("recordings/1/");
        // then
        assertThatThrownBy(action).isInstanceOf(com.knot.backend.recording.domain.RecordingException.class);
        verify(client, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    @ParameterizedTest
    @ValueSource(ints = {403, 500})
    void listFailureIsNotSuccess(int status) {
        // given
        when(client.listObjectVersions(any(ListObjectVersionsRequest.class))).thenThrow(S3Exception.builder().statusCode(status).build());
        // when
        org.assertj.core.api.ThrowableAssert.ThrowingCallable action = () -> storage.deleteRecordingPrefix("recordings/1/");
        // then
        assertThatThrownBy(action).isInstanceOf(com.knot.backend.recording.domain.RecordingException.class);
    }
}
