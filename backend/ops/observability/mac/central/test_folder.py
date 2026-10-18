import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

import retire_old_folder as migration


ROOT = Path(__file__).resolve().parents[2]


class FolderTest(unittest.TestCase):
    def snapshot(self):
        return {
            "children": [], "rules": [], "oldPermissions": [], "newPermissions": [],
            "dashboards": {uid: {"dashboard": {"uid": uid},
                "meta": {"folderUid": migration.NEW, "provisioned": True}}
                for uid in migration.DASHBOARDS},
        }

    def test_folder_and_all_dashboard_uids_are_disjoint(self):
        # given
        provider = (ROOT / "provisioning/dashboards/knot-mac.yml").read_text()
        folders = [line.split(":", 1)[1].strip() for line in provider.splitlines() if "folderUid:" in line]
        dashboards = [json.loads(p.read_text())["uid"]
                      for p in (ROOT / "provisioning/mac-dashboards").glob("*.json")]
        # when
        collisions = set(folders) & set(dashboards)
        # then
        self.assertFalse(collisions)
        self.assertEqual(len(dashboards), len(set(dashboards)))

    def test_valid_migration(self):
        # given
        snapshot = self.snapshot()
        # when
        result = migration.assert_safe(snapshot)
        # then
        self.assertIsNone(result)

    def test_unsafe_migrations_are_rejected(self):
        # given
        changes = [lambda s: s.update(children=[{"uid": "unexpected"}]),
                   lambda s: s.update(rules=[{"folderUID": migration.OLD}]),
                   lambda s: s["dashboards"]["knot-mac"]["meta"].update(folderUid=migration.OLD),
                   lambda s: s["dashboards"]["knot-mac"]["meta"].update(provisioned=False),
                   lambda s: s.update(oldPermissions=[{"role": "Viewer", "permission": 1}])]
        for change in changes:
            with self.subTest(change=change):
                snapshot = copy.deepcopy(self.snapshot())
                change(snapshot)
                # when / then
                with self.assertRaises(ValueError):
                    migration.assert_safe(snapshot)

    def test_dry_run_has_no_mutations(self):
        # given
        snapshot = self.snapshot()
        api = Mock(side_effect=[{}, [], [], *snapshot["dashboards"].values(), [], []])
        # when
        migration.retire(api, None)
        # then
        self.assertTrue(all(c.args[0] == "GET" for c in api.call_args_list))

    def test_folder_changed_after_inspection_is_not_deleted(self):
        # given
        snapshot = self.snapshot()
        api = Mock(side_effect=[{}, [], [], *snapshot["dashboards"].values(), [], [], [{"uid": "new"}]])
        with tempfile.TemporaryDirectory() as directory:
            # when / then
            with self.assertRaises(ValueError):
                migration.retire(api, Path(directory) / "backup.json", True)
        self.assertTrue(all(c.args[0] == "GET" for c in api.call_args_list))

    def test_existing_backup_prevents_delete(self):
        # given
        snapshot = self.snapshot()
        api = Mock(side_effect=[{}, [], [], *snapshot["dashboards"].values(), [], []])
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / "backup.json"
            backup.write_text("existing backup")
            # when / then
            with self.assertRaises(FileExistsError):
                migration.retire(api, backup, True)
            self.assertEqual(backup.read_text(), "existing backup")
        self.assertTrue(all(c.args[0] == "GET" for c in api.call_args_list))

    def test_redirect_never_forwards_credentials(self):
        # when / then
        with self.assertRaises(RuntimeError):
            migration.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com")

    def test_custom_permissions_stop_before_provisioning(self):
        # given
        api = Mock(side_effect=[{}, [{"type": "dash-db", "uid": uid} for uid in migration.DASHBOARDS],
                                [{"role": "Viewer", "permission": 1}]])
        # when / then
        with self.assertRaisesRegex(ValueError, "사용자 지정 권한"):
            migration.preflight(api)
        self.assertTrue(all(c.args[0] == "GET" for c in api.call_args_list))



if __name__ == "__main__":
    unittest.main()
