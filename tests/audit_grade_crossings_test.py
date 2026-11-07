import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from audit_grade_crossings import conflict, layer, source_verified, Scan, VEHICLE
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

class GradeCrossings(unittest.TestCase):
    def setUp(self):
        self.ped=LineString([(0,0),(10,0)]);self.road=LineString([(5,-5),(5,5)])
        self.crossings=[];self.tree=STRtree([])
    def check(self,ped,road,nodes=(3,4),crossings=None):
        areas=self.crossings if crossings is None else crossings
        return conflict(self.ped,(1,2),ped,(123,nodes,road,self.road),areas,STRtree(areas))
    def test_same_layer_or_unknown_without_crossing_is_rejected(self):
        ped={'layer':'1','bridge':'yes'}
        self.assertEqual(self.check(ped,{'layer':'1'})['reason'],'same-layer')
        self.assertEqual(self.check(ped,{'tunnel':'culvert'})['reason'],'unknown-layer')
        self.assertEqual(self.check({'bridge':'yes'},{'layer':'0'})['reason'],'unknown-layer')
        self.assertIsNone(self.check(ped,{'layer':'1'},crossings=[Point(5,0).buffer(1)]))
    def test_explicit_different_layers_without_shared_nodes_preserved(self):
        self.assertIsNone(self.check({'layer':'1','bridge':'yes'},{'layer':'3','bridge':'yes'}))
        self.assertIsNone(self.check({'layer':'1','bridge':'yes'},{'highway':'service'}))
        self.assertEqual(self.check({'layer':'1','bridge':'yes'},{'layer':'3','bridge':'yes'},nodes=(2,4))['reason'],'shared-node')
        self.assertIsNone(layer({'bridge':'yes'},True))
        self.assertIsNone(layer({'tunnel':'yes'},True))
        self.assertTrue({'primary_link','secondary_link','tertiary_link'}.issubset(VEHICLE))
    def test_source_identity_geometry_and_tags_must_match(self):
        g={'ways':[{'highway':'footway','bridge':'yes','layer':'1','footway':'sidewalk','wheelchair':None,'level':None,'tunnel':None}],
           'nodes':[[25,121.5,0,1],[25,121.501,0,2]]}
        e=[0,1,100,0,[]];source={'tags':{'highway':'footway','bridge':'yes','layer':'1','footway':'sidewalk'},'nodes':[(1,(121.5,25)),(2,(121.501,25))]}
        self.assertTrue(source_verified(g,e,source))
        self.assertFalse(source_verified(g,e,{**source,'nodes':[(1,(121.5,25)),(3,(121.501,25))]}))
        self.assertFalse(source_verified(g,e,{**source,'tags':{**source['tags'],'layer':'2'}}))
        self.assertFalse(source_verified(g,[0,1,100,0,[[25,121.5005]]],source))
        for tags in ({'access':'no'},{'access':'private'},{'foot':'no'},{'foot':'private'},
                     {'foot':'use_sidepath'},{'foot:conditional':'no @ night'},{'access:conditional':'private @ night'},
                     {'oneway:foot':'yes'},{'tunnel':'yes'},{'level':'1'}):
            self.assertFalse(source_verified(g,e,{**source,'tags':{**source['tags'],**tags}}),tags)
        for key in ('level','tunnel'):
            modified={**g,'ways':[{k:v for k,v in g['ways'][0].items() if k!=key}]}
            self.assertFalse(source_verified(modified,e,source),key)
        # Older graphs omit access/foot, but an explicit allowed tag in the
        # source is checked and does not require an invented graph field.
        self.assertTrue(source_verified(g,e,{**source,'tags':{**source['tags'],'foot':'yes'}}))
        modified={**g,'ways':[{**g['ways'][0],'foot':'yes'}]}
        self.assertFalse(source_verified(modified,e,source))
    def test_vehicle_spanning_outside_candidate_extent_is_still_checked(self):
        class Location:
            def __init__(self,lon,lat):self.lon,self.lat=lon,lat
            def valid(self):return True
        class Node:
            def __init__(self,ref,lon,lat):self.ref,self.location=ref,Location(lon,lat)
        class Way:
            id=99;tags={'highway':'primary_link'}
            nodes=[Node(11,121.5,24.93),Node(12,121.5,25.25)]
        scanner=Scan([[(121.4999,25),(121.5001,25)]],set());scanner.way(Way())
        self.assertEqual(len(scanner.roads),1)

if __name__=='__main__':unittest.main()
