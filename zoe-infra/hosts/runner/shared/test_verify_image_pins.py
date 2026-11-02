import copy
import unittest
from pathlib import Path
from importlib.util import module_from_spec, spec_from_file_location

path = Path(__file__).with_name("verify-image-pins.py")
spec = spec_from_file_location("verify_image_pins", path)
module = module_from_spec(spec)
spec.loader.exec_module(module)

OWNER = "jhector1"
RUNNER = f"ghcr.io/{OWNER}/zoeskoul-runner@sha256:" + "a" * 64
RUNTIME = f"ghcr.io/{OWNER}/zoeskoul-runtime@sha256:" + "b" * 64


class ImagePinTests(unittest.TestCase):
    def setUp(self):
        self.env = {
            "GHCR_OWNER": "Jhector1",
            "RUNNER_SERVICE_IMAGE_REF": RUNNER,
            "RUNNER_IMAGE_REF": RUNTIME,
        }
        self.config = {"services": {"runner": {"image": RUNNER, "environment": {"RUNNER_IMAGE": RUNTIME}}}}

    def test_both_digests_verified(self):
        module.verify(self.config, self.env)

    def test_prod_fallback_denied(self):
        for key in ("RUNNER_SERVICE_IMAGE_REF", "RUNNER_IMAGE_REF"):
            env = self.env.copy()
            env[key] = "ghcr.io/jhector1/zoeskoul-runner:prod"
            with self.assertRaises(ValueError):
                module.verify(self.config, env)

    def test_compose_override_denied(self):
        for key, value in (("image", "runner"), ("RUNNER_IMAGE", "runtime")):
            config = copy.deepcopy(self.config)
            if key == "image":
                config["services"]["runner"][key] = "ghcr.io/jhector1/zoeskoul-runner:prod"
            else:
                config["services"]["runner"]["environment"][key] = "ghcr.io/jhector1/zoeskoul-runtime:prod"
            with self.assertRaises(ValueError):
                module.verify(config, self.env)

    def test_missing_pin_denied(self):
        env = self.env.copy()
        del env["RUNNER_IMAGE_REF"]
        with self.assertRaises(ValueError):
            module.verify(self.config, env)

    def test_wrong_repository_denied(self):
        env = self.env.copy()
        env["RUNNER_SERVICE_IMAGE_REF"] = RUNTIME
        with self.assertRaises(ValueError):
            module.verify(self.config, env)


if __name__ == "__main__":
    unittest.main()
