"""Remove only the empty legacy folder after file provisioning has moved both dashboards.

Run on the Grafana host during a maintenance window. Default is read-only.
An offline Grafana volume backup is still required; this export is an audit record.
"""
import argparse
import base64
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


OLD = "knot-mac"
NEW = "knot-mac-folder"
DASHBOARDS = ("knot-mac", "knot-mac-ai")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError("인증 정보 보호를 위해 리다이렉트를 거부합니다")


def permission_keys(entries):
    return sorted((p.get("role", ""), p.get("userId", 0), p.get("teamId", 0),
                   p["permission"]) for p in entries)


def preflight(api):
    folder = api("GET", "/api/folders/" + OLD)
    children = api("GET", "/api/search?folderUIDs=" + OLD + "&limit=1000")
    if folder.get("parentUid") or sorted((c["type"], c["uid"]) for c in children) != [
            ("dash-db", uid) for uid in DASHBOARDS]:
        raise ValueError("예상과 다른 폴더 구조입니다. 이동 전에 확인하세요")
    acl = api("GET", "/api/folders/" + OLD + "/permissions")
    if permission_keys(acl) != [("Editor", 0, 0, 2), ("Viewer", 0, 0, 1)]:
        raise ValueError("사용자 지정 권한입니다. 자동 이동하지 말고 권한 보존을 먼저 계획하세요")
    if any(r["folderUID"] == OLD for r in api("GET", "/api/v1/provisioning/alert-rules")):
        raise ValueError("기존 폴더에 알림 규칙이 있어 이동을 중단합니다")
    try:
        api("GET", "/api/folders/" + NEW)
    except HTTPError as error:
        if error.code == 404:
            return "이동 전 기본 권한·기존 폴더 구조 확인 완료"
        raise
    raise ValueError("새 폴더 UID가 이미 존재합니다. 기존 작업 상태를 확인하세요")


def assert_safe(snapshot):
    if snapshot["children"]:
        raise ValueError("기존 폴더가 비어 있지 않아 중단합니다")
    if any(rule["folderUID"] == OLD for rule in snapshot["rules"]):
        raise ValueError("기존 폴더에 알림 규칙이 있어 중단합니다")
    for uid in DASHBOARDS:
        item = snapshot["dashboards"][uid]
        if item["dashboard"]["uid"] != uid or item["meta"]["folderUid"] != NEW:
            raise ValueError("대시보드의 새 폴더 이동을 확인할 수 없습니다")
        if not item["meta"]["provisioned"]:
            raise ValueError("파일 프로비저닝 상태가 아니므로 중단합니다")
    if permission_keys(snapshot["oldPermissions"]) != permission_keys(snapshot["newPermissions"]):
        raise ValueError("폴더 권한이 달라 중단합니다. 기존 권한을 먼저 보존하세요")


def retire(api, backup, apply=False):
    try:
        folder = api("GET", "/api/folders/" + OLD)
    except HTTPError as error:
        if error.code == 404:
            return "기존 폴더가 없습니다. 변경 없음"
        raise
    snapshot = {
        "folder": folder,
        "children": api("GET", "/api/search?folderUIDs=" + OLD + "&limit=1000"),
        "rules": api("GET", "/api/v1/provisioning/alert-rules"),
        "dashboards": {uid: api("GET", "/api/dashboards/uid/" + uid) for uid in DASHBOARDS},
        "oldPermissions": api("GET", "/api/folders/" + OLD + "/permissions"),
        "newPermissions": api("GET", "/api/folders/" + NEW + "/permissions"),
    }
    assert_safe(snapshot)
    if not apply:
        return "이동·권한·빈 폴더 확인 완료. 읽기 전용 검사이며 삭제하지 않았습니다"
    if backup is None:
        raise ValueError("--apply에는 새 --backup 파일 경로가 필요합니다")
    with os.fdopen(os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
        json.dump(snapshot, out, ensure_ascii=False, indent=2)
    # Recheck immediately before the only mutation. Do not use forceDeleteRules.
    if api("GET", "/api/search?folderUIDs=" + OLD + "&limit=1000"):
        raise ValueError("검사 후 폴더 내용이 변경되어 중단합니다")
    api("DELETE", "/api/folders/" + OLD)
    for uid in DASHBOARDS:
        current = api("GET", "/api/dashboards/uid/" + uid)
        if current["dashboard"] != snapshot["dashboards"][uid]["dashboard"]:
            raise RuntimeError("삭제 후 대시보드가 변경되었습니다. 백업과 상태를 확인하세요")
    return "빈 기존 폴더 삭제와 대시보드 보존 확인 완료"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--password-file", type=Path, required=True)
    parser.add_argument("--port", type=int, default=3000)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--preflight", action="store_true", help="파일 교체 전 기본 권한·구조 검사")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535 or any(c in args.domain for c in "\r\n/:"):
        parser.error("포트 또는 도메인 형식이 잘못되었습니다")
    if args.preflight and args.apply:
        parser.error("--preflight와 --apply는 함께 사용할 수 없습니다")
    auth = base64.b64encode(("knot-admin:" + args.password_file.read_text().strip()).encode()).decode()
    opener = build_opener(ProxyHandler({}), NoRedirect())
    def api(method, path):
        request = Request(f"http://127.0.0.1:{args.port}" + path, method=method,
                          headers={"Authorization": "Basic " + auth, "Host": args.domain})
        with opener.open(request, timeout=15) as response:
            return json.load(response)
    print(preflight(api) if args.preflight else retire(api, args.backup, args.apply))


if __name__ == "__main__":
    main()
