# 수학 도구 템플릿 묶음: python3 tools/gen_tools_lib.py → library/mathtools.json
# 2022 개정 교육과정 단원에 맞춰 학년·학기별로 묶었어요.
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def eul(t):
    t = str(t).strip()
    ch = t[-1]
    if ch.isdigit():
        return t + ('을' if ch in '013678' else '를')
    if '가' <= ch <= '힣':
        return t + ('을' if (ord(ch) - 0xAC00) % 28 else '를')
    return t + '을(를)'


def T(kind, title, question, content, key=None):
    c = dict(content, kind=kind, question=question)
    return {'title': title, 'kind': kind, 'content': c, 'answer_key': key}


def clock(time, mode='set', step=30):
    h, m = time.split(':')
    t = f'{int(h)}시' + (f' {int(m)}분' if int(m) else '')
    if mode == 'set':
        return T('clock', f'시계 · {t} 만들기', f'{eul(t)}\n시계에 나타내 보세요.', {'mode': 'set', 'time': time, 'step': step})
    return T('clock', f'시계 · 시각 읽기 ({t})', '시계를 보고\n몇 시 몇 분인지 써 보세요.', {'mode': 'read', 'time': time, 'step': step})


def frame(n, frames=1, red=None):
    if red is not None:
        return T('tens', f'가르기 · {n} = {red} + {n - red}', f'{eul(n)} 빨강 {red}개와\n파랑으로 갈라 보세요.', {'mode': 'frame', 'frames': frames}, {'count': n, 'red': red})
    return T('tens', f'십 배열판 · {n}', f'{n}만큼\n동그라미를 놓아 보세요.', {'mode': 'frame', 'frames': frames}, {'count': n})


def blocks(v, places=2):
    return T('tens', f'수 모형 · {v}', f'{eul(v)}\n수 모형으로 나타내 보세요.', {'mode': 'blocks', 'places': places}, {'value': v, 'exact': True})


def vm(a, op, b):
    sym = {'+': '+', '-': '−', '×': '×'}[op]
    return T('vmath', f'세로셈 · {a} {sym} {b}', f'{eul(f"{a} {sym} {b}")}\n세로셈으로 계산해 보세요.', {'op': op, 'a': a, 'b': b, 'carry': True})


def nl_point(title, q, value, **c):
    base = {'mode': 'point', 'min': 0, 'max': 10, 'step': 1, 'minor': 1, 'labels': 'all', 'fmt': 'int'}
    base.update(c)
    return T('numline', title, q, base, {'value': str(value)})


def nl_jump(start, size, end, mx, step=1, minor=1):
    return T('numline', f'뛰어 세기 · {size}씩', f'{start}에서 {size}씩 뛰어 세어\n{end}까지 가 보세요.',
             {'mode': 'jump', 'min': 0, 'max': mx, 'step': step, 'minor': minor, 'labels': 'all', 'fmt': 'int', 'start': start},
             {'end': str(end), 'size': str(size)})


def frac(num, parts, shape='circle', wholes=1):
    name = {'circle': '원', 'bar': '막대', 'rect': '사각형'}[shape]
    return T('fraction', f'분수 색칠 · {num}/{parts} ({name})', f'{num}/{parts}만큼\n색칠해 보세요.', {'shape': shape, 'parts': parts, 'wholes': wholes}, {'num': num})


def graph(title, cats, values, unit='명', mx=8, scale=1, q=None):
    return T('bargraph', f'막대그래프 · {title}', q or '표를 보고\n막대그래프를 그려 보세요.',
             {'title': title, 'cats': ', '.join(cats), 'values': ', '.join(map(str, values)) if values else '', 'unit': unit, 'max': mx, 'scale': scale, 'showTable': True})


def geo(title, q, key=None, cols=7, rows=5):
    return T('geoboard', title, q, {'cols': cols, 'rows': rows}, key)


B = []
def bundle(grade, term, unit, items, note=''):
    B.append({'id': f'tool-{grade}-{term}-{len(B)}', 'subject': '수학 도구', 'grade': grade, 'term': term,
              'unit': unit, 'title': f'수학 도구 {grade}-{term} · {unit}', 'note': note, 'items': items})

bundle(1, 1, '9까지의 수 · 십 배열판', [frame(3), frame(5), frame(7), frame(9)], '칸을 톡 눌러 동그라미를 놓아요.')
bundle(1, 1, '덧셈과 뺄셈 · 가르기', [frame(5, red=2), frame(7, red=3), frame(8, red=4), frame(9, red=6)], '빨강과 파랑으로 갈라요. 빨강 수와 전체 수가 맞으면 정답이에요.')
bundle(1, 2, '100까지의 수 · 수 모형', [blocks(23), blocks(40), blocks(57), blocks(86)], '십 모형과 일 모형으로 나타내요 (자리마다 9개까지).')
bundle(1, 2, '덧셈과 뺄셈 · 10 만들기', [frame(10), frame(12, 2), frame(15, 2), frame(18, 2)], '배열판 두 개(20칸)로 10을 넘는 수를 나타내요.')
bundle(1, 2, '모양과 시각 · 몇 시, 몇 시 30분', [clock('3:00'), clock('9:00'), clock('6:30'), clock('11:30'), clock('2:30', 'read'), clock('7:00', 'read')], '긴바늘은 30분씩 움직여요.')
bundle(2, 1, '세 자리 수 · 수 모형', [blocks(235, 3), blocks(408, 3), blocks(560, 3)], '백 모형까지 써요.')
bundle(2, 1, '덧셈과 뺄셈 · 세로셈', [vm(27, '+', 35), vm(48, '+', 36), vm(52, '-', 18), vm(70, '-', 26)], '받아올림·받아내림 작은 칸은 채점하지 않아요.')
bundle(2, 1, '여러 가지 도형 · 점판', [geo('점판 · 삼각형', '점을 이어\n삼각형을 그려 보세요.', {'sides': 3}),
                                  geo('점판 · 사각형', '점을 이어\n사각형을 그려 보세요.', {'sides': 4}),
                                  geo('점판 · 오각형', '점을 이어\n오각형을 그려 보세요.', {'sides': 5}),
                                  geo('점판 · 자유롭게', '점을 이어\n여러 가지 도형을 그려 보세요.')])
bundle(2, 1, '곱셈 · 뛰어 세기', [nl_jump(0, 2, 10, 12), nl_jump(0, 3, 15, 18), nl_jump(0, 5, 20, 20)], '수직선에서 같은 크기로 뛰어 세요.')
bundle(2, 2, '시각과 시간 · 몇 시 몇 분', [clock('4:15', step=5), clock('8:40', step=5), clock('10:25', step=5), clock('1:35', 'read', 5), clock('5:50', 'read', 5)], '긴바늘은 5분씩 움직여요.')
bundle(2, 2, '표와 그래프', [graph('좋아하는 과일', ['사과', '배', '귤', '포도'], [3, 5, 2, 4]),
                         graph('좋아하는 계절', ['봄', '여름', '가을', '겨울'], [6, 4, 3, 5]),
                         graph('우리 반 조사', ['노랑', '빨강', '파랑', '초록'], None, q='우리 반 친구들이 좋아하는 색을 조사해서\n막대그래프를 그려 보세요.')])
bundle(3, 1, '덧셈과 뺄셈 · 세로셈', [vm(365, '+', 478), vm(259, '+', 384), vm(702, '-', 356), vm(825, '-', 468)])
bundle(3, 1, '평면도형 · 점판', [geo('점판 · 직각삼각형', '점을 이어\n직각삼각형을 그려 보세요.', {'kind': 'right'}),
                            geo('점판 · 직사각형', '점을 이어\n직사각형을 그려 보세요.', {'kind': 'rect'}),
                            geo('점판 · 정사각형', '점을 이어\n정사각형을 그려 보세요.', {'kind': 'square'})])
bundle(3, 1, '곱셈 · 세로셈', [vm(23, '×', 3), vm(46, '×', 5), vm(132, '×', 4)])
bundle(3, 1, '분수와 소수 · 색칠', [frac(1, 2), frac(3, 4), frac(2, 3, 'bar'), frac(5, 8, 'rect'), frac(3, 5, 'bar')], '똑같이 나눈 조각을 칠해요.')
bundle(3, 1, '분수와 소수 · 수직선', [
    nl_point('수직선 · 3/4', '3/4을\n수직선에 나타내 보세요.', '3/4', max=1, step=1, minor=4, fmt='frac', labels='minor'),
    nl_point('수직선 · 2/5', '2/5를\n수직선에 나타내 보세요.', '2/5', max=1, step=1, minor=5, fmt='frac', labels='minor'),
    nl_point('수직선 · 0.7', '0.7을\n수직선에 나타내 보세요.', '0.7', max=1, step=1, minor=10, fmt='dec'),
    nl_point('수직선 · 1.4', '1.4를\n수직선에 나타내 보세요.', '1.4', max=2, step=1, minor=10, fmt='dec')])
bundle(3, 2, '곱셈 · 세로셈 (두 자리 곱하기)', [vm(24, '×', 13), vm(35, '×', 27), vm(48, '×', 52)], '두 줄로 곱하고 더해요. 마지막 줄만 채점해요.')
bundle(3, 2, '분수 · 여러 개 색칠', [frac(4, 3, 'circle', 2), frac(5, 4, 'bar', 2), frac(7, 4, 'rect', 2)], '1보다 큰 분수예요.')
bundle(4, 1, '막대그래프', [graph('반별 안경 쓴 학생', ['1반', '2반', '3반', '4반'], [6, 10, 4, 8], mx=6, scale=2),
                       graph('좋아하는 운동', ['축구', '피구', '줄넘기', '달리기', '수영'], [7, 9, 4, 6, 3], mx=10)], '한 칸의 크기가 2인 그래프도 있어요.')
bundle(4, 1, '수직선 · 큰 수 뛰어 세기', [nl_jump(0, 100, 600, 1000, 100), nl_jump(1000, 1000, 6000, 10000, 1000)])
bundle(5, 1, '다각형의 넓이 · 점판', [geo('점판 · 넓이 6인 직사각형', '넓이가 6인 직사각형을\n그려 보세요.', {'kind': 'rect', 'area': 6}),
                              geo('점판 · 넓이 4인 삼각형', '넓이가 4인 삼각형을\n그려 보세요.', {'sides': 3, 'area': 4}, 8, 6),
                              geo('점판 · 넓이 9인 정사각형', '넓이가 9인 정사각형을\n그려 보세요.', {'kind': 'square', 'area': 9}, 8, 6)], '작은 정사각형 한 칸의 넓이가 1이에요.')

data = {'version': 1, 'subject': '수학 도구', 'source': '2022 개정 교육과정 단원에 맞춰 다모아가 만든 조작 템플릿', 'bundles': B}
with open(os.path.join(ROOT, 'library', 'mathtools.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(B), 'bundles', sum(len(b['items']) for b in B), 'items')
