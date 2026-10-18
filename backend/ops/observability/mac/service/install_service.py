#!/usr/bin/env python3
"""Inspect by default; explicitly install or restore only the two login services."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shlex
import subprocess
import sys
import time
import uuid

import service_config as config

SOURCE = Path(__file__).resolve().parent
RUNTIME_FILES = ['service_config.py', 'run_service.py']
# Authentication travels over encrypted stdin, never in SSH argv or diagnostics.
REMOTE_PROBE = '''import json,urllib.request,urllib.error
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args): return None
token=json.load(__import__('sys').stdin)['token']
request=urllib.request.Request('http://127.0.0.1:18766/health',headers={'Authorization':'Bearer '+token})
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
try:
 with opener.open(request,timeout=3) as response:
  body=response.read(4097)
  status=response.status if len(body)<=4096 and json.loads(body).get('status')=='UP' else 0
except urllib.error.HTTPError as error:
 status=error.code
 error.close()
except Exception: status=0
print(json.dumps({'status':status}))
'''


def query(label):
    result = subprocess.run(['launchctl', 'print', f'gui/{os.getuid()}/' + label],
                            capture_output=True, text=True, timeout=10)
    if result.returncode:
        if 'Could not find service' in result.stderr:
            return {'loaded': False}
        raise ValueError('LAUNCH_QUERY: 로그인 세션의 서비스 상태를 확인하지 못했습니다')
    fields = {'loaded': True}
    for key in ['state', 'pid', 'runs', 'last exit code', 'path']:
        match = re.search(r'^\s*' + re.escape(key) + r' = (.+)$', result.stdout, re.M)
        if match:
            fields[key] = match[1]
    return fields


def agents_for(home):
    return home / 'Library/LaunchAgents'


def plists(root):
    return {kind: plistlib.dumps({
        'Label': label, 'ProgramArguments': [sys.executable, str(root / 'run_service.py'),
                                            kind, '--config', str(root / 'runtime.json')],
        'WorkingDirectory': str(root), 'RunAtLoad': True, 'KeepAlive': True,
        'LimitLoadToSessionType': 'Aqua', 'ThrottleInterval': 30, 'ExitTimeOut': 30,
        'Umask': 0o077, 'StandardOutPath': '/dev/null', 'StandardErrorPath': '/dev/null',
    }) for kind, label in config.LABELS.items()}


def assets(root, agents, values):
    files = {root / name: (SOURCE / name).read_bytes() for name in RUNTIME_FILES}
    files[root / 'runtime.json'] = (json.dumps(values, sort_keys=True) + '\n').encode()
    files.update({agents / (config.LABELS[kind] + '.plist'): body for kind, body in plists(root).items()})
    return files


def fingerprint(values, files):
    identities = {str(path): hashlib.sha256(body).hexdigest() for path, body in files.items()}
    identities['environment'] = config.digest(values['environment_file'])
    identities['jar'] = config.digest(values['jar'])
    return hashlib.sha256(json.dumps(identities, sort_keys=True).encode()).hexdigest()


def remote_health(values, token):
    args = config.ssh(values) + [values['ssh_destination'], 'python3 -c ' + shlex.quote(REMOTE_PROBE)]
    try:
        body = config.checked(args, input=json.dumps({'token': token}))
        return len(body) <= 4096 and json.loads(body).get('status') == 200
    except (ValueError, OSError, subprocess.SubprocessError):
        return False


def ready(values, environment, attempts=15):
    for _ in range(attempts):
        if (config.health() == 401 and config.health(environment['AI_APP_TOKEN']) == 200
                and remote_health(values, environment['AI_APP_TOKEN'])):
            return
        time.sleep(1)
    raise ValueError('READINESS: 로컬·터널 경유 인증 health가 준비되지 않았습니다')


def prerequisites(home):
    alloy = agents_for(home) / (config.ALLOY + '.plist')
    config.private(alloy)
    value = plistlib.loads(alloy.read_bytes())
    if not value.get('RunAtLoad') or value.get('KeepAlive') is not True or not query(config.ALLOY)['loaded']:
        raise ValueError('ALLOY: 기존 로그인 자동 시작 수집기를 먼저 확인하세요')
    disabled = config.checked(['launchctl', 'print-disabled', f'gui/{os.getuid()}'])
    for label in [*config.LABELS.values(), config.ALLOY]:
        if re.search(r'"' + re.escape(label) + r'"\s*=>\s*true', disabled):
            raise ValueError('DISABLED: 명시적으로 비활성화된 서비스를 자동 변경하지 않습니다')


def write_new(path, body):
    temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex + '.tmp')
    fd = os.open(temporary, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(body)
        # Same-directory link publishes the completed inode without replacing another writer.
        os.link(temporary, path, follow_symlinks=False)
    finally:
        temporary.unlink(missing_ok=True)


def validate_manifest(root, agents, backup):
    config.private(root, True)
    if backup.parent != root / 'backups' or not re.fullmatch(r'[a-f0-9]{32}', backup.name):
        raise ValueError('BACKUP: 이 설치의 백업 경로만 사용하세요')
    receipt = backup / 'receipt.json'
    manifest = config.read_private(receipt)
    allowed = {str(root / name) for name in [*RUNTIME_FILES, 'runtime.json']}
    allowed.update(str(agents / (label + '.plist')) for label in config.LABELS.values())
    if set(manifest.get('files', {})) != allowed or manifest.get('labels') != list(config.LABELS.values()):
        raise ValueError('BACKUP: 백업의 설치 범위가 다릅니다')
    active = root / 'receipt.json'
    if not active.exists() or config.digest(active) != config.digest(receipt):
        raise ValueError('RECOVERY_CONFLICT: 현재 설치 기록이 바뀌었습니다')
    config.private(active)
    for name, expected in manifest['files'].items():
        path = Path(name)
        if path.exists():
            config.private(path)
            if config.digest(path) != expected:
                raise ValueError('RECOVERY_CONFLICT: 후속 변경을 보존하고 원복을 중단합니다')
    return manifest


def restore(home, backup, apply=False, _locked=False):
    root, agents = config.root_for(home), agents_for(home)
    if apply and not _locked:
        config.private(root, True)
        with config.exclusive(root / 'install.lock', create=False):
            return restore(home, backup, apply=True, _locked=True)
    manifest = validate_manifest(root, agents, backup)
    states = {label: query(label) for label in config.LABELS.values()}
    for label, state in states.items():
        plist = agents / (label + '.plist')
        if state['loaded'] and (not plist.exists() or state.get('path') != str(plist)):
            raise ValueError('LABEL_OWNER: 다른 등록이나 변경된 서비스를 종료하지 않습니다')
    if not apply:
        return {'status': 'restore_validated'}
    for label, state in states.items():
        if state['loaded']:
            config.checked(['launchctl', 'bootout', f'gui/{os.getuid()}/' + label])
    # Recheck after bootout; a concurrent editor must not lose their file changes.
    validate_manifest(root, agents, backup)
    for name in manifest['files']:
        Path(name).unlink(missing_ok=True)
    (root / 'receipt.json').unlink()
    return {'status': 'restored', 'backup': str(backup)}


def install(home, input_file, apply=False):
    root, agents = config.root_for(home), agents_for(home)
    values, environment = config.load(input_file, home)
    prerequisites(home)
    files = assets(root, agents, values)
    identity = fingerprint(values, files)
    for body in plists(root).values():
        config.checked(['plutil', '-lint', '-'], input=body.decode())
    host = values['ssh_destination'].split('@')[1]
    config.checked(['/usr/bin/ssh-keygen', '-F', host, '-f', values['known_hosts']])
    receipt = root / 'receipt.json'
    if receipt.exists():
        manifest = config.read_private(receipt)
        backup = Path(manifest.get('backup', ''))
        validate_manifest(root, agents, backup)
        if manifest.get('fingerprint') != identity or any(not p.exists() for p in files):
            raise ValueError('INSTALL_CONFLICT: 설치 내용이 다릅니다. 기존 설치를 먼저 검토하세요')
        states = {label: query(label) for label in config.LABELS.values()}
        if any(not state['loaded'] or state.get('path') != str(agents / (label + '.plist'))
               for label, state in states.items()):
            raise ValueError('PARTIAL_REGISTRATION: 상태 진단과 원복 절차를 확인하세요')
        ready(values, environment)
        return {'status': 'unchanged', 'backup': str(backup)}
    if any(query(label)['loaded'] for label in config.LABELS.values()) or any(p.exists() for p in files):
        raise ValueError('INSTALL_CONFLICT: 기존 등록·파일은 자동 교체하지 않습니다')
    config.vacant()
    if not apply:
        return {'status': 'validated', 'requires': 'apply', 'port': config.PORT}
    for path in [root, root / 'logs', root / 'backups']:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        config.private(path, True)
    with config.exclusive(root / 'install.lock'):
        # A second installer may have passed the earlier read-only preflight.
        if receipt.exists() or any(p.exists() for p in files):
            raise ValueError('INSTALL_CONFLICT: 검사 후 설치 상태가 바뀌었습니다')
        config.vacant()
        if fingerprint(values, files) != identity:
            raise ValueError('INPUT_CHANGED: 검사 후 환경 파일이나 JAR가 바뀌었습니다')
        backup = root / 'backups' / uuid.uuid4().hex
        backup.mkdir(mode=0o700)
        manifest = {'fingerprint': identity, 'backup': str(backup),
                    'labels': list(config.LABELS.values()),
                    'files': {str(p): hashlib.sha256(b).hexdigest() for p, b in files.items()}}
        body = (json.dumps(manifest, sort_keys=True) + '\n').encode()
        recorded = False
        try:
            write_new(backup / 'receipt.json', body)
            write_new(receipt, body)
            recorded = True
            for path, content in files.items():
                write_new(path, content)
            for label in config.LABELS.values():
                config.checked(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(agents / (label + '.plist'))])
            ready(values, environment)
        except BaseException:
            if recorded:
                restore(home, backup, apply=True, _locked=True)
            raise ValueError('INSTALL_FAILED_RESTORED: 신규 등록과 파일을 원복했습니다') from None
        return {'status': 'installed', 'backup': str(backup)}


def status(home):
    root = config.root_for(home)
    out = {'services': {label: query(label) for label in [*config.LABELS.values(), config.ALLOY]}}
    for label in config.LABELS.values():
        state = out['services'][label]
        if (state.get('runs', '').isdigit() and int(state['runs']) >= 3
                and state.get('last exit code') not in (None, '0', '(never exited)')):
            state['diagnostic'] = 'REPEATED_START_FAILURE'
    out['recent_failures'] = {}
    for kind in config.LABELS:
        path = root / (kind + '-state.json')
        if path.exists():
            state = config.read_private(path)
            failures = [t for t in state.get('failures', []) if type(t) is int and time.time() - 300 < t <= time.time()]
            out['recent_failures'][kind] = {'count': len(failures),
                                          'diagnostic': 'RESTART_LOOP' if len(failures) >= 3 else 'NONE'}
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['install', 'restore', 'status'])
    parser.add_argument('--config', type=Path)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin' or os.getuid() == 0:
        parser.error('Mac 로그인 사용자로 실행하세요. sudo는 사용하지 않습니다')
    os.umask(0o077)
    try:
        if args.operation == 'install' and args.config:
            result = install(Path.home(), args.config.absolute(), args.apply)
        elif args.operation == 'restore' and args.backup:
            result = restore(Path.home(), args.backup.absolute(), args.apply)
        elif args.operation == 'status' and not args.apply:
            result = status(Path.home())
        else:
            parser.error('install은 --config, restore는 --backup이 필요합니다')
        print(json.dumps(result, ensure_ascii=False))
    except ValueError as error:
        # Only our fixed diagnostics are emitted; decoder/command details stay private.
        code = str(error).split(':', 1)[0]
        print(code if re.fullmatch(r'[A-Z_]+', code) else 'INVALID_PRIVATE_INPUT', file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError):
        print('SERVICE_OPERATION_FAILED', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
