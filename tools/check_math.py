"""문제 글만 읽고 다시 계산해서, 표시된 정답과 같은지 검사해요."""
import json, re
from fractions import Fraction as F

def parse_num(s):
    s = s.strip().replace(' ', '')
    m = re.match(r'^(\d+)과(\d+)/(\d+)$', s) or re.match(r'^(\d+)와(\d+)/(\d+)$', s)
    if m: return int(m[1]) + F(int(m[2]), int(m[3]))
    m = re.match(r'^(\d+)/(\d+)$', s)
    if m: return F(int(m[1]), int(m[2]))
    m = re.match(r'^-?\d+(\.\d+)?$', s)
    if m: return F(s)
    return None

lib = json.load(open('library/math.json'))
checked = bad = 0
for b in lib['bundles']:
    for x in b['items']:
        if x['kind'] != 'choice4': continue
        q = x['content']['question'].split('\n')[0]
        opts = x['content']['options']; ans = opts[x['answer_key']['correct']]
        m = re.match(r'^(.+?) ([+−×÷]) (.+?) = \?$', q)
        if m:
            a, op, c = parse_num(m[1]), m[2], parse_num(m[3])
            if a is None or c is None: continue
            v = {'+': lambda: a + c, '−': lambda: a - c, '×': lambda: a * c, '÷': lambda: a / c}[op]()
            got = parse_num(ans)
            checked += 1
            if got != v:
                bad += 1; print('X', b['title'], '|', q, '| 정답표시', ans, '| 계산', v)
            # 오답 중에 정답과 같은 값이 섞여 있지 않은지
            for o in opts:
                if o != ans and parse_num(o) == v:
                    bad += 1; print('DUP', b['title'], q, o)
        m = re.match(r'^(\d+) ÷ (\d+)의 몫과 나머지는\?$', q) or re.match(r'^(\d+) ÷ (\d+)의 몫은\?$', q)
        if m:
            qq, r = divmod(int(m[1]), int(m[2]))
            want = f'몫 {qq}, 나머지 {r}' if r else f'몫 {qq}'
            checked += 1
            if ans != want: bad += 1; print('X', q, ans, want)
print(f'계산 검사 {checked}개, 문제 {bad}개')
