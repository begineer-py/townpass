import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from rebuild_pedestrian_graph import Extract

class CrossingSourceTest(unittest.TestCase):
    def extracted(self, tags):
        extractor = Extract()
        extractor.coords = {1: (25.0, 121.5), 2: (25.0001, 121.5)}
        way = SimpleNamespace(id=123, tags=tags, nodes=[SimpleNamespace(ref=1), SimpleNamespace(ref=2)])
        extractor.way(way)
        return extractor

    def test_explicit_no_crossing_and_prohibitions_are_not_added(self):
        for patch in ({'crossing':'no'}, {'crossing':'none'}, {'foot':'no'}, {'access':'private'}, {'wheelchair':'no'}):
            with self.subTest(patch=patch):
                tags = {'highway':'footway', 'footway':'crossing', **patch}
                self.assertEqual(self.extracted(tags).segments, [])

    def test_mapped_crossing_keeps_real_osm_topology(self):
        extractor = self.extracted({'highway':'footway', 'footway':'crossing', 'crossing':'unmarked'})
        self.assertEqual(extractor.segments, [(1, 2, 0)])
        self.assertTrue(extractor.ways[0]['crossing'])

if __name__ == '__main__':
    unittest.main()
