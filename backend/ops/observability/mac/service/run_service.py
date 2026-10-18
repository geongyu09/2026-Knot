"""launchd owns retries; this wrapper owns only its child and bounded safe logs."""

import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

import service_config as config

EVENTS = {'recording.transcription.' + name for name in
          ['accept', 'execute', 'download', 'decode', 'model', 'result_check', 'cleanup']}
OUTCOMES = {'started', 'accepted', 'replayed', 'rejected', 'completed', 'failed'}
ERRORS = {'BUSY', 'NOT_READY', 'EXECUTOR_REJECTED', 'CANCELED', 'DECODE_FAILED',
          'DECODE_TIMEOUT', 'DOWNLOAD_FAILED', 'DOWNLOAD_TIMEOUT', 'INFERENCE_FAILED',
          'INFERENCE_TIMEOUT', 'STT_FAILED', 'DIARIZATION_FAILED', 'INVALID_RESULT',
          'OUTPUT_LIMIT', 'PROCESS_CLEANUP_FAILED', 'INVALID_AUDIO_FORMAT'}
LOG_LIMIT = 2 * 1024 * 1024


def append(path, record):
    body = (json.dumps(record, separators=(',', ':')) + '\n').encode()
    if path.exists():
        config.private(path)
        if path.stat().st_size + len(body) > LOG_LIMIT:
            backup = path.with_suffix('.log.1')
            if backup.exists():
                config.private(backup)
            path.replace(backup)
    fd = os.open(path, os.O_CREAT | os.O_APPEND | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'ab') as stream:
        stream.write(body)


def safe_event(line):
    start = line.find('{"event":')
    if start < 0:
        return None
    try:
        fields = json.loads(line[start:])
        if fields.get('event') not in EVENTS or fields.get('outcome') not in OUTCOMES:
            return None
        if not isinstance(fields.get('attemptId'), str):
            return None
        attempt = str(uuid.UUID(fields['attemptId']))
        elapsed = fields['elapsedMs']
        if type(elapsed) is not int or not 0 <= elapsed <= 2**63 - 1:
            return None
        result = {'event': fields['event'], 'outcome': fields['outcome'],
                  'attemptId': attempt, 'elapsedMs': elapsed}
        if fields.get('errorCode') is not None:
            result['errorCode'] = fields['errorCode'] if fields['errorCode'] in ERRORS else 'UNKNOWN_FAILURE'
        return result
    except (ValueError, KeyError, TypeError, RecursionError):
        return None


def execute(kind, args, environment, cwd, root):
    lock = os.open(root / (kind + '.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, 'w') as held:
        config.private(root / (kind + '.lock'))
        try:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('DUPLICATE: 같은 서비스가 실행 중입니다') from None
        if kind == 'ai':
            config.vacant()
        log = root / 'logs' / (kind + '.log')
        child = subprocess.Popen(args, cwd=cwd, env=environment, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        previous = {}

        def stop(signum, _frame):
            if child.poll() is None:
                child.send_signal(signum)

        try:
            append(log, {'event': 'service.child.started', 'service': kind,
                         'pid': child.pid, 'at': int(time.time())})
            for signum in [signal.SIGTERM, signal.SIGINT]:
                previous[signum] = signal.signal(signum, stop)
            discard = False
            while line := child.stdout.readline(8193):
                ending = line.endswith(b'\n')
                if not discard and ending and len(line) <= 8192:
                    record = safe_event(line.decode('utf-8', errors='replace'))
                    if record:
                        append(log, record)
                discard = not ending
            code = child.wait()
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
            child.stdout.close()
            for signum, handler in previous.items():
                signal.signal(signum, handler)
        state_path = root / (kind + '-state.json')
        state = config.read_private(state_path) if state_path.exists() else {}
        if not isinstance(state, dict) or not isinstance(state.get('failures', []), list):
            raise ValueError('STATE_INVALID: 비공개 상태 파일을 확인하세요')
        now = int(time.time())
        failures = [t for t in state.get('failures', []) if type(t) is int and now - 300 < t <= now]
        if code:
            failures.append(now)
        state = {'last_exit_code': code, 'at': now, 'failures': failures[-20:]}
        temporary = root / (kind + '-state.tmp')
        fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(state, stream)
        temporary.replace(state_path)
        append(log, {'event': 'service.child.exited', 'service': kind, 'exitCode': code,
                     'at': now, 'diagnostic': 'RESTART_LOOP' if len(failures) >= 3 else 'CHILD_EXIT'})
        return code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['ai', 'tunnel'])
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    root = config.root_for(Path.home())
    try:
        config.private(root, True)
        config.private(root / 'logs', True)
        values, environment = config.load(args.config, Path.home())
        return execute(args.service, config.command(args.service, values), environment,
                       values['working_directory'], root)
    except (OSError, ValueError, subprocess.SubprocessError):
        # No exception text or child output: either can contain credentials or payloads.
        print('SERVICE_START_FAILED: 비공개 상태 파일과 설치 진단을 확인하세요', file=sys.stderr)
        return 75


if __name__ == '__main__':
    sys.exit(main())
