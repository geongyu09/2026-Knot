"""Isolated pinned-Grafana regression: legacy -> migration -> restart -> fresh install.

Requires Docker. Does not contact production. --keep retains the migrated instance
for browser inspection; the printed cleanup commands remove only this test's assets.
"""
import argparse
import base64
import json
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen

import retire_old_folder


ROOT = Path(__file__).resolve().parents[2]
IMAGE = "grafana/grafana@sha256:b28bae15e219c998fb0e0424ed724930cc61b1f61fb404d47c862f9a23f9e572"


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=13505)
    parser.add_argument("--keep", action="store_true")
    args = parser.parse_args()
    work = Path(tempfile.mkdtemp(prefix="knot-grafana-805-"))
    name = work.name
    password = secrets.token_urlsafe(32)
    (work / "password").write_text(password)
    (work / "password").chmod(0o600)
    auth = "Basic " + base64.b64encode(("knot-admin:" + password).encode()).decode()
    provider = work / "providers"
    dashboards = work / "dashboards"
    provider.mkdir()
    shutil.copytree(ROOT / "provisioning/mac-dashboards", dashboards)
    source = ROOT / "provisioning/dashboards/knot-mac.yml"
    legacy = source.read_text().replace("folder: Knot Mac", "folder: Knot-mac").replace(
        "folderUid: knot-mac-folder", "folderUid: knot-mac")
    (provider / source.name).write_text(legacy)
    for file in dashboards.glob("*.json"):
        file.write_text(file.read_text().replace('"version": 2', '"version": 1'))
    env = work / "env"
    env.write_text("GF_SECURITY_ADMIN_USER=knot-admin\nGF_SECURITY_ADMIN_PASSWORD=" + password
                   + "\nGF_ANALYTICS_REPORTING_ENABLED=false\nGF_ANALYTICS_CHECK_FOR_UPDATES=false\n"
                   + "GF_PLUGINS_PREINSTALL_DISABLED=true\n")
    env.chmod(0o600)
    def api(method, path):
        request = Request(f"http://127.0.0.1:{args.port}" + path, method=method,
                          headers={"Authorization": auth})
        with urlopen(request, timeout=5) as response:
            return json.load(response)
    def ready():
        for _ in range(90):
            try:
                if api("GET", "/api/health")["database"] == "ok":
                    return
            except (OSError, ValueError):
                pass
            time.sleep(1)
        raise RuntimeError("격리 Grafana 시작 시간 초과")
    def start(volume):
        docker("run", "-d", "--name", name, "--env-file", str(env),
               "--memory", "1g", "-p", f"127.0.0.1:{args.port}:3000",
               "-v", str(provider) + ":/etc/grafana/provisioning/dashboards:ro",
               "-v", str(dashboards) + ":/etc/grafana/provisioning/mac-dashboards:ro",
               "-v", volume + ":/var/lib/grafana", IMAGE)
        ready()
    def read_dashboards():
        return {uid: api("GET", "/api/dashboards/uid/" + uid) for uid in retire_old_folder.DASHBOARDS}
    volumes = [name + "-legacy", name + "-fresh"]
    success = False
    try:
        start(volumes[0])
        before = read_dashboards()
        assert all(d["meta"]["folderUid"] == "knot-mac" for d in before.values())
        assert api("GET", "/api/folders/knot-mac")["uid"] == "knot-mac"
        print(retire_old_folder.preflight(api), flush=True)
        print("PASS: legacy folder/dashboard UID collision reproduced", flush=True)
        (provider / source.name).write_text(source.read_text())
        for file in (ROOT / "provisioning/mac-dashboards").glob("*.json"):
            shutil.copyfile(file, dashboards / file.name)
        docker("restart", name)
        ready()
        after = read_dashboards()
        for uid, item in after.items():
            assert item["meta"]["folderUid"] == retire_old_folder.NEW
            assert item["dashboard"]["id"] == before[uid]["dashboard"]["id"]
            assert {k: v for k, v in item["dashboard"].items() if k != "version"} == {
                k: v for k, v in before[uid]["dashboard"].items() if k != "version"}
        print(retire_old_folder.retire(api, None), flush=True)
        print(retire_old_folder.retire(api, work / "migration.json", True), flush=True)
        assert "변경 없음" in retire_old_folder.retire(api, None)
        assert len(api("GET", "/api/search?type=dash-folder")) == 1
        docker("restart", name)
        ready()
        assert read_dashboards() == after
        print("PASS: moved dashboard IDs/panels preserved; cleanup and restart stable", flush=True)
        docker("rm", "-f", name)
        start(volumes[1])
        assert all(d["meta"]["folderUid"] == retire_old_folder.NEW for d in read_dashboards().values())
        assert len(api("GET", "/api/search?type=dash-folder")) == 1
        print("PASS: fresh install has one folder and both dashboards", flush=True)
        docker("rm", "-f", name)
        if args.keep:
            start(volumes[0])
        success = True
    finally:
        if not (success and args.keep):
            subprocess.run(["docker", "rm", "-f", name], capture_output=True)
            for volume in volumes:
                subprocess.run(["docker", "volume", "rm", volume], capture_output=True)
            shutil.rmtree(work)
        else:
            print(f"Browser: http://127.0.0.1:{args.port}/dashboards; user: knot-admin; password file: {work / 'password'}")
            print(f"Cleanup: docker rm -f {name}; docker volume rm {' '.join(volumes)}; remove {work}")


if __name__ == "__main__":
    main()
