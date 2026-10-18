"""Transactional installer tests with private temp files and fake launchctl only."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import threading
import time
import unittest
from unittest.mock import patch

import install_service as installer
import service_config as config
import test_service_runtime as runtime


class InstallServiceTest(unittest.TestCase):
    def setUp(self):
        fixture = runtime.ServiceRuntimeTest()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.home, self.root = fixture.home, fixture.root
        self.input_file, self.values = fixture.config_path, fixture.values
        self.write = fixture.write
        self.agents = installer.agents_for(self.home)
        self.agents.mkdir(mode=0o700)
        self.preserved = {}
        for label in [config.ALLOY, 'kr.knot.macmini-ai', 'kr.knot.macmini-dev-tunnel']:
            path = self.agents / (label + '.plist')
            path.write_bytes(plistlib.dumps({'Label': label, 'RunAtLoad': True, 'KeepAlive': True}))
            path.chmod(0o600)
            self.preserved[path] = path.read_bytes()
        self.loaded = {config.ALLOY: {'loaded': True}, 'kr.knot.macmini-ai': {'loaded': True}}
        self.calls, self.bootstrap_count = [], 0
        self.fail_bootstrap = None
        self.after_bootout = None
        for target, replacement in [
            ('query', self.query), ('ready', lambda *_: None),
        ]:
            mocked = patch.object(installer, target, replacement)
            mocked.start()
            self.addCleanup(mocked.stop)
        checked = patch.object(config, 'checked', self.checked)
        checked.start()
        self.addCleanup(checked.stop)
        vacant = patch.object(config, 'vacant')
        self.vacant = vacant.start()
        self.addCleanup(vacant.stop)

    def query(self, label):
        return dict(self.loaded.get(label, {'loaded': False}))

    def checked(self, args, **kwargs):
        self.calls.append((list(args), kwargs))
        if args[0] == 'plutil':
            result = subprocess.run(args, capture_output=True, text=True, timeout=5, **kwargs)
            if result.returncode:
                raise ValueError('PLIST_LINT: fixture plist failed real plutil validation')
            return result.stdout
        if args[:2] == ['launchctl', 'bootstrap']:
            self.bootstrap_count += 1
            if self.bootstrap_count == self.fail_bootstrap:
                raise ValueError('FIXTURE_BOOTSTRAP: requested failure')
            path = Path(args[-1])
            label = plistlib.loads(path.read_bytes())['Label']
            self.loaded[label] = {'loaded': True, 'path': str(path), 'state': 'running'}
        elif args[:2] == ['launchctl', 'bootout']:
            self.loaded.pop(args[-1].split('/')[-1], None)
            if self.after_bootout:
                callback, self.after_bootout = self.after_bootout, None
                callback()
        elif args[0] not in ['launchctl', '/usr/bin/ssh-keygen']:
            raise AssertionError('Unexpected external command: ' + args[0])
        return ''

    def install(self, apply=True):
        return installer.install(self.home, self.input_file, apply=apply)

    def snapshot(self):
        return {str(p.relative_to(self.home)): (hashlib.sha256(p.read_bytes()).hexdigest(),
                                               p.stat().st_mode & 0o777)
                for p in self.home.rglob('*') if p.is_file()}

    def assert_preserved(self):
        for path, body in self.preserved.items():
            self.assertEqual(path.read_bytes(), body)
        self.assertTrue(self.query(config.ALLOY)['loaded'])
        self.assertTrue(self.query('kr.knot.macmini-ai')['loaded'])

    @contextmanager
    def held_install_lock(self):
        source = ('import fcntl,os,sys,time; '
                  'f=open(sys.argv[1],"a+"); os.chmod(sys.argv[1],0o600); '
                  'fcntl.flock(f,fcntl.LOCK_EX); print("locked",flush=True); time.sleep(30)')
        holder = subprocess.Popen(
            [sys.executable, '-u', '-c', source, str(self.root / 'install.lock')],
            stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(holder.stdout.readline().strip(), 'locked')
            yield
        finally:
            holder.terminate()
            holder.wait(timeout=5)
            holder.stdout.close()

    def test_dry_run_is_unchanged_and_real_plutil_accepts_stdin(self):
        # given
        before = self.snapshot()
        # when
        result = self.install(apply=False)
        # then
        self.assertEqual(result['status'], 'validated')
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(len([args for args, _ in self.calls if args[0] == 'plutil']), 2)
        self.assertFalse(any(args[:2] == ['launchctl', 'bootstrap'] for args, _ in self.calls))

    def test_two_plists_are_login_owned_bounded_and_secret_free(self):
        # given
        bodies = installer.plists(self.root)
        # when
        values = {kind: plistlib.loads(body) for kind, body in bodies.items()}
        # then
        self.assertEqual(set(values), {'ai', 'tunnel'})
        for kind, value in values.items():
            self.assertEqual(value['Label'], config.LABELS[kind])
            self.assertTrue(value['RunAtLoad'])
            self.assertTrue(value['KeepAlive'])
            self.assertEqual(value['LimitLoadToSessionType'], 'Aqua')
            self.assertEqual(value['ThrottleInterval'], 30)
            self.assertEqual(value['Umask'], 0o077)
            self.assertEqual(value['StandardOutPath'], '/dev/null')
            self.assertEqual(value['ProgramArguments'][-2:], ['--config', str(self.root / 'runtime.json')])
            self.assertNotIn('fixture-secret-token', bodies[kind].decode())

    def test_install_private_hash_receipt_and_idempotent_no_bootstrap(self):
        # given
        first = self.install()
        before = self.snapshot()
        count = self.bootstrap_count
        # when
        second = self.install()
        manifest = json.loads((self.root / 'receipt.json').read_text())
        # then
        self.assertEqual((first['status'], second['status']), ('installed', 'unchanged'))
        self.assertEqual(self.bootstrap_count, count)
        self.assertEqual(self.snapshot(), before)
        for name, expected in manifest['files'].items():
            path = Path(name)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), expected)
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        for directory in [self.root, self.root / 'logs', self.root / 'backups', Path(first['backup'])]:
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual((Path(first['backup']) / 'receipt.json').read_bytes(),
                         (self.root / 'receipt.json').read_bytes())
        self.assert_preserved()

    def test_bootstrap_first_or_second_failure_rolls_back_only_owned_files(self):
        # given
        files = installer.assets(self.root, self.agents, self.values)
        # when
        for failure in [1, 2]:
            self.fail_bootstrap = failure
            self.bootstrap_count = 0
            with self.subTest(stage=failure):
                with self.assertRaisesRegex(ValueError, 'INSTALL_FAILED_RESTORED'):
                    self.install()
                # then
                self.assertFalse(any(path.exists() for path in files))
                self.assertFalse((self.root / 'receipt.json').exists())
                self.assertFalse(any(self.query(label)['loaded'] for label in config.LABELS.values()))
                self.assert_preserved()

    def test_readiness_failure_rolls_back_both_registrations(self):
        # given
        with patch.object(installer, 'ready', side_effect=ValueError('READINESS: fixture')):
            # when
            with self.assertRaisesRegex(ValueError, 'INSTALL_FAILED_RESTORED'):
                self.install()
        # then
        self.assertFalse((self.root / 'receipt.json').exists())
        self.assertFalse(any(self.query(label)['loaded'] for label in config.LABELS.values()))
        self.assert_preserved()

    def test_existing_port_or_target_label_is_refused_before_writes(self):
        # given
        before = self.snapshot()
        # when
        self.vacant.side_effect = ValueError('PORT_BUSY: fixture')
        with self.assertRaisesRegex(ValueError, 'PORT_BUSY'):
            self.install()
        self.vacant.side_effect = None
        self.loaded[config.LABELS['ai']] = {'loaded': True, 'path': '/fixture/other.plist'}
        with self.assertRaisesRegex(ValueError, 'INSTALL_CONFLICT'):
            self.install()
        # then
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.bootstrap_count, 0)

    def test_install_real_flock_contention_preserves_files_and_labels(self):
        # given
        with self.held_install_lock():
            before, loaded = self.snapshot(), dict(self.loaded)
            # when
            with self.assertRaisesRegex(ValueError, 'INSTALL_LOCKED'):
                self.install()
            # then
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(self.loaded, loaded)
            self.assertEqual(self.bootstrap_count, 0)
            self.assert_preserved()

    def test_restore_real_flock_contention_preserves_files_and_labels(self):
        # given
        result = self.install()
        with self.held_install_lock():
            before, loaded = self.snapshot(), dict(self.loaded)
            call_count = len(self.calls)
            # when
            with self.assertRaisesRegex(ValueError, 'INSTALL_LOCKED'):
                installer.restore(self.home, Path(result['backup']), apply=True)
            # then
            self.assertEqual(self.snapshot(), before)
            self.assertEqual(self.loaded, loaded)
            self.assertEqual(len(self.calls), call_count)
            self.assert_preserved()

    def test_idempotent_install_rejects_other_job_registered_under_same_label(self):
        # given
        self.install()
        self.loaded[config.LABELS['ai']]['path'] = '/fixture/other-job.plist'
        before, loaded = self.snapshot(), dict(self.loaded)
        count = self.bootstrap_count
        # when
        with self.assertRaisesRegex(ValueError, 'PARTIAL_REGISTRATION'):
            self.install()
        # then
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.loaded, loaded)
        self.assertEqual(self.bootstrap_count, count)
        self.assert_preserved()

    def test_environment_or_jar_changed_after_preflight_is_rejected_under_lock(self):
        # given
        files = installer.assets(self.root, self.agents, self.values)
        # when
        for name in ['environment_file', 'jar']:
            source = Path(self.values[name])
            original = source.read_bytes()
            calls = []

            def mutate_on_locked_check():
                calls.append(True)
                if len(calls) == 2:
                    source.write_bytes(original + b'\n')

            self.vacant.side_effect = mutate_on_locked_check
            try:
                with self.subTest(source=name):
                    with self.assertRaisesRegex(ValueError, 'INPUT_CHANGED'):
                        self.install()
                    # then
                    self.assertEqual(len(calls), 2)
                    self.assertEqual(source.read_bytes(), original + b'\n')
                    self.assertFalse(any(path.exists() for path in files))
                    self.assertFalse((self.root / 'receipt.json').exists())
                    self.assertEqual(self.bootstrap_count, 0)
                    self.assert_preserved()
            finally:
                source.write_bytes(original)
                self.vacant.side_effect = None

    def test_restore_dry_run_preserves_registration_and_files(self):
        # given
        result = self.install()
        before, loaded = self.snapshot(), dict(self.loaded)
        # when
        restored = installer.restore(self.home, Path(result['backup']), apply=False)
        # then
        self.assertEqual(restored['status'], 'restore_validated')
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.loaded, loaded)

    def test_restore_rejects_receipt_scope_tampering(self):
        # given
        result = self.install()
        receipt = Path(result['backup']) / 'receipt.json'
        manifest = json.loads(receipt.read_text())
        manifest['files'][str(self.agents / (config.ALLOY + '.plist'))] = '0' * 64
        self.write(receipt, manifest)
        # when
        with self.assertRaisesRegex(ValueError, 'BACKUP'):
            installer.restore(self.home, Path(result['backup']), apply=True)
        # then
        self.assert_preserved()
        self.assertTrue(all(self.query(label)['loaded'] for label in config.LABELS.values()))

    def test_restore_preserves_user_file_edits(self):
        # given
        result = self.install()
        edited = self.root / 'run_service.py'
        edited.write_text('# fixture user edit\n')
        before = self.snapshot()
        # when
        with self.assertRaisesRegex(ValueError, 'RECOVERY_CONFLICT'):
            installer.restore(self.home, Path(result['backup']), apply=True)
        # then
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(all(self.query(label)['loaded'] for label in config.LABELS.values()))

    def test_restore_rechecks_edits_after_bootout(self):
        # given
        result = self.install()
        edited = self.root / 'run_service.py'
        self.after_bootout = lambda: edited.write_text('# concurrent fixture edit\n')
        # when
        with self.assertRaisesRegex(ValueError, 'RECOVERY_CONFLICT'):
            installer.restore(self.home, Path(result['backup']), apply=True)
        # then
        self.assertEqual(edited.read_text(), '# concurrent fixture edit\n')
        self.assertTrue((self.root / 'receipt.json').exists())
        self.assert_preserved()

    def test_restore_rejects_loaded_label_from_different_path(self):
        # given
        result = self.install()
        self.loaded[config.LABELS['ai']]['path'] = '/fixture/unrelated.plist'
        before = self.snapshot()
        # when
        with self.assertRaisesRegex(ValueError, 'LABEL_OWNER'):
            installer.restore(self.home, Path(result['backup']), apply=True)
        # then
        self.assertEqual(self.snapshot(), before)
        self.assertTrue(self.query(config.LABELS['ai'])['loaded'])

    def test_status_bounds_failure_window_without_changing_state(self):
        # given
        now = int(time.time())
        path = self.root / 'ai-state.json'
        self.write(path, {'failures': [now - 1000, now - 3, now - 2, now - 1, now + 1000, 'private']})
        before = self.snapshot()
        # when
        result = installer.status(self.home)
        # then
        self.assertEqual(result['recent_failures']['ai'], {'count': 3, 'diagnostic': 'RESTART_LOOP'})
        self.assertEqual(self.snapshot(), before)

    def test_status_detects_repeated_start_failure_without_child_state_file(self):
        # given
        label = config.LABELS['ai']
        before = self.snapshot()
        cases = [('3', '75', True), ('2', '75', False), ('3', '0', False),
                 ('3', '(never exited)', False), ('unknown', '75', False)]
        # when
        for runs, exit_code, expected in cases:
            self.loaded[label] = {'loaded': True, 'runs': runs, 'last exit code': exit_code}
            result = installer.status(self.home)
            # then
            with self.subTest(runs=runs, exit_code=exit_code):
                self.assertEqual(result['services'][label].get('diagnostic'),
                                 'REPEATED_START_FAILURE' if expected else None)
                self.assertEqual(result['recent_failures'], {})
                self.assertFalse((self.root / 'ai-state.json').exists())
                self.assertEqual(self.snapshot(), before)

    def test_remote_health_uses_token_only_on_encrypted_stdin(self):
        # given
        captured = []

        def checked(args, **kwargs):
            captured.append((args, kwargs))
            return '{"status":200}'

        # when
        with patch.object(config, 'checked', checked):
            success = installer.remote_health(self.values, 'fixture-private-remote-token')
        # then
        self.assertTrue(success)
        args, kwargs = captured[0]
        self.assertNotIn('fixture-private-remote-token', ' '.join(args))
        self.assertEqual(json.loads(kwargs['input']), {'token': 'fixture-private-remote-token'})
        compile(installer.REMOTE_PROBE, '<remote-probe>', 'exec')

    def test_remote_probe_real_http_authentication_and_redirect_refusal(self):
        # given
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.path, self.headers.get('Authorization')))
                self.send_response(302 if self.server.redirect else 200)
                if self.server.redirect:
                    self.send_header('Location', '/must-not-follow')
                self.end_headers()
                self.wfile.write(b'{"status":"UP"}')

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        server.redirect = False
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        source = installer.REMOTE_PROBE.replace('127.0.0.1:18766', '127.0.0.1:' + str(server.server_port))
        results = []
        try:
            # when
            for redirect in [False, True]:
                server.redirect = redirect
                process = subprocess.run([sys.executable, '-c', source],
                                         input=json.dumps({'token': 'fixture-token'}),
                                         capture_output=True, text=True, timeout=5)
                self.assertEqual(process.returncode, 0)
                results.append(json.loads(process.stdout)['status'])
            # then
            self.assertEqual(results, [200, 302])
            self.assertEqual(requests, [('/health', 'Bearer fixture-token'),
                                        ('/health', 'Bearer fixture-token')])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
