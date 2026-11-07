import json, sys
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union
from shapely.affinity import translate

def unwrap_ring(r):
    lons = [p[0] for p in r]
    if max(lons) - min(lons) > 180:
        return [[x + 360 if x < 0 else x, y] for x, y in r]
    return r

def unwrap_geom(g):
    if g['type'] == 'Polygon':
        g = {'type': 'Polygon', 'coordinates': [unwrap_ring(r) for r in g['coordinates']]}
    elif g['type'] == 'MultiPolygon':
        g = {'type': 'MultiPolygon', 'coordinates': [[unwrap_ring(r) for r in poly] for poly in g['coordinates']]}
    return shape(g).buffer(0)

def recenter(src, dst, center, clip=None):
    d = json.load(open(src))
    out = []
    seam = center - 180          # 이 경도에서 잘라요
    for f in d['features']:
        g = unwrap_geom(f['geometry'])
        pieces = []
        # 경도를 [seam, seam+360) 범위로 옮겨 담기 (모든 조각을 같은 바퀴에 놓기)
        for k in (-720, -360, 0, 360):
            part = translate(g, xoff=k).intersection(box(seam, -90, seam + 360, 90))
            if not part.is_empty:
                pieces.append(part)
        g2 = unary_union(pieces)
        g2 = translate(g2, xoff=-center)     # 가운데 경도를 0으로
        if clip:
            g2 = g2.intersection(box(clip[0] - center, clip[1], clip[2] - center, clip[3]))
        if g2.is_empty:
            continue
        polys = [p for p in (g2.geoms if hasattr(g2, 'geoms') else [g2]) if p.geom_type == 'Polygon' and p.area > 0]
        if not polys:
            continue
        geom = {'type': 'MultiPolygon', 'coordinates': [mapping(p)['coordinates'] for p in polys]}
        out.append({'type': 'Feature', 'properties': f['properties'], 'geometry': geom})
    json.dump({'type': 'FeatureCollection', 'features': out}, open(dst, 'w'), ensure_ascii=False)
    print(dst, len(out))

recenter('world_named.geojson', 'world_c150.geojson', 150)
recenter('asia_named.geojson', 'asia_c100.geojson', 100, clip=(25, -12, 192, 82))
