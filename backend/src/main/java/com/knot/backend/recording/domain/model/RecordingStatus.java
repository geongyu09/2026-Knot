package com.knot.backend.recording.domain.model;

import java.util.Set;

public enum RecordingStatus {
    RECORDING,
    PAUSED,
    ENDED,
    DISCARDED;

    public static final Set<RecordingStatus> ACTIVE_STATUSES = Set.of(
            RECORDING,
            PAUSED
    );
}
