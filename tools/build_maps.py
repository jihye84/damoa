"""
지도 GeoJSON(투영 좌표) → 다모아 지도 파일(SVG 경로)
입력은 tools/README 맨 아래 mapshaper 명령으로 만든 파일이에요.
실행: python3 tools/build_maps.py <작업폴더>
"""
import json, sys, os

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(__file__), '..', 'maps')

CREDIT_KR = '행정구역 경계: 통계청 SGIS(공공누리 제1유형), vuski/admdongkor (CC BY 4.0) · 2026년 10월 기준'
CREDIT_NE = '나라 경계: Natural Earth (퍼블릭 도메인)'

MAPS = [
    ('jungnang', 'jn.json', '중랑구', '서울특별시 중랑구 행정동 16곳', CREDIT_KR),
    ('seoul', 'se.json', '서울특별시', '서울특별시 25개 구', CREDIT_KR),
    ('korea', 'kr.json', '대한민국', '대한민국 16개 시·도', CREDIT_KR),
    ('peninsula', 'pen.json', '한반도', '한반도 (남한 16개 시·도, 북한 11개 도·시)', CREDIT_KR + ' / 북한: ' + CREDIT_NE),
    ('asia', 'as.json', '아시아', '아시아 나라들', CREDIT_NE),
    ('world', 'wo.json', '세계', '세계 나라들 (남극 제외)', CREDIT_NE),
]
W = 1000.0


TWO_CONTINENTS = {'RU', 'TR', 'KZ', 'GE', 'AZ', 'AM', 'CY', 'NCY', 'EG'}


def rings_of(geom):
    if geom['type'] == 'Polygon':
        return [geom['coordinates']]
    if geom['type'] == 'MultiPolygon':
        return geom['coordinates']
    return []


def area(r):
    s = 0
    for i in range(len(r) - 1):
        s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return s / 2


def centroid(r):
    a = area(r)
    if abs(a) < 1e-9:
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    cx = cy = 0
    for i in range(len(r) - 1):
        f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
        cx += (r[i][0] + r[i + 1][0]) * f
        cy += (r[i][1] + r[i + 1][1]) * f
    return cx / (6 * a), cy / (6 * a)


for mid, fn, name, desc, credit in MAPS:
    d = json.load(open(os.path.join(SRC, fn)))
    xs, ys = [], []
    for f in d['features']:
        for poly in rings_of(f['geometry']):
            for ring in poly:
                for x, y in ring:
                    xs.append(x); ys.append(y)
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    s = W / (maxx - minx)
    H = round((maxy - miny) * s, 1)
    tx = lambda x: round((x - minx) * s, 1)
    ty = lambda y: round((maxy - y) * s, 1)   # 위아래 뒤집기

    regions = []
    for f in d['features']:
        polys = rings_of(f['geometry'])
        if not polys:
            continue
        parts = []
        best, best_a = None, -1
        for poly in polys:
            for k, ring in enumerate(poly):
                pts = [(tx(x), ty(y)) for x, y in ring]
                # 바로 앞 점과 같은 점은 빼기
                clean = [pts[0]] + [p for i, p in enumerate(pts[1:], 1) if p != pts[i - 1]]
                if len(clean) < 3:
                    continue
                parts.append('M' + 'L'.join(f'{x:g} {y:g}' for x, y in clean) + 'Z')
                if k == 0:
                    a = abs(area(ring))
                    if a > best_a:
                        best_a, best = a, ring
        if best is None:
            continue
        cx, cy = centroid(best)
        p = f['properties']
        reg = {'id': str(p['id']), 'name': p['name'], 'd': ''.join(parts), 'lx': tx(cx), 'ly': ty(cy)}
        # 세계 지도: 대륙 표시 (대륙별 색칠 채점용). 두 대륙에 걸친 나라와 남극 쪽 섬은 빼요
        if mid == 'world' and p.get('continent') not in (None, 'AN') and reg['id'] not in TWO_CONTINENTS:
            reg['c'] = p['continent']
        regions.append(reg)
    regions.sort(key=lambda r: r['name'])
    out = {'id': mid, 'name': name, 'desc': desc, 'viewBox': f'0 0 {W:g} {H:g}', 'credit': credit, 'regions': regions}
    path = os.path.join(OUT, mid + '.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'{mid:10s} {len(regions):3d} regions  {os.path.getsize(path) // 1024:4d} KB  viewBox 1000x{H:g}')
