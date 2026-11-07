"""Ensure the retired packer cannot overwrite safety-evidenced routing data."""
import hashlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class PackSafetyTest(unittest.TestCase):
    def test_legacy_packer_exits_before_writing_any_data(self):
        script = Path(__file__).resolve().parents[1] / 'scripts' / 'pack_data.py'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'scripts').mkdir()
            (root / 'public' / 'data').mkdir(parents=True)
            shutil.copy2(script, root / 'scripts' / script.name)
            sentinel = root / 'public' / 'data' / 'graph.json.gz'
            sentinel.write_bytes(b'existing safety-evidenced graph')
            before = hashlib.sha256(sentinel.read_bytes()).digest()
            result = subprocess.run([sys.executable, str(root / 'scripts' / script.name)],
                                    cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('disabled', result.stderr)
            self.assertEqual(before, hashlib.sha256(sentinel.read_bytes()).digest())
            self.assertEqual(list((root / 'public' / 'data').iterdir()), [sentinel])


if __name__ == '__main__':
    unittest.main()
