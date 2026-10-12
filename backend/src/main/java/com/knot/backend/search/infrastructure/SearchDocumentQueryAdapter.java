package com.knot.backend.search.infrastructure;

import com.knot.backend.search.application.SearchToolScope;
import com.knot.backend.search.application.SearchDocumentQuery;
import com.knot.backend.search.application.dto.result.SearchDocumentRecord;
import com.knot.backend.search.application.dto.query.SearchDocumentCursor;
import com.knot.backend.search.application.dto.query.SearchDocumentParameters;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class SearchDocumentQueryAdapter implements SearchDocumentQuery {
    private static final String SELECT = """
            SELECT d.id, d.title, d.topic, d.content, d.created_at, d.archived_at, r.started_at, 0 AS score
            FROM documents d JOIN recording_sessions r ON r.id = d.recording_session_id
            WHERE d.workspace_id = :workspace AND r.workspace_id = :workspace
              AND d.status = 'ARCHIVED' AND d.archived_at <= :cutoff
              AND (CAST(:topic AS text) IS NULL OR d.topic = :topic)
              AND (CAST(:from AS timestamptz) IS NULL OR r.started_at >= :from)
              AND (CAST(:before AS timestamptz) IS NULL OR r.started_at < :before)
            """;

    private final JdbcClient jdbc;

    public List<SearchDocumentRecord> listPage(
            SearchToolScope scope,
            SearchDocumentParameters parameters,
            SearchDocumentCursor cursor
    ) {
        String sql = SELECT;
        if (cursor != null) {
            sql += " AND (r.started_at, d.id) < (:lastTime, :lastId)";
        }
        sql += " ORDER BY r.started_at DESC, d.id DESC LIMIT :limit";
        JdbcClient.StatementSpec statement = filters(
                jdbc.sql(sql),
                scope,
                parameters
        );
        if (cursor != null) {
            statement.param(
                    "lastTime",
                    Timestamp.from(cursor.recordedAt())
            )
                    .param(
                            "lastId",
                            cursor.documentId()
                    );
        }
        return statement.query(this::map)
                .list();
    }

    private JdbcClient.StatementSpec filters(
            JdbcClient.StatementSpec statement,
            SearchToolScope scope,
            SearchDocumentParameters parameters
    ) {
        return statement.param(
                "workspace",
                scope.workspaceId()
        )
                .param(
                        "cutoff",
                        Timestamp.from(scope.startedAt())
                )
                .param(
                        "topic",
                        parameters.topic()
                )
                .param(
                        "from",
                        timestamp(parameters.recordedFrom())
                )
                .param(
                        "before",
                        timestamp(parameters.recordedBefore())
                )
                .param(
                        "limit",
                        parameters.size() + 1
                );
    }

    private Timestamp timestamp(Instant value) {
        if (value == null) {
            return null;
        }
        return Timestamp.from(value);
    }

    private SearchDocumentRecord map(
            ResultSet row,
            int index
    ) throws SQLException {
        return new SearchDocumentRecord(
                row.getLong("id"),
                row.getString("title"),
                row.getString("topic"),
                row.getString("content"),
                row.getTimestamp("started_at")
                        .toInstant(),
                row.getTimestamp("created_at")
                        .toInstant(),
                row.getTimestamp("archived_at")
                        .toInstant(),
                row.getInt("score")
        );
    }
}
