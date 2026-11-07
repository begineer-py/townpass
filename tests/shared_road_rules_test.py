import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from shared_road_rules import shared_candidate
from integrate_shared_roads import Extract, intersection_allowed, blocked, project, VEHICLE
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree

class SharedRoadRules(unittest.TestCase):
    def test_candidates_preserve_explicit_restrictions(self):
        self.assertTrue({'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link'}.issubset(VEHICLE))
        for highway in ('living_street','residential','unclassified','service'):
            self.assertTrue(shared_candidate({'highway':highway}))
        for attrs in ({'highway':'primary'},{'foot':'no'},{'foot':'private'},{'foot':'use_sidepath'},
                      {'access':'private'},{'access':'destination'},{'wheelchair':'no'},
                      {'foot:conditional':'no @ night'},{'access:conditional':'no @ night'},
                      {'oneway:foot':'yes'},{'foot:forward':'no'}, {'bridge':'yes'},
                      {'tunnel':'yes'},{'layer':'1'},{'area':'yes'},{'barrier':'gate'},
                      {'kerb':'raised'},{'kerb:height':'0.05'}):
            self.assertFalse(shared_candidate({'highway':'residential',**attrs}),attrs)
        self.assertTrue(blocked({'barrier':'gate'}))
        self.assertTrue(blocked({'kerb':'raised'}))
        self.assertTrue(blocked({'foot':'no'}))
        self.assertTrue(blocked({'foot:conditional':'no @ night'}))

    def test_shared_node_and_official_crossing_are_not_coordinate_guessing(self):
        coords={1:(121.5,25),2:(121.5001,25),3:(121.5001,25.0001),4:(121.5001,25)}
        pt=lambda i:project.transform(*coords[i])
        line=LineString([pt(1),pt(2)])
        other=LineString([pt(2),pt(3)])
        empty=STRtree([])
        self.assertTrue(intersection_allowed(line,1,2,10,(11,True,2,3,other),[],empty,coords))
        self.assertFalse(intersection_allowed(line,1,2,10,(11,True,4,3,other),[],empty,coords))
        self.assertFalse(intersection_allowed(line,1,2,10,(11,False,2,3,other),[],empty,coords))
        crossing=Point(pt(2)).buffer(1)
        self.assertTrue(intersection_allowed(line,1,2,10,(11,False,2,3,other),[crossing],STRtree([crossing]),coords))
        overlap=LineString([pt(1),pt(2)])
        self.assertFalse(intersection_allowed(line,1,2,10,(11,True,1,2,overlap),[],empty,coords))

    def test_road_endpoints_outside_project_bounds_still_checked(self):
        class Location:
            def __init__(self,lon,lat):self.lon,self.lat=lon,lat
            def valid(self):return True
        class Node:
            def __init__(self,ref,lon,lat):self.ref,self.location=ref,Location(lon,lat)
        class Way:
            id=99
            tags={'highway':'primary'}
            nodes=[Node(11,121.5,24.93),Node(12,121.5,25.25)]
        candidate={'osmId':10,'nodes':[{'lat':25,'lon':121.4999},{'lat':25,'lon':121.5001}]}
        extractor=Extract([candidate]);extractor.way(Way())
        self.assertEqual(len(extractor.roads),1)
        line=LineString([project.transform(121.4999,25),project.transform(121.5001,25)])
        self.assertFalse(intersection_allowed(line,1,2,10,extractor.roads[0],[],STRtree([]),{}))

if __name__ == '__main__': unittest.main()
