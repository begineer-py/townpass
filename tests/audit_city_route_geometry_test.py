import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('audit_city_route_geometry', ROOT / 'scripts/audit_city_route_geometry.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class CityRouteGeometryAuditTest(unittest.TestCase):
    def test_matches_ids_without_treating_nearby_line_as_a_connection(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            city, route = root / 'city.json', root / 'route.json'
            city.write_text(json.dumps({'data': [
                {'qgs_fid': '1', 'STAsText': 'MULTILINESTRING ((0 0, 10 0))'},
            ]}), encoding='utf8')
            route.write_text(json.dumps({'segments': [
                {'qgs_fid': 1, 'geometry': {'coordinates': [[1, 0], [9, 0]]}},
                {'qgs_fid': 2, 'geometry': {'coordinates': [[1, 0], [9, 0]]}},
            ]}), encoding='utf8')
            result = audit.audit(city, route, .05)
            self.assertEqual(result['routeSegments'], 2)
            self.assertEqual(result['matchedUniqueIds'], 1)
            self.assertEqual(result['segments'][0]['outsideToleranceMetres'], 0)
            self.assertIsNone(result['segments'][1]['outsideToleranceMetres'])
            self.assertTrue(any('do not certify' in text for text in result['limitations']))


if __name__ == '__main__':
    unittest.main()
