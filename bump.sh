#!/bin/sh
# 고친 뒤 실행하면 모든 css·js 주소 뒤의 ?v= 번호가 바뀌어서, 태블릿이 예전 파일을 쓰지 않아요.
V=$(date +%Y%m%d%H%M)
for f in *.html js/*.js; do
  sed -i -E "s#((src|href)=\"(css|js|vendor)/[^\"?]+\.(css|js|mjs))(\?v=[0-9]+)?\"#\1?v=$V\"#g; s#(from '\./[^'?]+\.js)(\?v=[0-9]+)?'#\1?v=$V'#g; s#(from '\.\./vendor/[^'?]+\.(js|mjs))(\?v=[0-9]+)?'#\1?v=$V'#g" "$f"
done
echo "version $V"
