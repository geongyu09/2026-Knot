package com.knot.backend.document.infrastructure.persistence;

record DocumentTranscriptSourceRow(
        long transcriptId,
        long recordingDurationMillis,
        String transcriptText
) {

}
