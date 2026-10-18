"""Isolated runtime checks: no launchctl, SSH, real AI port, or private inputs."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

import run_service
import service_config


class ServiceRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name).resolve()
        self.home.chmod(0o700)
        self.support = self.home / 'Library/Application Support/KnotAiServer'
        self.root = service_config.root_for(self.home)
        self.root.mkdir(parents=True, mode=0o700)
        (self.root / 'logs').mkdir(mode=0o700)
        for path in self.root.parents:
            if path == self.home:
                break
            path.chmod(0o700)
        self.environment = {
            'AI_PORT': '18766', 'AI_APP_TOKEN': 'fixture-secret-token',
            'AI_PROFILE_FILE': str(self.support / 'profile.json'),
            'AI_RUNNER_DIRECTORY': str(self.support / 'runner'),
            'AI_WORK_DIRECTORY': str(self.support / 'work'),
        }
        self.write(self.support / 'profile.json', {})
        (self.support / 'runner').mkdir(mode=0o700)
        (self.support / 'work').mkdir(mode=0o700)
        self.env_path = self.root / 'environment.json'
        self.write(self.env_path, self.environment)
        self.values = {
            'java': str(Path(sys.executable).resolve()),
            'jar': str(self.support / 'fixture.jar'),
            'working_directory': str(self.support),
            'environment_file': str(self.env_path),
            'ssh_key': str(self.support / 'fixture-key'),
            'known_hosts': str(self.support / 'fixture-known-hosts'),
            'ssh_destination': 'ubuntu@fixture.invalid',
        }
        for key in ['jar', 'ssh_key', 'known_hosts']:
            self.write(Path(self.values[key]), {})
        self.config_path = self.root / 'config.json'
        self.write(self.config_path, self.values)

    def write(self, path, value):
        path.write_text(json.dumps(value))
        path.chmod(0o600)

    def load(self):
        return service_config.load(self.config_path, self.home)

    def execute(self, source):
        return run_service.execute('tunnel', [sys.executable, '-u', '-c', source],
                                   {'PATH': os.defpath}, self.root, self.root)

    def records(self):
        return [json.loads(line) for line in (self.root / 'logs/tunnel.log').read_text().splitlines()]

    def test_private_config_and_environment_round_trip(self):
        # given
        expected = self.values, self.environment
        # when
        actual = self.load()
        # then
        self.assertEqual(expected, actual)

    def test_private_file_and_parent_modes_are_required(self):
        # given
        cases = [(self.config_path, 0o644), (self.root, 0o755),
                 (self.env_path, 0o644), (Path(self.values['ssh_key']), 0o644)]
        # when
        for path, mode in cases:
            original = path.stat().st_mode & 0o777
            path.chmod(mode)
            with self.subTest(path=path.name):
                # then
                with self.assertRaisesRegex(ValueError, 'PRIVATE_FILE'):
                    self.load()
            path.chmod(original)

    def test_config_file_and_parent_symlinks_are_rejected(self):
        # given
        link = self.root / 'alias.json'
        link.symlink_to(self.config_path)
        directory_link = self.home / 'alias-directory'
        directory_link.symlink_to(self.root, target_is_directory=True)
        # when
        for path in [link, directory_link / 'config.json']:
            with self.subTest(path=path):
                # then
                with self.assertRaisesRegex(ValueError, 'PRIVATE_FILE'):
                    service_config.read_private(path)

    def test_unsafe_environment_and_wrong_port_are_rejected(self):
        # given
        cases = [('JAVA_TOOL_OPTIONS', '-javaagent:fixture', 'ENVIRONMENT'),
                 ('AI_APP_TOKEN', 'line\nbreak', 'TOKEN'),
                 ('AI_PORT', '18765', 'PORT'), ('AI_EXTRA', 5, 'ENVIRONMENT')]
        # when
        for key, value, error in cases:
            environment = dict(self.environment, **{key: value})
            self.write(self.env_path, environment)
            with self.subTest(key=key):
                # then
                with self.assertRaisesRegex(ValueError, error):
                    self.load()

    def test_artifact_outside_application_support_is_rejected(self):
        # given
        outside = self.home / 'outside.jar'
        self.write(outside, {})
        self.write(self.config_path, dict(self.values, jar=str(outside)))
        # when
        # then
        with self.assertRaisesRegex(ValueError, 'CONFIG_PATH'):
            self.load()

    def test_artifact_symlink_inside_support_is_rejected(self):
        # given
        alias = self.support / 'alias.jar'
        alias.symlink_to(self.values['jar'])
        self.write(self.config_path, dict(self.values, jar=str(alias)))
        # when
        # then
        with self.assertRaisesRegex(ValueError, 'CONFIG_PATH'):
            self.load()

    def test_ai_inputs_cannot_escape_support_through_symlinks(self):
        # given
        outside = self.home / 'external-input'
        outside.mkdir(mode=0o700)
        link = self.support / 'escaped-input'
        link.symlink_to(outside, target_is_directory=True)
        # when
        for name in ['AI_PROFILE_FILE', 'AI_RUNNER_DIRECTORY', 'AI_WORK_DIRECTORY']:
            self.write(self.env_path, dict(self.environment, **{name: str(link)}))
            with self.subTest(name=name):
                # then
                with self.assertRaisesRegex(ValueError, 'AI_PATH'):
                    self.load()

    def test_ssh_command_pins_identity_trust_keepalive_and_only_reverse_port(self):
        # given
        values, _ = self.load()
        # when
        command = service_config.command('tunnel', values)
        # then
        self.assertEqual(command, [
            '/usr/bin/ssh', '-F', '/dev/null', '-i', values['ssh_key'], '-o', 'BatchMode=yes',
            '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'UserKnownHostsFile="' + values['known_hosts'] + '"',
            '-o', 'ConnectTimeout=5', '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
            '-NT', '-R', '127.0.0.1:18766:127.0.0.1:18766', values['ssh_destination']])

    def test_health_uses_authentication_and_does_not_follow_redirect(self):
        # given
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, self.headers.get('Authorization')))
                code = 401 if not self.headers.get('Authorization') else 200
                if self.server.redirect:
                    code = 302
                self.send_response(code)
                if code == 302:
                    self.send_header('Location', '/must-not-follow')
                self.end_headers()
                self.wfile.write(b'{"status":"UP"}')

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.redirect = False
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with patch.object(service_config, 'PORT', server.server_port):
                # when
                anonymous = service_config.health()
                authenticated = service_config.health('fixture-token')
                server.redirect = True
                redirected = service_config.health('fixture-token')
            # then
            self.assertEqual((anonymous, authenticated, redirected), (401, 200, 302))
            self.assertEqual(requests, [('/health', None), ('/health', 'Bearer fixture-token'),
                                        ('/health', 'Bearer fixture-token')])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)

    def test_vacant_detects_real_ephemeral_port_conflict(self):
        # given
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
            # when
            with patch.object(service_config, 'PORT', port):
                # then
                with self.assertRaisesRegex(ValueError, 'PORT_BUSY'):
                    service_config.vacant()
        with patch.object(service_config, 'PORT', port):
            service_config.vacant()

    def test_real_child_filters_secrets_payloads_unknown_fields_and_long_lines(self):
        # given
        attempt = str(uuid.uuid4())
        event = {'event': 'recording.transcription.execute', 'outcome': 'failed',
                 'attemptId': attempt, 'elapsedMs': 42, 'errorCode': 'INFERENCE_TIMEOUT',
                 'token': 'fixture-secret-token', 'transcript': 'fixture-private-transcript',
                 'unknown': 'fixture-private-unknown'}
        source = ('import json\nprint("fixture-secret-token")\n'
                  'print("fixture-private-transcript")\n'
                  'print("x" * 9000 + ' + repr(json.dumps(event)) + ')\n'
                  'print(' + repr(json.dumps(event)) + ')\n')
        # when
        code = self.execute(source)
        records = self.records()
        # then
        self.assertEqual(code, 0)
        self.assertEqual(len(records), 3)
        expected = {key: event[key] for key in
                    ['event', 'outcome', 'attemptId', 'elapsedMs', 'errorCode']}
        self.assertIs(type(records[1]['observedAtMs']), int)
        self.assertEqual(records[1], dict(expected, observedAtMs=records[1]['observedAtMs']))
        persisted = (self.root / 'logs/tunnel.log').read_text()
        for secret in ['fixture-secret-token', 'fixture-private-transcript', 'fixture-private-unknown']:
            self.assertNotIn(secret, persisted)

    def test_invalid_safe_events_cannot_persist_unbounded_values(self):
        # given
        event = {'event': 'recording.transcription.execute', 'outcome': 'started',
                 'attemptId': str(uuid.uuid4()), 'elapsedMs': 0}
        cases = [('event', 'unknown'), ('outcome', 'unknown'), ('attemptId', 'private-text'),
                 ('elapsedMs', True), ('elapsedMs', -1), ('elapsedMs', 2**63)]
        # when
        for key, value in cases:
            record = dict(event, **{key: value})
            # then
            with self.subTest(key=key, value=value):
                self.assertIsNone(run_service.safe_event(json.dumps(record)))
        unknown = run_service.safe_event(json.dumps(dict(event, errorCode='private-error')))
        self.assertEqual(unknown['errorCode'], 'UNKNOWN_FAILURE')

    def test_safe_event_rejects_non_string_uuid_without_raising(self):
        # given
        event = {'event': 'recording.transcription.execute', 'outcome': 'started',
                 'elapsedMs': 0}
        # when
        for attempt in [123, True, None, [], {}, 1.5]:
            with self.subTest(attempt=attempt):
                record = json.dumps(dict(event, attemptId=attempt))
                # then
                self.assertIsNone(run_service.safe_event(record))

    def test_safe_event_rejects_deep_unknown_json_without_raising(self):
        # given
        line = ('{"event":"recording.transcription.execute","outcome":"started",'
                '"attemptId":"' + str(uuid.uuid4()) + '","elapsedMs":0,"unknown":'
                + '[' * 1100 + '0' + ']' * 1100 + '}')
        self.assertLess(len(line.encode()), 8192)
        decoder = json.JSONDecoder()
        decoder.scan_once = json.scanner.py_make_scanner(decoder)
        # Python 3.14's accelerated scanner accepts this depth; use stdlib's
        # recursive reference decoder to exercise the portable failure branch.
        # when
        with patch.object(run_service.json, 'loads', decoder.decode):
            actual = run_service.safe_event(line)
        # then
        self.assertIsNone(actual)

    def assert_malformed_child_line_does_not_stop_service(self, malformed):
        marker = self.root / 'child-followup-marker'
        normal = {'event': 'recording.transcription.execute', 'outcome': 'completed',
                  'attemptId': str(uuid.uuid4()), 'elapsedMs': 12}
        with_secret = dict(normal, transcript='fixture-private-transcript',
                           token='fixture-secret-token')
        source = ('import time\nfrom pathlib import Path\n'
                  'print(' + repr(malformed) + ',flush=True)\n'
                  'time.sleep(0.05)\n'
                  'print(' + repr(json.dumps(with_secret)) + ',flush=True)\n'
                  'Path(' + repr(str(marker)) + ').write_text("finished")\n')
        code = self.execute(source)
        self.assertEqual(code, 0)
        self.assertEqual(marker.read_text(), 'finished')
        records = self.records()
        self.assertIs(type(records[1]['observedAtMs']), int)
        self.assertEqual(records[1], dict(normal, observedAtMs=records[1]['observedAtMs']))
        self.assertEqual(len(records), 3)
        self.assertEqual(records[-1]['exitCode'], 0)
        state = json.loads((self.root / 'tunnel-state.json').read_text())
        self.assertEqual(state['last_exit_code'], 0)
        persisted = (self.root / 'logs/tunnel.log').read_text()
        self.assertNotIn('fixture-private-transcript', persisted)
        self.assertNotIn('fixture-secret-token', persisted)

    def test_real_child_non_string_uuid_does_not_interrupt_followup_or_exit(self):
        # given
        malformed = json.dumps({'event': 'recording.transcription.execute', 'outcome': 'started',
                                'attemptId': 123, 'elapsedMs': 0,
                                'transcript': 'fixture-private-transcript'})
        # when
        # then
        self.assert_malformed_child_line_does_not_stop_service(malformed)

    def test_real_child_deep_json_does_not_interrupt_followup_or_exit(self):
        # given
        malformed = ('{"event":"recording.transcription.execute","outcome":"started",'
                     '"attemptId":"' + str(uuid.uuid4()) + '","elapsedMs":0,"unknown":'
                     + '[' * 1100 + '0' + ']' * 1100 + '}')
        self.assertLess(len(malformed.encode()), 8192)
        decoder = json.JSONDecoder()
        decoder.scan_once = json.scanner.py_make_scanner(decoder)
        # when
        # then
        with patch.object(run_service.json, 'loads', decoder.decode):
            self.assert_malformed_child_line_does_not_stop_service(malformed)

    def test_child_exit_records_bounded_restart_loop_state(self):
        # given
        self.write(self.root / 'tunnel-state.json', {'failures': [int(time.time()) - 1000]})
        # when
        codes = [self.execute('import sys; sys.exit(7)') for _ in range(3)]
        state = json.loads((self.root / 'tunnel-state.json').read_text())
        # then
        self.assertEqual(codes, [7, 7, 7])
        self.assertEqual(state['last_exit_code'], 7)
        self.assertEqual(len(state['failures']), 3)
        self.assertEqual(self.records()[-1]['diagnostic'], 'RESTART_LOOP')
        self.assertEqual((self.root / 'tunnel-state.json').stat().st_mode & 0o777, 0o600)

    def test_stage_observation_timestamp_comes_from_wrapper_clock(self):
        # given
        event = {'event': 'recording.transcription.execute', 'outcome': 'completed',
                 'attemptId': str(uuid.uuid4()), 'elapsedMs': 5,
                 'observedAtMs': 'fixture-untrusted-timestamp', 'timestamp': 'fixture-private-timestamp'}
        # when
        with patch.object(run_service.time, 'time_ns', return_value=1792310000123456789):
            record = run_service.safe_event(json.dumps(event))
        # then
        self.assertEqual(record['observedAtMs'], 1792310000123)
        self.assertNotIn('timestamp', record)
        self.assertNotIn('fixture-private-timestamp', json.dumps(record))

    def test_error_allowlist_matches_actual_ai_enum_and_rejects_arbitrary_text(self):
        # given
        source = (Path(__file__).resolve().parents[5] / 'ai-server/src/main/java/com/knot/ai/'
                  'transcription/domain/TranscriptionErrorCode.java')
        codes = set(re.findall(r'^    ([A-Z][A-Z_]+)\(', source.read_text(), re.M))
        event = {'event': 'recording.transcription.execute', 'outcome': 'failed',
                 'attemptId': str(uuid.uuid4()), 'elapsedMs': 5}
        self.assertTrue(codes)
        # when
        preserved = {code: run_service.safe_event(json.dumps(dict(event, errorCode=code)))['errorCode']
                     for code in codes}
        unknown = run_service.safe_event(json.dumps(dict(event, errorCode='fixture-private-error')))
        # then
        self.assertEqual(run_service.ERRORS, codes)
        self.assertEqual(preserved, {code: code for code in codes})
        self.assertEqual(unknown['errorCode'], 'UNKNOWN_FAILURE')

    def test_sigterm_reaps_term_ignoring_child_with_open_pipe_within_bound(self):
        # given
        ready = self.root / 'ignoring-child-ready'
        module = str(Path(run_service.__file__).parent)
        child_source = ('import os,signal,sys,time\nfrom pathlib import Path\n'
                        'signal.signal(signal.SIGTERM,signal.SIG_IGN)\n'
                        'Path(' + repr(str(ready)) + ').write_text(str(os.getpid()))\n'
                        'sys.stdout.write("fixture-open-pipe");sys.stdout.flush()\ntime.sleep(30)\n')
        wrapper_source = ('import sys\nfrom pathlib import Path\nsys.path.insert(0,' + repr(module) + ')\n'
                          'import run_service\nrun_service.STOP_TIMEOUT=0.15\n'
                          'run_service.execute("tunnel",[sys.executable,"-u","-c",'
                          + repr(child_source) + '],{},Path(' + repr(str(self.root)) + '),Path('
                          + repr(str(self.root)) + '))\n')
        wrapper = subprocess.Popen([sys.executable, '-u', '-c', wrapper_source],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   start_new_session=True)
        try:
            deadline = time.monotonic() + 3
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(0.01)
            self.assertTrue(ready.exists())
            child_pid = int(ready.read_text())
            # when
            started = time.monotonic()
            wrapper.send_signal(signal.SIGTERM)
            stdout, stderr = wrapper.communicate(timeout=2)
            # then
            self.assertLess(time.monotonic() - started, 2)
            self.assertEqual((wrapper.returncode, stdout, stderr), (0, b'', b''))
            with self.assertRaises(ProcessLookupError):
                os.kill(child_pid, 0)
            state = json.loads((self.root / 'tunnel-state.json').read_text())
            self.assertEqual(state['last_exit_code'], -signal.SIGKILL)
        finally:
            # Only the fresh fixture process group belongs to this test.
            try:
                os.killpg(wrapper.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            wrapper.communicate(timeout=3)

    def test_real_fcntl_singleton_contention_blocks_child_start(self):
        # given
        lock = self.root / 'tunnel.lock'
        source = ('import fcntl,os,sys,time; '
                  'f=open(sys.argv[1],"w"); os.chmod(sys.argv[1],0o600); '
                  'fcntl.flock(f,fcntl.LOCK_EX); print("locked",flush=True); time.sleep(30)')
        holder = subprocess.Popen([sys.executable, '-u', '-c', source, str(lock)],
                                  stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(holder.stdout.readline().strip(), 'locked')
            # when
            # then
            with self.assertRaisesRegex(ValueError, 'DUPLICATE'):
                self.execute('raise SystemExit("must not start")')
            self.assertFalse((self.root / 'logs/tunnel.log').exists())
        finally:
            holder.terminate()
            holder.wait(timeout=5)
            holder.stdout.close()

    def test_sigterm_reaches_owned_child_and_restores_handler(self):
        # given
        ready = self.root / 'ready'
        previous = signal.getsignal(signal.SIGTERM)
        source = ('import signal,sys,time; from pathlib import Path; '
                  'signal.signal(signal.SIGTERM,lambda *_:sys.exit(0)); '
                  'Path(' + repr(str(ready)) + ').write_text("ready"); time.sleep(30)')
        delivered = threading.Event()

        def terminate_fixture():
            deadline = time.monotonic() + 5
            while (not ready.exists() or signal.getsignal(signal.SIGTERM) == previous) and time.monotonic() < deadline:
                time.sleep(0.01)
            if ready.exists() and signal.getsignal(signal.SIGTERM) != previous:
                os.kill(os.getpid(), signal.SIGTERM)
                delivered.set()

        thread = threading.Thread(target=terminate_fixture, daemon=True)
        thread.start()
        # when
        code = self.execute(source)
        thread.join(timeout=6)
        # then
        self.assertTrue(delivered.is_set())
        self.assertEqual(code, 0)
        self.assertEqual(signal.getsignal(signal.SIGTERM), previous)
        self.assertEqual(self.records()[-1]['event'], 'service.child.exited')

    def test_rotation_preserves_private_files_and_rejects_unsafe_backup(self):
        # given
        log = self.root / 'logs/fixture.log'
        record = {'event': 'fixture', 'value': 'x' * 40}
        # when
        with patch.object(run_service, 'LOG_LIMIT', 100):
            run_service.append(log, record)
            run_service.append(log, record)
        backup = log.with_suffix('.log.1')
        # then
        for path in [log, backup]:
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text()), record)
        backup.chmod(0o644)
        with patch.object(run_service, 'LOG_LIMIT', 100):
            with self.assertRaisesRegex(ValueError, 'PRIVATE_FILE'):
                run_service.append(log, record)


if __name__ == '__main__':
    unittest.main()
