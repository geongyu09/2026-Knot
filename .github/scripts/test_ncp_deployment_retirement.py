#!/usr/bin/env python3

import unittest
from pathlib import Path


WORKFLOW_DIRECTORY = Path(__file__).resolve().parents[1] / "workflows"


class NcpDeploymentRetirementTest(unittest.TestCase):
    def test_legacy_backend_dev_cd_workflow_is_removed(self) -> None:
        self.assertFalse(
            (WORKFLOW_DIRECTORY / "deploy-backend-dev.yml").exists(),
            "NCP Backend Dev CD is retired; use the existing AWS deployment pipeline.",
        )

    def test_workflows_do_not_reference_retired_ncp_deployment_credentials(self) -> None:
        workflow_files = sorted(WORKFLOW_DIRECTORY.glob("*.yml"))
        workflow_files.extend(sorted(WORKFLOW_DIRECTORY.glob("*.yaml")))
        for workflow_file in workflow_files:
            with self.subTest(workflow=workflow_file.name):
                self.assertFalse(
                    "NCP_DEV_" in workflow_file.read_text(encoding="utf-8"),
                    "Retired NCP deployment credentials must not be used by workflows.",
                )


if __name__ == "__main__":
    unittest.main()
