"""Export a consistent public snapshot. Uses only the Python standard library."""
import csv
import html
import json
import os
import pathlib
import urllib.request
from urllib.parse import quote
from collections import Counter, defaultdict
from itertools import combinations, product

API = os.environ.get('NINEBOOKS_API', 'https://ninebooks-api.pages.dev').rstrip('/')
OUT = pathlib.Path(__file__).resolve().parents[1] / 'data'


def fetch_lists():
    after, until, lists = 0, None, []
    while True:
        url = f'{API}/api/export?after={after}' + (f'&until={until}' if until is not None else '')
        request = urllib.request.Request(url, headers={'User-Agent': 'NineBooksExport/1.0 (+https://github.com/jnathan9/ninebooks)', 'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=60) as response:
            page = json.load(response)
        if page.get('schema_version') != 2:
            raise ValueError('Unsupported export schema')
        until = page['until']
        lists.extend(page['lists'])
        cursor = page['next_after']
        if cursor is None:
            break
        if cursor <= after:
            raise ValueError('Export pagination did not advance')
        after = cursor
    return lists


def csv_file(name, fields, rows):
    with (OUT / name).open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        writer.writeheader()
        # Spreadsheet programs can treat user-provided leading characters as formulas.
        # JSONL preserves exact values. CSV escapes dangerous cells with an apostrophe.
        for row in rows:
            writer.writerow({k: ("'" + v if isinstance(v, str) and v.lstrip().startswith(('=', '+', '-', '@')) else v) for k, v in row.items()})


def markdown_text(value):
    """Keep contributed text literal in GitHub headings and table cells."""
    text = html.escape(' '.join(str(value).split()), quote=False)
    for char in '\\|[]*_`':
        text = text.replace(char, f'&#{ord(char)};')
    return text


def browse_page(lists, items):
    newest = sorted(lists, key=lambda row: (row['created_at'], row.get('seq', 0)), reverse=True)[:100]
    book_count = sum(item['kind'] == 'book' for item in items)
    album_count = sum(item['kind'] == 'album' for item in items)
    lines = ['# Browse the database', '',
             f'**{len(lists):,} complete {"list" if len(lists) == 1 else "lists"} · {book_count:,} books · {album_count:,} albums**', '',
             '[Books](books.csv) · [Albums](albums.csv) · [Book–album connections](connections.csv) · [All data files](README.md)', '',
             'Each section below is one complete contribution. Lists linked to the same contributor share a public profile. Names are optional and self-reported.', '']
    if len(lists) > 100:
        lines += [f'Showing the newest 100 of {len(lists):,} lists. **All lists** remain available in [lists.jsonl](lists.jsonl) and the [live browser](https://thestalwart.com/ninebooks/#lists).', '']
    elif not lists:
        lines += ['No contributions have been published yet. [Add your nine](https://thestalwart.com/ninebooks/).', '']
    else:
        lines += ['Showing every list in this snapshot. Refreshed with the hourly export.', '']
    for row in newest:
        kind = 'albums' if row['kind'] == 'album' else 'books'
        creator = 'Artist' if row['kind'] == 'album' else 'Author'
        name = markdown_text(row.get('display_name') or 'Anonymous contributor')
        list_url = 'https://thestalwart.com/ninebooks/#list/' + quote(str(row['id']), safe='')
        lines += [f'## {name} · Nine {kind}', '',
                  f'{markdown_text(row["created_at"][:10])} · [Open this list]({list_url})']
        if row.get('reader_id'):
            profile_url = 'https://thestalwart.com/ninebooks/#reader/' + quote(str(row['reader_id']), safe='')
            lines[-1] += f' · [This contributor’s books & albums]({profile_url})'
        lines += ['', f'| Position | Title | {creator} |', '| --- | --- | --- |']
        for item in sorted(row['items'], key=lambda item: item['position']):
            lines.append(f'| {item["position"]} | {markdown_text(item["title"])} | {markdown_text(item["creator"])} |')
        lines += ['']
    lines += ['---', '', 'Data: [CC0 1.0](LICENSE). [Schema and limitations](README.md).', '']
    (OUT / 'BROWSE.md').write_text('\n'.join(lines), encoding='utf-8', newline='\n')


def export(lists):
    OUT.mkdir(exist_ok=True)
    items, memberships, pairs = {}, [], Counter()
    reader_items = defaultdict(lambda: {'book': set(), 'album': set()})
    seen = set()
    for item in lists:
        if item['id'] in seen or item['kind'] not in ['book','album'] or len(item['items']) != 9 or len({b['id'] for b in item['items']}) != 9 or sorted(b['position'] for b in item['items']) != list(range(1,10)) or any(b['kind'] != item['kind'] for b in item['items']):
            raise ValueError('Invalid or duplicate nine-item list')
        seen.add(item['id'])
        for b in item['items']:
            items[b['id']] = {k: b[k] for k in ['id','kind','title','creator']}
            memberships.append({'list_id': item['id'], 'item_id': b['id'], 'position': b['position']})
            if item.get('reader_id'):
                reader_items[item['reader_id']][item['kind']].add(b['id'])
        pairs.update(combinations(sorted(b['id'] for b in item['items']), 2))
    with (OUT / 'lists.jsonl').open('w', encoding='utf-8', newline='\n') as f:
        for item in lists:
            f.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + '\n')
    ordered = [items[k] for k in sorted(items)]
    csv_file('items.csv', ['id','kind','title','creator'], ordered)
    csv_file('books.csv', ['id','title','author'], [{'id':b['id'],'title':b['title'],'author':b['creator']} for b in ordered if b['kind']=='book'])
    csv_file('albums.csv', ['id','title','artist'], [{'id':b['id'],'title':b['title'],'artist':b['creator']} for b in ordered if b['kind']=='album'])
    csv_file('lists.csv', ['id','kind','reader_id','created_at','display_name','source_url','model','schema_version'], [{k:v for k,v in item.items() if k not in ['items','seq']} for item in lists])
    csv_file('list_items.csv', ['list_id','item_id','position'], memberships)
    csv_file('cooccurrences.csv', ['item_a','item_b','shared_lists'], [{'item_a':a,'item_b':b,'shared_lists':n} for (a,b),n in sorted(pairs.items())])
    cross_media=Counter()
    for choices in reader_items.values():
        cross_media.update(product(sorted(choices['book']),sorted(choices['album'])))
    csv_file('book_album_connections.csv',['book_id','album_id','shared_readers'],[{'book_id':b,'album_id':a,'shared_readers':n} for (b,a),n in sorted(cross_media.items())])
    csv_file('connections.csv', ['book','author','album','artist','shared_readers'], [
        {'book':items[b]['title'], 'author':items[b]['creator'], 'album':items[a]['title'], 'artist':items[a]['creator'], 'shared_readers':n}
        for (b,a),n in sorted(cross_media.items(), key=lambda pair: (-pair[1], pair[0]))
    ])
    browse_page(lists, ordered)
    (OUT / 'manifest.json').write_text(json.dumps({'schema_version':2,'license':'CC0-1.0','list_count':len(lists),'book_count':sum(x['kind']=='book' for x in ordered),'album_count':sum(x['kind']=='album' for x in ordered),'reader_count':len(reader_items),'membership_count':len(memberships),'latest_list_at':max((x['created_at'] for x in lists),default=None)}, indent=2)+'\n', encoding='utf-8')
    print(f'Exported {len(lists)} lists, {len(items)} items, {len(memberships)} memberships, {len(cross_media)} book-album connections')


if __name__ == '__main__':
    export(fetch_lists())
