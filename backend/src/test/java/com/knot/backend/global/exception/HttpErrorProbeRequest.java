package com.knot.backend.global.exception;

import jakarta.validation.constraints.NotBlank;

record HttpErrorProbeRequest(@NotBlank String value) {
}
