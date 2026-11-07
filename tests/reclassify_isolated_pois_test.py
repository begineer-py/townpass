import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from reclassify_isolated_pois import pure_poi, select_exemptions

class ReclassifyIsolatedPois(unittest.TestCase):
    def test_only_pure_poi_has_no_road_or_access_restriction(self):
        poi={'shop':'convenience','wheelchair':'no'}
        self.assertTrue(pure_poi(poi))
        for extra in ({'highway':'footway'},{'footway':'crossing'},{'sidewalk':'no'},{'barrier':'gate'},{'kerb':'raised'},
                      {'kerb:height':'0.1'},{'foot':'no'},{'access':'private'},
                      {'entrance':'yes'},{'crossing':'no'},{'foot:conditional':'no @ night'},
                      {'foot:forward':'no'},{'access:foot':'no'},{'oneway:foot':'yes'},
                      {'wheelchair:conditional':'no @ night'},{'railway':'station'}):
            self.assertFalse(pure_poi({**poi,**extra}),extra)
        self.assertFalse(pure_poi({'wheelchair':'no'}))

    def test_not_part_of_any_way_or_live_edge_and_exact_coordinates_match(self):
        poi={'shop':'convenience','wheelchair':'no'}
        graph={'nodes':[[25,121.5,1,1],[25,121.5001,1,2],[25,121.5002,1,3],
                        [25,121.5003,1,4],[25,121.5004,1,5],[25,121.5005,0,6]],
               'edges':[[1,2,10,0]]}
        evidence={i:{'lat':25,'lon':121.5+(i-1)*.0001,'tags':poi} for i in range(1,7)}
        evidence[4]['lat']=25.001
        self.assertEqual(select_exemptions(graph,evidence,{3,5}),[0])
        # The POI accessibility tag itself is never changed.
        self.assertEqual(evidence[1]['tags']['wheelchair'],'no')

if __name__=='__main__':unittest.main()
