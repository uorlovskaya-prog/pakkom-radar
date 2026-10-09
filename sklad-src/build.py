"""Build only the approved Пакком warehouse page; fail closed on any mismatch."""
from pathlib import Path
import base64
import gzip
import hashlib
import json
import re

src = Path(__file__).resolve().parent
root = src.parent
release = json.loads((src / 'release.json').read_text(encoding='utf-8'))

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def digest(data):
    return hashlib.sha256(data).hexdigest()

parts = release['parts']
require(parts and len(parts) == len(set(parts)), 'Invalid or repeated bundle parts')
require(all(re.fullmatch(r'bundle-\d{2}\.b64', n) for n in parts), 'Invalid part filename')
encoded = ''.join(''.join((src / n).read_text(encoding='ascii').split()) for n in parts)
compressed = base64.b64decode(encoded, validate=True)
require(digest(compressed) == release['gzipSHA256'], 'Transfer SHA256 mismatch')
bundle = json.loads(gzip.decompress(compressed))
packed = bundle['data']
data = dict(packed['meta'])
records = []
for date_index, person_index, rows in packed['cells']:
    for source_row, recipe_index, qty in rows:
        row = dict(zip(packed['keys'], packed['recipes'][recipe_index]))
        person = packed['people'][person_index]
        row.update(row=source_row, date=packed['meta']['dates'][date_index],
                   person=person,
                   originalPerson='Киселева Юля' if person == 'Киселева Юлия' else person,
                   qty=qty, seconds=qty * row['normSeconds'],
                   source=f'По дням!A{source_row}:J{source_row}')
        records.append(row)
records.sort(key=lambda row: row['row'])
data['records'] = records
require(len({row['row'] for row in records}) == len(records), 'Repeated source row')
require(all(row['qty'] >= 0 and row['normSeconds'] > 0 for row in records), 'Missing norm or invalid quantity')
require(all('2026-09-14' <= row['date'] <= '2026-09-30' for row in records), 'Unexpected date')
stats = {'rows': len(records), 'qty': sum(row['qty'] for row in records),
         'seconds': sum(row['seconds'] for row in records)}
require(stats == release['expected'], 'Warehouse totals mismatch')
require(data['sourceSHA256'] == release['sourceSHA256'], 'Source binding mismatch')
require(data['masterSHA256'] == release['masterSHA256'], 'Master binding mismatch')
owner = {'1721217247': 30, '1654508985': 60, '1642273149': 80, '1642222684': 80,
         '1748180510': 60, '1748327732': 60, '1748491198': 60, '1748622323': 60,
         '1748702007': 60, '1748884183': 90, '1531233802': 30, '1603965919': 30}
for row in records:
    if str(row['wb']) in owner:
        require(row['normSeconds'] == owner[str(row['wb'])], 'Owner norm mismatch')
html = bundle['template'].replace('__PAKKOM_DATA__', json.dumps(
    data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
content = html.encode('utf-8')
require(digest(content) == release['htmlSHA256'], 'Generated HTML SHA256 mismatch')
require('На общих датах результат выше' not in html, 'Obsolete comparison label')
require("compareMode:'all'" in html, 'Own-working-days comparison is not default')
# No changes outside this dedicated output directory.
out = root / 'sklad'
out.mkdir(exist_ok=True)
(out / 'index.html').write_bytes(content)
public = {'version': release['version'], 'periodFrom': '2026-09-14',
          'periodTo': '2026-09-30', 'updated': '2026-10-09', **stats,
          'missingNormQty': 0, 'htmlSHA256': release['htmlSHA256']}
(out / 'version.json').write_text(json.dumps(public, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': 'PASS', **public}, ensure_ascii=False))
