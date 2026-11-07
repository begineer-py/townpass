import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from osm_poi_restrictions import merge_matched, original_way_point, osm_identity, restriction_tags, same_point
from enrich_osm_poi_restrictions import Scan


class OsmPoiRestrictionsTest(unittest.TestCase):
    def test_identity_rejects_road_or_spoofed_suffix(self):
        self.assertEqual(osm_identity('osm-n123'), ('n', 123))
        self.assertEqual(osm_identity('osm-w123'), ('w', 123))
        for value in ('osm-road123', 'osm-n123x', 'osm-n-1', None):
            self.assertIsNone(osm_identity(value))

    def test_known_no_and_all_restriction_subtags_are_retained(self):
        tags = {'access': 'private', 'foot': 'no', 'wheelchair': 'no',
                'foot:conditional': 'no @ (night)', 'wheelchair:conditional': 'no @ (wet)',
                'access:forward': 'no', 'kerb:height': '0.1', 'name': 'ignored'}
        self.assertEqual(restriction_tags(tags), {k: v for k, v in tags.items() if k != 'name'})

    def test_way_centroid_reproduces_clipping_rounding_and_closure(self):
        points = [(25., 121.5), (25.0001, 121.5), (25.0001, 121.5001),
                  (25., 121.5), (24., 121.5)]
        self.assertEqual(original_way_point(points), (25.00005, 121.500025))
        self.assertIsNone(original_way_point([(24., 121.5)]))

    def test_match_updates_restrictions_and_missing_tag_is_not_permission(self):
        p = {'id': 'osm-n1', 'sourceId': 'osm', 'lat': 25., 'lon': 121.5,
             'access': 'private', 'wheelchair': 'no'}
        merge_matched(p, {'foot': 'no', 'wheelchair:conditional': 'no @ (night)'})
        self.assertEqual(p['foot'], 'no')
        self.assertEqual(p['wheelchair:conditional'], 'no @ (night)')
        self.assertNotIn('access', p)
        self.assertNotIn('wheelchair', p)
        self.assertTrue(p['osmRestrictionsMatched'])

    def test_moved_or_missing_source_keeps_prior_restriction_unverified(self):
        p = {'id': 'osm-n1', 'sourceId': 'osm', 'lat': 25., 'lon': 121.5, 'access': 'no'}
        missing = {'id': 'osm-w2', 'sourceId': 'osm', 'lat': 25., 'lon': 121.5, 'foot': 'no'}
        scan = Scan([p, missing])
        scan.accept('n', 1, (25.01, 121.5), {'access': 'yes'})
        self.assertFalse(p['osmRestrictionsMatched'])
        self.assertFalse(missing['osmRestrictionsMatched'])
        self.assertEqual(p['access'], 'no')
        self.assertEqual(missing['foot'], 'no')
        self.assertEqual(scan.matches['n'], 0)

    def test_duplicate_identity_and_wrong_type_cannot_grant_match(self):
        places = [{'id': 'osm-n1', 'sourceId': 'osm', 'lat': 25., 'lon': 121.5},
                  {'id': 'osm-n1', 'sourceId': 'osm', 'lat': 25., 'lon': 121.5}]
        scan = Scan(places)
        scan.accept('w', 1, (25., 121.5), {'access': 'yes'})
        scan.accept('n', 1, (25., 121.5), {'access': 'yes'})
        self.assertTrue(all(p['osmRestrictionsMatched'] is False for p in places))
        self.assertTrue(all('access' not in p for p in places))

    def test_point_tolerance_does_not_match_different_location(self):
        p = {'lat': 25., 'lon': 121.5}
        self.assertTrue(same_point(p, (25.00000005, 121.5)))
        self.assertFalse(same_point(p, (25.000001, 121.5)))
        self.assertFalse(same_point(p, None))

    def test_non_osm_source_cannot_keep_old_matched_claim(self):
        p = {'id': 'osm-n1', 'sourceId': 'other', 'lat': 25., 'lon': 121.5,
             'osmRestrictionsMatched': True, 'access': 'no'}
        scan = Scan([p])
        scan.accept('n', 1, (25., 121.5), {'access': 'yes'})
        self.assertFalse(p['osmRestrictionsMatched'])
        self.assertEqual(p['access'], 'no')


if __name__ == '__main__':
    unittest.main()
