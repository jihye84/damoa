# 작곡 템플릿 묶음 만들기: python3 tools/gen_songs_lib.py → library/songs.json
# 가락은 모두 저작권이 끝난 옛 민요·동요(작은 별, 비행기, 나비야)의 앞부분만 써요.
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DO, RE, MI, FA, SOL, LA, SI, HDO = range(8)


def song(title, question, bars=4, beats=4, split=2, octaves=1, drums=True, melody=True,
         tempo=100, instrument='marimba', given_bars=0, notes=(), drum_hits=()):
    content = {'kind': 'song', 'question': question, 'bars': bars, 'beats': beats, 'split': split,
               'octaves': octaves, 'drums': drums, 'melody': melody, 'tempo': tempo,
               'instrument': instrument, 'givenBars': given_bars,
               'given': {'notes': [list(n) for n in notes], 'drums': [list(d) for d in drum_hits]}}
    return {'title': title, 'kind': 'song', 'content': content, 'answer_key': None}


def quarters(*pitches, start=0):
    """4분음표(두 칸마다 한 음). None은 쉼, '-'는 앞 음을 길게(칸을 비워 둠)"""
    out = []
    for i, p in enumerate(pitches):
        if p is None or p == '-':
            continue
        out.append((start + i * 2, p))
    return out


blank = [
    song('빈 작곡 칸 · 4마디', '나만의 가락을\n지어 보세요.'),
    song('빈 작곡 칸 · 8마디 (두 옥타브)', '높은 음과 낮은 음을 섞어\n긴 가락을 지어 보세요.', bars=8, split=1, octaves=2),
    song('빈 작곡 칸 · 세 박자', '쿵짝짝, 쿵짝짝\n세 박자 가락을 지어 보세요.', beats=3,
         drum_hits=[]),
    song('리듬 만들기', '큰북과 작은북으로\n신나는 리듬을 만들어 보세요.', melody=False, tempo=110),
]

follow = [
    song('이어 짓기 · 작은 별', '작은 별의 앞부분이에요.\n뒷부분을 내 마음대로 이어 지어 보세요.',
         given_bars=2, notes=quarters(DO, DO, SOL, SOL, LA, LA, SOL, '-')),
    song('이어 짓기 · 비행기', '비행기의 앞부분이에요.\n뒤를 이어서 지어 보세요.',
         given_bars=2, notes=quarters(MI, RE, DO, RE, MI, MI, MI, '-')),
    song('이어 짓기 · 나비야', '나비야의 앞부분이에요.\n뒤를 이어서 지어 보세요.',
         given_bars=2, notes=quarters(SOL, MI, MI, '-', FA, RE, RE, '-')),
    song('묻고 답하는 가락', '선생님 가락이 묻고 있어요.\n대답하는 가락을 지어 "도"로 끝내 보세요.',
         given_bars=2, notes=quarters(DO, RE, MI, FA, SOL, '-', SOL, '-')),
    song('계단 가락 이어 짓기', '도레미파솔 계단을 올라갔어요.\n이제 어떻게 내려올까요?',
         given_bars=1, split=2, notes=[(0, DO), (1, RE), (2, MI), (3, FA), (4, SOL), (6, SOL)]),
    song('리듬 따라 하고 바꾸기', '첫 마디 리듬을 듣고\n뒤를 이어서 리듬을 만들어 보세요.',
         melody=False, given_bars=1, tempo=110, drum_hits=[(0, 0), (2, 1), (4, 0), (5, 0), (6, 1)]),
]

bundles = [
    {'id': 'song-blank', 'unit': '빈 작곡 칸', 'title': '음악 · 빈 작곡 칸',
     'note': '칸을 톡 누르거나 쭉 끌어서 음을 놓고 ▶로 들어 봐요. 색은 붐웨커 색(도 빨강, 레 주황…)이에요.', 'items': blank},
    {'id': 'song-follow', 'unit': '이어 짓기', 'title': '음악 · 이어 짓기',
     'note': '앞부분(회색 칸)은 선생님이 지은 것이라 학생이 바꿀 수 없어요. 주황 선부터 이어서 지어요.', 'items': follow},
]
for b in bundles:
    b.update({'subject': '음악', 'grade': 0, 'term': 0})
data = {'version': 1, 'subject': '음악', 'source': '다모아가 직접 만든 작곡 칸 · 가락은 저작권이 끝난 옛 동요의 앞부분', 'bundles': bundles}
with open(os.path.join(ROOT, 'library', 'songs.json'), 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
print(len(bundles), 'bundles', sum(len(b['items']) for b in bundles), 'items')
