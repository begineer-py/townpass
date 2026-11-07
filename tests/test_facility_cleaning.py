import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from clean_facilities import clean_record,clean_datasets,stats

def row(id,name,kind='16',lat=25.,lon=121.5,**extra):
 return {'id':id,'name':name,'kind':kind,'lat':lat,'lon':lon,'sourceId':extra.pop('sourceId','wheel-16'),**extra}

class CleaningTests(unittest.TestCase):
 def test_html_code_address_phone_and_source(self):
  original='B02050001-幸安學坊<br />臺北市中正區臨沂街10巷1號<br />27555690#211'
  p=clean_record(row('1',original,'14',sourceId='wheel-14'))
  self.assertEqual(p['name'],'幸安學坊');self.assertEqual(p['address'],'臺北市中正區臨沂街10巷1號');self.assertEqual(p['phone'],'27555690#211');self.assertEqual(p['sourceName'],original)
 def test_parking_code_district_and_counts(self):
  original='TPE1648-大同區-玉泉公園停車場(大型車:0格，小型車:42格(含身心障礙停車位2格)，機車:0格)'
  p=clean_record(row('x',original));self.assertEqual(p['name'],'玉泉公園停車場');self.assertIn('小型車:42格',p['parkingDetails']);self.assertIn('身心障礙停車位2格)',p['parkingDetails']);self.assertEqual(p['sourceName'],original)
 def test_extra_closing_bracket_and_existing_pair(self):
  self.assertEqual(clean_record(row('x','臺北車站)','18'))['name'],'臺北車站');self.assertEqual(clean_record(row('x','場所(東側)','18'))['name'],'場所(東側)')
 def test_friendly_address_and_existing_fields_are_preserved(self):
  p=clean_record(row('x','Cozzi Cafe 敦南店-臺北市大安區敦化南路二段218號','8',address='原有地址'));self.assertEqual(p['name'],'Cozzi Cafe 敦南店');self.assertEqual(p['address'],'原有地址');self.assertIn('敦化南路',p['sourceName'])
 def test_quote_newline_and_unrecoverable_question_mark(self):
  self.assertEqual(clean_record(row('x','"阿立圓山玩具模型社\nMJ Model Railroad"','8'))['name'],'阿立圓山玩具模型社 MJ Model Railroad');self.assertEqual(clean_record(row('x','?公圳公園','4'))['name'],'?公圳公園')
 def test_generic_names_are_not_fabricated_or_grouped(self):
  f,p=clean_datasets([],[row('a','座椅','rest',sourceId='osm'),row('b','座椅','rest',lat=25.00001,sourceId='osm')]);self.assertTrue(all('mapGroupId' not in x for x in p));self.assertTrue(all(x['name']=='座椅' for x in p))
 def test_parking_match_preserves_records_ids_and_detail(self):
  a=row('w15','玉泉公園停','15',sourceId='wheel-15');b=row('w16','TPE0426-大同區-玉泉公園停車場(大型車:0格，小型車:42格)','16',lat=25.00005,sourceId='wheel-16')
  f,_=clean_datasets([a,b],[]);self.assertEqual([x['id'] for x in f],['w15','w16']);self.assertEqual(f[0]['name'],'玉泉公園停車場');self.assertEqual(f[0]['sourceName'],'玉泉公園停');self.assertEqual(f[0]['mapGroupId'],f[1]['mapGroupId']);self.assertIn('小型車:42格',f[1]['parkingDetails']);self.assertEqual(sum(x['mapGroupRepresentative'] for x in f),1);self.assertEqual(len(next(x for x in f if x['mapGroupRepresentative'])['mapGroupMembers']),2)
 def test_ambiguous_parking_name_never_guessed(self):
  a=row('w15','新光大樓停','15',sourceId='wheel-15');b=row('w16a','新光大樓停車場','16',sourceId='wheel-16');c=row('w16b','新光大樓停車場停車場','16',lat=25.00001,sourceId='wheel-16')
  f,_=clean_datasets([a,b,c],[]);self.assertEqual(f[0]['name'],'新光大樓停')
 def test_bus_routes_preserve_originals_and_aggregate_only_in_map_metadata(self):
  a=row('a','臺北車站)','18',sourceId='wheel-18',routes=['1']);b=row('b','臺北車站','18',lat=25.00001,sourceId='wheel-18',routes=['2'])
  f,_=clean_datasets([a,b],[]);rep=next(p for p in f if p.get('mapGroupRepresentative'));self.assertEqual(rep['mapGroupRoutes'],['1','2']);self.assertEqual(f[0]['routes'],['1']);self.assertEqual(f[1]['routes'],['2'])
 def test_distinct_categories_and_restrictions_do_not_merge(self):
  a=row('a','公園','4');b=row('b','公園','3');c=row('c','同名停車場','16',wheelchair='no');d=row('d','同名停車場','16',wheelchair='yes')
  f,_=clean_datasets([a,b,c,d],[]);self.assertTrue(all('mapGroupId' not in p for p in f))
 def test_distinct_motorcycle_parking_is_not_folded_into_car_parking(self):
  a=row('a','便利停車場西湖站','15',sourceId='wheel-15');b=row('b','便利停車場西湖站(機','15',lat=25.00001,sourceId='wheel-15')
  f,_=clean_datasets([a,b],[]);self.assertTrue(all('mapGroupId' not in p for p in f))
 def test_different_shops_never_merge_even_at_same_coordinate(self):
  a=row('a','早餐店-臺北市大同區同路1號','8');b=row('b','咖啡店-臺北市大同區同路1號','8')
  f,_=clean_datasets([a,b],[]);self.assertTrue(all('mapGroupId' not in p for p in f))
 def test_same_name_outside_radius_and_chained_points_do_not_merge(self):
  f,_=clean_datasets([row('a','同名停車場'),row('b','同名停車場',lat=25+14/111195),row('c','同名停車場',lat=25+28/111195)],[])
  self.assertEqual(f[0]['mapGroupId'],f[1]['mapGroupId']);self.assertNotIn('mapGroupId',f[2])
 def test_idempotent_and_unknown_character_reported(self):
  a=row('a','TPE1648-大同區-玉泉公園停車場(大型車:0格)','16');b=row('b','玉泉公園停車場','15',sourceId='wheel-15');c=row('c','新糖?公園','4');f,p=clean_datasets([a,b,c],[]);again,_=clean_datasets(f,p);self.assertEqual(again,f);self.assertEqual(stats(f)['questionMarkNames'],1)
if __name__=='__main__':unittest.main()
