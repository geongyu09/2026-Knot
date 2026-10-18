#!/usr/bin/env python3
"""Connect the existing user Alloy to the local AI service; dry-run by default."""

import argparse
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import plistlib
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

SOURCE = Path(__file__).resolve().parent
LABEL = 'kr.knot.mac-metrics'
MARKER = '// Knot managed AI service connection\n'
LIMIT = 65536
STAGES = {'download', 'decode', 'model', 'result_check', 'cleanup'}
OUTCOMES = {'completed', 'failed'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def private(path, directory=False):
    info = path.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    mode = 0o700 if directory else 0o600
    if not kind(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != mode:
        raise ValueError('현재 사용자 소유의 비공개 일반 파일(0600)·디렉터리(0700)가 필요합니다')


def request(port, token=None, path='/internal/metrics'):
    headers = {} if token is None else {'Authorization': 'Bearer ' + token}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    req = urllib.request.Request('http://127.0.0.1:' + str(port) + path, headers=headers)
    try:
        with opener.open(req, timeout=3) as response:
            body = response.read(LIMIT + 1)
            if len(body) > LIMIT:
                raise ValueError('지표 응답 크기 상한을 초과했습니다')
            return response.status, body.decode('utf-8')
    except urllib.error.HTTPError as error:
        error.close()
        return error.code, ''


def metrics(body):
    samples = {}
    pattern = r'(knot_ai_[a-z_]+)(\{[^}]*\})? ([^ ]+)'
    for line in body.splitlines():
        if not line or line.startswith('#'):
            continue
        match = re.fullmatch(pattern, line)
        if not match or match.group(1, 2) in samples:
            raise ValueError('지원하는 AI 지표 형식이 아닙니다')
        try:
            value = float(match[3])
        except ValueError:
            raise ValueError('AI 지표 숫자 형식이 올바르지 않습니다') from None
        if not math.isfinite(value) or value < 0:
            raise ValueError('AI 지표 값이 유효하지 않습니다')
        samples[match.group(1, 2)] = value
    expected = {('knot_ai_' + name, None) for name in
                ('ready', 'active_jobs', 'job_elapsed_seconds')}
    for stage in STAGES:
        for name in ('stage_active', 'stage_elapsed_seconds'):
            expected.add(('knot_ai_' + name, '{stage="' + stage + '"}'))
        for outcome in OUTCOMES:
            for name in ('stage_duration_seconds_sum', 'stage_duration_seconds_count'):
                expected.add(('knot_ai_' + name, '{stage="' + stage + '",outcome="' + outcome + '"}'))
    for outcome in OUTCOMES:
        expected.add(('knot_ai_jobs_completed_total', '{outcome="' + outcome + '"}'))
    if set(samples) != expected:
        raise ValueError('필수 AI 지표·단계·결과가 없거나 지원하지 않는 라벨이 있습니다')
    for (name, _), value in samples.items():
        if name in ('knot_ai_ready', 'knot_ai_active_jobs', 'knot_ai_stage_active') and value not in (0, 1):
            raise ValueError('AI 상태 값은 0 또는 1이어야 합니다')


def probe(port, token_file):
    private(token_file.parent, directory=True)
    private(token_file)
    if token_file.stat().st_size > 4096:
        raise ValueError('토큰 파일 크기 상한을 초과했습니다')
    token = token_file.read_text().strip()
    if not re.fullmatch(r'[\x21-\x7e]{1,4096}', token):
        raise ValueError('토큰 파일 형식이 올바르지 않습니다')
    if request(port)[0] != 401:
        raise ValueError('미인증 지표 요청이 401로 거절되지 않았습니다')
    status, body = request(port, token)
    if status != 200:
        raise ValueError('AI 인증 지표를 읽지 못했습니다. 앱 버전과 토큰을 확인하세요')
    metrics(body)


def checked(args, environment=None):
    result = subprocess.run(args, env=environment, capture_output=True, timeout=30)
    if result.returncode:
        raise ValueError('명령 검증·재시작이 실패했습니다. 비공개 운영 로그를 확인하세요')


def ready():
    for _ in range(20):
        try:
            if request(12346, path='/-/ready')[0] == 200:
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise ValueError('Alloy 준비 상태를 확인하지 못했습니다')


def write_private(path, body):
    with open(path, 'x', opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
        stream.write(body)


def connection(module, token_file, port):
    return (MARKER + 'import.file "knot_service" {\n  filename = ' + json.dumps(str(module))
            + '\n}\nknot_service.metrics "service" {\n  address = "127.0.0.1:' + str(port)
            + '"\n  scope = "service"\n  token_file = ' + json.dumps(str(token_file))
            + '\n  forward_to = [prometheus.remote_write.central.receiver]\n}\n')


def connect(root, plist, token_file, port, apply=False):
    private(root, directory=True)
    private(root / 'config.alloy')
    private(plist)
    agent = plistlib.loads(plist.read_bytes())
    environment = agent.get('EnvironmentVariables', {})
    args = agent.get('ProgramArguments', [])
    if (agent.get('Label') != LABEL or len(args) != 3
            or Path(args[1]) != root / 'run.py'
            or environment.get('KNOT_MAC_CONFIG_DIR') != str(root)
            or not environment.get('KNOT_INGEST_BASE_URL')):
        raise ValueError('지원하는 기존 Mac LaunchAgent 설치가 아닙니다')
    domain = 'gui/' + str(os.getuid()) + '/' + LABEL
    checked(['launchctl', 'print', domain])
    lock = os.open(root / '.ai-service.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(lock, 'w'):
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('다른 AI 연결 작업이 진행 중입니다') from None
        return update(root, Path(args[2]), environment, domain, token_file, port, apply)


def update(root, binary, environment, domain, token_file, port, apply):
    active = root / 'config.alloy'
    before = active.read_text()
    host = (SOURCE.parent / 'config.alloy').read_text()
    module_body = (SOURCE / 'config.alloy').read_text()
    module = root / ('ai-service-' + hashlib.sha256(module_body.encode()).hexdigest()[:16] + '.alloy')
    after = host + '\n' + connection(module, token_file, port)
    # Refuse custom/validation configurations instead of guessing at an Alloy AST.
    if before not in (host, after):
        raise ValueError('기존 설정이 호스트 원본 또는 동일한 연결 설정과 다릅니다. 수동 검토가 필요합니다')
    probe(port, token_file)
    env = dict(os.environ, **environment)
    with tempfile.TemporaryDirectory(prefix='.ai-check-', dir=root) as directory:
        candidate = Path(directory)
        write_private(candidate / 'module.alloy', module_body)
        write_private(candidate / 'config.alloy', host + '\n' + connection(candidate / 'module.alloy', token_file, port))
        checked([str(binary), 'validate', str(candidate / 'config.alloy')], env)
    if not apply:
        return '인증·지표·후보 설정 검증 통과. 실제 설정은 변경하지 않았습니다'
    if module.exists():
        private(module)
        if module.read_text() != module_body:
            raise ValueError('기존 모듈 파일 내용이 다릅니다')
    else:
        write_private(module, module_body)
    if before == after:
        ready()
        return '동일 설정입니다. 중복 수집이나 재시작 없이 종료합니다'
    backup = Path(tempfile.mkdtemp(prefix='ai-service-backup-', dir=root))
    write_private(backup / 'config.alloy', before)
    write_private(backup / 'installed.alloy', after)
    write_private(backup / 'candidate.alloy', after)
    checked([str(binary), 'validate', str(backup / 'candidate.alloy')], env)
    if active.read_text() != before:
        raise ValueError('검사 중 기존 설정이 바뀌어 교체하지 않았습니다')
    try:
        (backup / 'candidate.alloy').replace(active)
        checked(['launchctl', 'kickstart', '-k', domain])
        ready()
    except BaseException:
        if active.read_text() != after:
            raise ValueError('적용 후 설정이 다른 작업으로 바뀌었습니다. 백업으로 수동 복구하세요') from None
        write_private(backup / 'restore.alloy', before)
        (backup / 'restore.alloy').replace(active)
        try:
            checked(['launchctl', 'kickstart', '-k', domain])
            ready()
        except BaseException:
            raise ValueError('원본 설정은 복원했지만 수집기 복구 확인에 실패했습니다. 백업과 host 수신을 확인하세요') from None
        raise ValueError('연결 실패로 원본 설정과 수집기를 복구했습니다') from None
    return '설정 적용·Alloy 준비 확인. 백업: ' + str(backup) + '\n중앙의 service·host 새 표본은 별도로 확인하세요'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--port', type=int, default=18765)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin' or os.getuid() == 0 or not 1 <= args.port <= 65535:
        parser.error('Mac 로그인 사용자로 실행하고 유효한 포트를 지정하세요. sudo는 사용하지 않습니다')
    os.umask(0o077)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    root = Path.home() / 'Library/Application Support/Knot/observability'
    plist = Path.home() / 'Library/LaunchAgents' / (LABEL + '.plist')
    try:
        print(connect(root, plist, args.token_file.absolute(), args.port, args.apply))
    except UnicodeError:
        print('설정·토큰·응답의 문자 인코딩이 올바르지 않습니다', file=sys.stderr)
        return 1
    except ValueError as error:
        # HTTP bodies, subprocess output and credentials are never included.
        print(str(error), file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError):
        print('연결 검사에 실패했습니다. 비공개 파일·실행 계정·로컬 앱 상태를 확인하세요', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
