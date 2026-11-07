# 모양 그림판 묶음 만들기: python3 tools/gen_shapes_lib.py → library/shapes.json
# 1학년 2학기 "모양과 시각"(○△□ 모양 꾸미기), "규칙 찾기"와 이어지게 만들었어요.
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def S(t, x, y, w, h, fill, rot=0):
    return {'t': t, 'x': x, 'y': y, 'w': w, 'h': h, 'rot': rot, 'fx': False, 'fy': False, 'fill': fill}


def item(title, question, allow=('c', 't', 'r'), given=(), counts=None):
    return {'title': title, 'kind': 'shapes',
            'content': {'kind': 'shapes', 'question': question, 'allow': list(allow), 'given': list(given)},
            'answer_key': {'counts': counts} if counts else None}


ORANGE, YELLOW, GREEN, BROWN, SKY, RED, BLUE, PURPLE = '#FB8C00', '#FDE047', '#9CCC65', '#8B5A2B', '#5BC2F2', '#E53935', '#1E78E8', '#7B3FB8'

draw = [
    item('빈 그림판', '○, △, □ 모양으로\n멋진 그림을 꾸며 보세요.'),
    item('세모와 네모로 집 꾸미기', '△ 모양과 □ 모양으로\n우리 집을 꾸며 보세요.', allow=('t', 'r')),
    item('네모 로봇', '□ 모양만 써서\n로봇을 만들어 보세요.', allow=('r',)),
    item('동그라미 눈사람', '○ 모양만 써서\n눈사람이나 얼굴을 만들어 보세요.', allow=('c',)),
    item('흩어진 모양으로 나무와 해', '흩어진 모양을 옮겨서\n나무와 해를 만들어 보세요.',
         given=[S('c', 260, 600, 180, 180, YELLOW), S('r', 1300, 640, 60, 220, BROWN), S('c', 780, 220, 280, 280, GREEN),
                S('t', 1250, 220, 300, 200, ORANGE), S('r', 520, 260, 200, 180, SKY)]),
]
count = [
    item('세모 2개 · 네모 3개', '△ 모양 2개, □ 모양 3개로\n그림을 꾸며 보세요.', allow=('t', 'r'), counts={'t': 2, 'r': 3}),
    item('동그라미 4개', '○ 모양 4개로\n그림을 꾸며 보세요.', allow=('c',), counts={'c': 4}),
    item('세 모양 골고루', '○ 2개, △ 2개, □ 2개로\n그림을 꾸며 보세요.', counts={'c': 2, 't': 2, 'r': 2}),
]
rule = [
    item('규칙 이어 놓기 · ○△', '규칙을 찾아\n빈 곳에 이어서 놓아 보세요.',
         given=[S('c', 200, 400, 150, 150, RED), S('t', 400, 400, 160, 140, BLUE), S('c', 600, 400, 150, 150, RED), S('t', 800, 400, 160, 140, BLUE)]),
    item('규칙 이어 놓기 · □□○', '규칙을 찾아\n빈 곳에 이어서 놓아 보세요.',
         given=[S('r', 160, 400, 130, 130, GREEN), S('r', 330, 400, 130, 130, GREEN), S('c', 500, 400, 130, 130, PURPLE),
                S('r', 670, 400, 130, 130, GREEN), S('r', 840, 400, 130, 130, GREEN), S('c', 1010, 400, 130, 130, PURPLE)]),
    item('나만의 규칙 만들기', '○, △, □ 모양으로\n나만의 규칙을 만들어 보세요.'),
]

bundles = [
    {'id': 'shp-draw', 'unit': '모양으로 꾸미기', 'title': '그림판 · 모양으로 꾸미기', 'items': draw,
     'note': '모양 버튼을 누르면 놓이고, 끌어서 옮기고, 네모 손잡이로 크기, 동그란 손잡이로 방향을 바꿔요.'},
    {'id': 'shp-count', 'unit': '개수 맞춰 꾸미기', 'title': '그림판 · 개수 맞춰 꾸미기', 'items': count,
     'note': '모양별 개수가 맞으면 자동으로 "맞았어요"가 나와요.'},
    {'id': 'shp-rule', 'unit': '규칙 찾기', 'title': '그림판 · 규칙 찾기', 'items': rule,
     'note': '1학년 2학기 "규칙 찾기"와 이어져요.'},
]
for b in bundles:
    b.update({'subject': '그림판', 'grade': 0, 'term': 0})
data = {'version': 1, 'subject': '그림판', 'source': '다모아가 직접 만든 모양 그림판 (1학년 2학기 모양과 시각 · 규칙 찾기)', 'bundles': bundles}
with open(os.path.join(ROOT, 'library', 'shapes.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(bundles), 'bundles', sum(len(b['items']) for b in bundles), 'items')
