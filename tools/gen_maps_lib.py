# 지도 템플릿 묶음 만들기: python3 tools/gen_maps_lib.py  → library/maps.json
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def regions(mid):
    with open(os.path.join(ROOT, 'maps', mid + '.json'), encoding='utf-8') as f:
        return json.load(f)['regions']


def ids_by(mid, test):
    out = [r['id'] for r in regions(mid) if test(r['name'])]
    assert out, (mid, 'no match')
    return out


def ids_named(mid, names):
    by = {r['name']: r['id'] for r in regions(mid)}
    return [by[n] for n in names]


def item(title, mid, question, labels=False, targets=None):
    return {
        'title': title,
        'kind': 'map',
        'content': {'kind': 'map', 'map': mid, 'labels': labels, 'question': question},
        'answer_key': {'targets': targets} if targets else None,
    }


def eul(w):
    c = w[-1]
    return w + ('을' if '가' <= c <= '힣' and (ord(c) - 0xAC00) % 28 else '를')


def basic(mid, name):
    return [
        item(f'{name} 백지도', mid, f'{name} 백지도예요.\n마음대로 색칠해 보세요.'),
        item(f'{name} 지도 (이름 보기)', mid, f'이름을 읽으며\n{eul(name)} 색칠해 보세요.', labels=True),
    ]


bundles = []

# ---------- 중랑구 ----------
jn = basic('jungnang', '중랑구')
jn.append(item('우리 학교가 있는 동', 'jungnang', '우리 학교가 있는 동을\n찾아 색칠해 보세요.', labels=True))
jn.append(item('우리 집이 있는 동', 'jungnang', '우리 집이 있는 동을\n찾아 색칠해 보세요.', labels=True))
for word in ['면목', '상봉', '중화', '묵', '망우', '신내']:
    t = ids_by('jungnang', lambda n, w=word: n.startswith(w))
    jn.append(item(f'"{word}" 동 모두 찾기', 'jungnang',
                   f'이름이 "{word}"(으)로 시작하는 동을\n모두 찾아 색칠해 보세요.', labels=True, targets=t))
bundles.append({'id': 'map-jungnang', 'unit': '중랑구', 'title': '지도 · 중랑구',
                'note': '중랑구 16개 행정동이에요. 이름 보기를 켜면 동 이름이 지도에 나와요.', 'items': jn})

# ---------- 서울 ----------
se = basic('seoul', '서울특별시')
se.append(item('중랑구 찾기', 'seoul', '우리 구, 중랑구를\n찾아 색칠해 보세요.', targets=ids_named('seoul', ['중랑구'])))
se.append(item('중랑구 이웃 구', 'seoul', '중랑구와 맞닿아 있는 구를\n모두 찾아 색칠해 보세요.', labels=True,
               targets=ids_named('seoul', ['광진구', '동대문구', '성북구', '노원구'])))
se.append(item('"강"이 들어간 구', 'seoul', '이름이 "강"으로 시작하는 구를\n모두 찾아 색칠해 보세요.', labels=True,
               targets=ids_by('seoul', lambda n: n.startswith('강'))))
se.append(item('가 본 구 색칠하기', 'seoul', '내가 가 본 구를\n모두 색칠해 보세요.', labels=True))
bundles.append({'id': 'map-seoul', 'unit': '서울특별시', 'title': '지도 · 서울특별시',
                'note': '서울 25개 자치구예요.', 'items': se})

# ---------- 대한민국 ----------
kr = basic('korea', '대한민국')
kr.append(item('서울특별시 찾기', 'korea', '우리가 사는 서울특별시를\n찾아 색칠해 보세요.', targets=ids_named('korea', ['서울특별시'])))
kr.append(item('서울을 둘러싼 도', 'korea', '서울특별시를 빙 둘러싸고 있는 도를\n찾아 색칠해 보세요.', targets=ids_named('korea', ['경기도'])))
kr.append(item('가장 큰 섬', 'korea', '우리나라에서 가장 큰 섬이 있는 곳을\n찾아 색칠해 보세요.', targets=ids_named('korea', ['제주특별자치도'])))
kr.append(item('광역시 모두 찾기', 'korea', '이름에 "광역시"가 들어간 곳을\n모두 찾아 색칠해 보세요.', labels=True,
               targets=ids_by('korea', lambda n: n.endswith('광역시'))))
kr.append(item('특별자치도 모두 찾기', 'korea', '이름에 "특별자치도"가 들어간 곳을\n모두 찾아 색칠해 보세요.', labels=True,
               targets=ids_by('korea', lambda n: n.endswith('특별자치도'))))
kr.append(item('가 본 곳 색칠하기', 'korea', '내가 가 본 시·도를\n모두 색칠해 보세요.', labels=True))
bundles.append({'id': 'map-korea', 'unit': '대한민국', 'title': '지도 · 대한민국',
                'note': '16개 시·도예요. 2026년 7월 1일에 광주광역시와 전라남도가 전남광주통합특별시로 합쳐진 것을 반영했어요.',
                'items': kr})

# ---------- 한반도 ----------
pn = basic('peninsula', '한반도')
pn.append(item('남한과 북한', 'peninsula', '남한과 북한을\n서로 다른 색으로 칠해 보세요.'))
pn.append(item('서울과 평양 찾기', 'peninsula', '서울과 평양을\n찾아 색칠해 보세요.',
               targets=ids_named('peninsula', ['서울특별시', '평양직할시'])))
pn.append(item('북한 땅 모두 칠하기', 'peninsula', '북한 땅을\n모두 찾아 색칠해 보세요.',
               targets=[r['id'] for r in regions('peninsula') if r['id'].startswith('KP-')]))
bundles.append({'id': 'map-peninsula', 'unit': '한반도', 'title': '지도 · 한반도',
                'note': '남한 16개 시·도와 북한 행정 구역이 함께 있어요.', 'items': pn})

# ---------- 아시아 ----------
asia = basic('asia', '아시아')
asia.append(item('대한민국 찾기', 'asia', '아시아 지도에서 대한민국을\n찾아 색칠해 보세요.', targets=ids_named('asia', ['대한민국'])))
asia.append(item('이웃 나라 찾기', 'asia', '우리나라 가까이에 있는\n중국, 일본, 러시아를 찾아 색칠해 보세요.',
                 targets=ids_named('asia', ['중국', '일본', '러시아'])))
asia.append(item('몽골 찾기', 'asia', '초원이 넓은 나라, 몽골을\n찾아 색칠해 보세요.', targets=ids_named('asia', ['몽골'])))
asia.append(item('인도 찾기', 'asia', '인도를\n찾아 색칠해 보세요.', targets=ids_named('asia', ['인도'])))
asia.append(item('가 보고 싶은 나라', 'asia', '가 보고 싶은 나라를\n색칠해 보세요.', labels=True))
bundles.append({'id': 'map-asia', 'unit': '아시아', 'title': '지도 · 아시아',
                'note': '아시아 나라들이에요. 러시아는 아시아 쪽 땅이 넓어서 함께 넣었어요.', 'items': asia})

# ---------- 세계 ----------
wo = basic('world', '세계')
wo.append(item('대한민국 찾기', 'world', '세계 지도에서 대한민국을\n찾아 색칠해 보세요.', targets=ids_named('world', ['대한민국'])))
wo.append(item('가장 큰 나라', 'world', '세계에서 가장 큰 나라, 러시아를\n찾아 색칠해 보세요.', targets=ids_named('world', ['러시아'])))
wo.append(item('호주 찾기', 'world', '캥거루가 사는 나라, 호주를\n찾아 색칠해 보세요.', targets=ids_named('world', ['호주'])))
wo.append(item('미국과 캐나다', 'world', '미국과 캐나다를\n찾아 색칠해 보세요.', targets=ids_named('world', ['미국', '캐나다'])))
wo.append(item('브라질 찾기', 'world', '아마존 숲이 있는 나라, 브라질을\n찾아 색칠해 보세요.', targets=ids_named('world', ['브라질'])))
wo.append(item('이집트 찾기', 'world', '피라미드가 있는 나라, 이집트를\n찾아 색칠해 보세요.', targets=ids_named('world', ['이집트'])))
wo.append(item('대륙마다 다른 색', 'world', '대륙마다\n서로 다른 색으로 칠해 보세요.'))
bundles.append({'id': 'map-world', 'unit': '세계', 'title': '지도 · 세계',
                'note': '태평양이 가운데 오는 세계 지도예요 (남극은 빠져 있어요).', 'items': wo})

for b in bundles:
    b.update({'subject': '지도', 'grade': 0, 'term': 0})

data = {
    'version': 1, 'subject': '지도',
    'source': '행정동 경계 – 통계청 SGIS(공공누리 제1유형)·vuski/admdongkor (CC BY 4.0) · 나라 경계 – Natural Earth (퍼블릭 도메인)',
    'bundles': bundles,
}
with open(os.path.join(ROOT, 'library', 'maps.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(bundles), 'bundles', sum(len(b['items']) for b in bundles), 'items')
