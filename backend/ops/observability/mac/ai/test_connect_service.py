"""Exercise HTTP rejection and reversible installation without a production service."""
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import plistlib
import tempfile
import threading
import unittest
from unittest.mock import patch

import connect_service as service


def exposition():
    lines = ['knot_ai_ready 1', 'knot_ai_active_jobs 0', 'knot_ai_job_elapsed_seconds 0']
    for stage in sorted(service.STAGES):
        for name in ('stage_active', 'stage_elapsed_seconds'):
            lines.append('knot_ai_' + name + '{stage="' + stage + '"} 0')
        for outcome in sorted(service.OUTCOMES):
            for name in ('stage_duration_seconds_sum', 'stage_duration_seconds_count'):
                lines.append('knot_ai_' + name + '{stage="' + stage + '",outcome="' + outcome + '"} 0')
    for outcome in sorted(service.OUTCOMES):
        lines.append('knot_ai_jobs_completed_total{outcome="' + outcome + '"} 0')
    return '\n'.join(lines) + '\n'


class ConnectionTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.token = self.root / 'token'
        service.write_private(self.token, 'fixture-token')
        self.config = self.root / 'config.alloy'
        self.host = (service.SOURCE.parent / 'config.alloy').read_text()
        service.write_private(self.config, self.host)
        self.plist = self.root / 'agent.plist'
        agent = {'Label': service.LABEL, 'ProgramArguments': ['/fixture/python', str(self.root / 'run.py'), '/fixture/alloy'],
                 'EnvironmentVariables': {'KNOT_MAC_CONFIG_DIR': str(self.root), 'KNOT_INGEST_BASE_URL': 'https://ingest.invalid'}}
        self.plist.write_bytes(plistlib.dumps(agent))
        self.plist.chmod(0o600)
        self.body = exposition()
        self.auth_status = 200
        self.anonymous_status = 401
        self.requests = []
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.requests.append(self.path)
                authorized = self.headers.get('Authorization') == 'Bearer fixture-token'
                status = owner.auth_status if authorized else owner.anonymous_status
                self.send_response(status)
                if status == 302:
                    self.send_header('Location', '/must-not-follow')
                self.end_headers()
                self.wfile.write(owner.body.encode())

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.port = self.server.server_port
        self.commands = patch.object(service, 'checked').start()
        self.health = patch.object(service, 'ready').start()
        self.addCleanup(patch.stopall)

    def connect(self, apply=False):
        return service.connect(self.root, self.plist, self.token, self.port, apply)

    def test_dry_run_preserves_active_config_and_never_restarts(self):
        result = self.connect()
        self.assertIn('변경하지', result)
        self.assertEqual(self.config.read_text(), self.host)
        self.assertEqual(self.requests, ['/internal/metrics', '/internal/metrics'])
        self.assertFalse(list(self.root.glob('ai-service-*.alloy')))
        self.assertFalse(list(self.root.glob('ai-service-backup-*')))
        self.assertFalse(any('kickstart' in call.args[0] for call in self.commands.call_args_list))

    def test_apply_keeps_host_secrets_wal_and_backup_then_is_idempotent(self):
        service.write_private(self.root / 'wal-sentinel', 'existing samples')
        self.connect(apply=True)
        after = self.config.read_text()
        self.assertTrue(after.startswith(self.host))
        self.assertEqual(after.count('knot_service.metrics "service"'), 1)
        self.assertNotIn('fixture-token', after)
        backup, = self.root.glob('ai-service-backup-*')
        self.assertEqual((backup / 'config.alloy').read_text(), self.host)
        self.assertEqual((self.root / 'wal-sentinel').read_text(), 'existing samples')
        calls = len(self.commands.call_args_list)
        self.assertIn('동일 설정', self.connect(apply=True))
        self.assertFalse(any('kickstart' in c.args[0] for c in self.commands.call_args_list[calls:]))
        self.assertEqual(self.config.read_text(), after)

    def test_bad_auth_and_unsupported_endpoint_preserve_config(self):
        for status in (401, 403, 404, 503):
            with self.subTest(status=status):
                self.auth_status = status
                with self.assertRaises(ValueError):
                    self.connect(apply=True)
                self.assertEqual(self.config.read_text(), self.host)

    def test_unauthenticated_endpoint_is_rejected(self):
        self.anonymous_status = 200
        with self.assertRaisesRegex(ValueError, '401'):
            self.connect()

    def test_redirect_is_never_followed(self):
        self.auth_status = 302
        with self.assertRaises(ValueError):
            self.connect()
        self.assertNotIn('/must-not-follow', self.requests)

    def test_oversized_body_is_rejected(self):
        self.body = 'x' * (service.LIMIT + 1)
        with self.assertRaisesRegex(ValueError, '크기'):
            self.connect()

    def test_missing_duplicate_invalid_and_unexpected_metrics_are_rejected(self):
        for body in ('knot_ai_ready 1\n', exposition() + 'knot_ai_ready 1\n',
                     exposition().replace('knot_ai_ready 1', 'knot_ai_ready NaN'),
                     exposition().replace('knot_ai_active_jobs 0', 'knot_ai_active_jobs 2'),
                     exposition() + 'knot_ai_secret{token="fixture-token"} 1\n',
                     exposition().replace('knot_ai_ready 1', 'knot_ai_ready fixture-token')):
            with self.subTest(body_length=len(body)):
                self.body = body
                with self.assertRaises(ValueError) as result:
                    self.connect()
                self.assertNotIn('fixture-token', str(result.exception))

    def test_public_or_symlink_token_is_rejected(self):
        self.token.chmod(0o644)
        with self.assertRaises(ValueError):
            self.connect()
        self.token.rename(self.root / 'real-token')
        self.token.symlink_to(self.root / 'real-token')
        with self.assertRaises(ValueError):
            self.connect()

    def test_custom_or_validation_config_is_not_overwritten(self):
        self.config.write_text(self.host + '\n// existing validation or operator changes\n')
        before = self.config.read_bytes()
        with self.assertRaisesRegex(ValueError, '수동 검토'):
            self.connect(apply=True)
        self.assertEqual(self.config.read_bytes(), before)

    def test_alloy_validation_failure_does_not_replace_config(self):
        self.commands.side_effect = [None, ValueError('validation failed')]
        with self.assertRaises(ValueError):
            self.connect(apply=True)
        self.assertEqual(self.config.read_text(), self.host)

    def test_restart_failure_restores_config_and_restarts_original(self):
        self.commands.side_effect = [None, None, None, ValueError('restart failed'), None]
        with self.assertRaisesRegex(ValueError, '원본 설정과 수집기를 복구'):
            self.connect(apply=True)
        self.assertEqual(self.config.read_text(), self.host)
        self.assertEqual(sum('kickstart' in c.args[0] for c in self.commands.call_args_list), 2)

    def test_readiness_failure_restores_config(self):
        self.health.side_effect = [ValueError('not ready'), None]
        with self.assertRaisesRegex(ValueError, '복구했습니다'):
            self.connect(apply=True)
        self.assertEqual(self.config.read_text(), self.host)

    def test_rollback_failure_is_not_reported_as_success(self):
        self.health.side_effect = ValueError('not ready')
        with self.assertRaisesRegex(ValueError, '복구 확인에 실패'):
            self.connect(apply=True)
        self.assertEqual(self.config.read_text(), self.host)

    def test_parallel_install_is_rejected(self):
        with (self.root / '.ai-service.lock').open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError, '다른 AI 연결'):
                self.connect(apply=True)

    def test_operator_change_during_restart_is_not_destroyed_by_rollback(self):
        def changed():
            self.config.write_text('operator new configuration')
            raise ValueError('health failed')
        self.health.side_effect = changed
        with self.assertRaisesRegex(ValueError, '다른 작업'):
            self.connect(apply=True)
        self.assertEqual(self.config.read_text(), 'operator new configuration')


if __name__ == '__main__':
    unittest.main()
