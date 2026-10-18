"""Private inputs and fixed boundaries for the login-owned 18766 services."""

import hashlib
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import urllib.error
import urllib.request

PORT = 18766
LABELS = {'ai': 'kr.knot.macmini-ai-service', 'tunnel': 'kr.knot.macmini-service-tunnel'}
ALLOY = 'kr.knot.mac-metrics'
FIELDS = {'java', 'jar', 'working_directory', 'environment_file', 'ssh_key',
          'known_hosts', 'ssh_destination'}


def private(path, directory=False):
    path = Path(path)
    info = path.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    if (not kind(info.st_mode) or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != (0o700 if directory else 0o600)
            or path.resolve() != path):
        raise ValueError('PRIVATE_FILE: 현재 사용자 소유의 일반 파일 0600·디렉터리 0700이 필요합니다')


def read_private(path):
    path = Path(path)
    private(path.parent, True)
    private(path)
    if path.stat().st_size > 65536:
        raise ValueError('INPUT_SIZE: 비공개 설정 크기 상한을 초과했습니다')
    return json.loads(path.read_text())


def root_for(home):
    return home / 'Library/Application Support/KnotAiServer/service'


def load(path, home):
    config = read_private(path)
    if not isinstance(config, dict) or set(config) != FIELDS:
        raise ValueError('CONFIG_FIELDS: 지원하는 설정 필드가 필요합니다')
    support = home / 'Library/Application Support'
    for key in FIELDS - {'ssh_destination'}:
        value = config[key]
        if not isinstance(value, str) or any(c in value for c in '\r\n\0"'):
            raise ValueError('CONFIG_PATH: 유효한 절대 경로가 필요합니다')
        file = Path(value)
        if not file.is_absolute() or not file.exists():
            raise ValueError('CONFIG_PATH: 존재하는 절대 경로가 필요합니다')
        if key != 'java' and (file.resolve() != file or support not in file.parents):
            raise ValueError('CONFIG_PATH: 실행 입력은 사용자 Application Support 아래에 있어야 합니다')
    if not os.access(config['java'], os.X_OK) or not Path(config['jar']).is_file():
        raise ValueError('ARTIFACT: 실행 가능한 Java와 불변 JAR가 필요합니다')
    if not Path(config['working_directory']).is_dir():
        raise ValueError('CONFIG_PATH: 실행 디렉터리가 필요합니다')
    private(Path(config['environment_file']))
    private(Path(config['ssh_key']))
    private(Path(config['known_hosts']))
    if not re.fullmatch(r'(ubuntu|ec2-user)@[A-Za-z0-9][A-Za-z0-9.-]*', config['ssh_destination']):
        raise ValueError('SSH_DESTINATION: 기존 사용자와 호스트만 지정하세요')
    environment = read_private(Path(config['environment_file']))
    if (not isinstance(environment, dict) or not environment
            or any(not isinstance(k, str) or not isinstance(v, str) or '\0' in v
                   or not (re.fullmatch(r'AI_[A-Z0-9_]+', k) or k in {'PATH', 'LANG', 'LC_ALL'})
                   for k, v in environment.items())):
        raise ValueError('ENVIRONMENT: AI 설정과 PATH·언어 설정만 허용합니다')
    if environment.get('AI_PORT') != str(PORT):
        raise ValueError('PORT: 운영 AI 포트는 18766이어야 합니다')
    if not re.fullmatch(r'[\x21-\x7e]{1,4096}', environment.get('AI_APP_TOKEN', '')):
        raise ValueError('TOKEN: 기존 앱 인증 설정이 필요합니다')
    for name in ['AI_PROFILE_FILE', 'AI_RUNNER_DIRECTORY', 'AI_WORK_DIRECTORY']:
        value = Path(environment.get(name, ''))
        if (not value.is_absolute() or support not in value.parents or not value.exists()
                or value.resolve() != value):
            raise ValueError('AI_PATH: 프로파일·runner·작업 경로를 Application Support에 준비하세요')
    return config, environment


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@contextmanager
def exclusive(path, create=True):
    flags = os.O_RDWR | os.O_NOFOLLOW | (os.O_CREAT if create else 0)
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, 'w') as held:
        private(path)
        try:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('INSTALL_LOCKED: 다른 설치·원복 작업이 진행 중입니다') from None
        yield


def ssh(config):
    return ['/usr/bin/ssh', '-F', '/dev/null', '-i', config['ssh_key'], '-o', 'BatchMode=yes',
            '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', 'UserKnownHostsFile="' + config['known_hosts'] + '"',
            '-o', 'ConnectTimeout=5', '-o', 'ExitOnForwardFailure=yes',
            '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3']


def command(kind, config):
    if kind == 'ai':
        return [config['java'], '-jar', config['jar']]
    return ssh(config) + ['-NT', '-R', f'127.0.0.1:{PORT}:127.0.0.1:{PORT}',
                          config['ssh_destination']]


def vacant():
    try:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', PORT))
    except OSError:
        raise ValueError('PORT_BUSY: 18766을 점유한 기존 실행은 자동 종료하지 않습니다') from None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def health(token=None):
    headers = {} if token is None else {'Authorization': 'Bearer ' + token}
    request = urllib.request.Request(f'http://127.0.0.1:{PORT}/health', headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=3) as response:
            body = response.read(4097)
            return response.status if len(body) <= 4096 and json.loads(body).get('status') == 'UP' else 0
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        return status
    except (OSError, ValueError):
        return 0


def checked(args, **kwargs):
    result = subprocess.run(args, capture_output=True, text=True, timeout=15, **kwargs)
    if result.returncode:
        raise ValueError('COMMAND_FAILED: 비공개 상태 진단과 종료 코드를 확인하세요')
    return result.stdout
