import sys
import unittest
from pathlib import Path

from shapely.geometry import LineString, box
from shapely.strtree import STRtree
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from gap_connector_policy import connector_roads_allowed
from audit_gap_connectors import audit


class GapConnectorPolicyTest(unittest.TestCase):
    def check(self, line, roads, crossings):
        return connector_roads_allowed(line, roads, STRtree(roads), crossings, STRtree(crossings))

    def test_parallel_separated_road_does_not_prevent_connector(self):
        self.assertTrue(self.check(LineString([(0, 0), (3, 0)]),
                                   [LineString([(0, 1), (3, 1)])], []))

    def test_even_fully_covered_road_centreline_is_not_a_crossing(self):
        self.assertFalse(self.check(LineString([(0, 0), (3, 0)]),
                                    [LineString([(-1, 0), (4, 0)])], [box(-1, -1, 4, 1)]))

    def test_partially_overlapping_centreline_is_rejected(self):
        self.assertFalse(self.check(LineString([(0, 0), (3, 0)]),
                                    [LineString([(2, 0), (4, 0)])], [box(-1, -1, 4, 1)]))

    def test_perpendicular_crossing_needs_official_crossing_evidence(self):
        line = LineString([(0, 0), (3, 0)])
        roads = [LineString([(1.5, -1), (1.5, 1)])]
        self.assertTrue(self.check(line, roads, [box(1, -0.5, 2, 0.5)]))
        self.assertFalse(self.check(line, roads, []))

    def test_real_de_xing_west_road_connector_is_rejected_even_in_crossing(self):
        project = Transformer.from_crs(4326, 3826, always_xy=True)
        a = project.transform(121.5232856, 25.1056734)
        b = project.transform(121.5232790, 25.1056676)
        line = LineString([a, b])
        road = LineString([a, b])
        self.assertFalse(self.check(line, [road], [line.buffer(2)]))

    def test_graph_audit_examines_synthetic_edges_only(self):
        nodes = [[25, 121.5, 0, 1], [25, 121.50001, 0, 2]]
        graph = {
            'nodes': nodes,
            'ways': [{'isConnector': True}, {'highway': 'footway'}],
            'edges': [[0, 1, 1, 0, []], [0, 1, 1, 1, []]],
            'roadGeometries': [[[121.5, 25], [121.50001, 25]]],
        }
        report = audit(graph)
        self.assertEqual(report['connectorsExamined'], 1)
        self.assertEqual([row['edgeIndex'] for row in report['rejected']], [0])


if __name__ == '__main__':
    unittest.main()
