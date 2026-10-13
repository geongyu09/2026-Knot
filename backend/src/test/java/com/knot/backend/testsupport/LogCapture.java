package com.knot.backend.testsupport;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.LoggerFactory;

public final class LogCapture implements AutoCloseable {

    private final Map<Logger, Level> originalLevels = new LinkedHashMap<>();
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

    public LogCapture(Class<?>... types) {
        appender.start();
        for (Class<?> type : types) {
            Logger logger = (Logger) LoggerFactory.getLogger(type);
            originalLevels.put(
                    logger,
                    logger.getLevel()
            );
            logger.setLevel(Level.DEBUG);
            logger.addAppender(appender);
        }
    }

    public List<ILoggingEvent> events() {
        return List.copyOf(appender.list);
    }

    @Override
    public void close() {
        originalLevels.forEach(
                (
                        logger,
                        level
                ) -> {
                    logger.detachAppender(appender);
                    logger.setLevel(level);
                }
        );
        appender.stop();
    }
}
