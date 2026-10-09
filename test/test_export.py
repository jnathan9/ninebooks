import csv
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('exporter',Path(__file__).resolve().parents[1]/'scripts/export.py')
exporter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)

def contribution(id, kind, reader):
    return {'id':id,'kind':kind,'reader_id':reader,'seq':1,'created_at':'2026-10-09T00:00:00Z','display_name':'Same name','source_url':'','model':'test','schema_version':2,'items':[{'id':f'{kind}-{n}','kind':kind,'title':f'Title {n}','creator':'Creator','position':n+1} for n in range(9)]}

class ExportTests(unittest.TestCase):
    def test_linked_people_are_counted_once(self):
        with tempfile.TemporaryDirectory() as d:
            exporter.OUT=Path(d)
            exporter.export([contribution('a','book','person1'),contribution('b','album','person1'),contribution('c','album','person1'),contribution('d','album','person2')])
            with (Path(d)/'book_album_connections.csv').open() as f: pairs=list(csv.DictReader(f))
            self.assertEqual(len(pairs),81)
            self.assertTrue(all(x['shared_readers']=='1' for x in pairs))
            manifest=json.loads((Path(d)/'manifest.json').read_text())
            self.assertEqual(manifest['membership_count'],36)
            self.assertEqual(manifest['reader_count'],2)
            rows=[json.loads(x) for x in (Path(d)/'lists.jsonl').read_text().splitlines()]
            self.assertEqual(len(rows),4)
            self.assertTrue(all(len(x['items'])==9 for x in rows))
            with (Path(d)/'connections.csv').open() as f: readable=list(csv.DictReader(f))
            self.assertEqual(len(readable),81)
            self.assertTrue(all(x['shared_readers']=='1' for x in readable))
            self.assertEqual(readable[0]['book'],'Title 0')
            self.assertEqual(readable[0]['artist'],'Creator')
            page=(Path(d)/'BROWSE.md').read_text(encoding='utf-8')
            self.assertEqual(page.count('## Same name'),4)
            for position in range(1,10):
                self.assertEqual(page.count(f'| {position} |'),4)

    def test_browse_preserves_contributed_text_as_literal(self):
        with tempfile.TemporaryDirectory() as d:
            exporter.OUT=Path(d)
            row=contribution('a','book','person1')
            row['display_name']='[name](https://example.com) <img>'
            row['items'][0]['title']='A | B\n*story* <script>'
            exporter.export([row])
            page=(Path(d)/'BROWSE.md').read_text(encoding='utf-8')
            self.assertIn('1 complete list ·',page)
            self.assertIn('A &#124; B &#42;story&#42; &lt;script&gt;',page)
            self.assertIn('&#91;name&#93;(https://example.com) &lt;img&gt;',page)
            self.assertEqual(page.count('| 9 |'),1)

    def test_invalid_list_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            exporter.OUT=Path(d)
            bad=contribution('x','book','person1');bad['items'].pop()
            with self.assertRaises(ValueError):exporter.export([bad])

if __name__=='__main__':unittest.main()
