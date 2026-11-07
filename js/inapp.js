/* 카카오톡·네이버·페이스북·인스타그램 등 인앱 브라우저에서 열리면 기본 브라우저로 넘겨요. */
(function () {
  var ua = navigator.userAgent || '';
  var url = location.href;
  var inApp = /KAKAOTALK|NAVER\(inapp|FBAN|FBAV|FB_IAB|Instagram|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
  if (!inApp) return;

  if (/KAKAOTALK/i.test(ua)) {
    location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    return;
  }

  if (/Android/i.test(ua)) {
    var noScheme = url.replace(/^https?:\/\//, '');
    location.href = 'intent://' + noScheme + '#Intent;scheme=https;package=com.android.chrome;end';
    return;
  }

  // iPhone·iPad: 직접 열 방법이 없어서 안내를 띄워요
  document.addEventListener('DOMContentLoaded', function () {
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1F2430;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font:500 20px/1.6 sans-serif';
    box.innerHTML = '<div style="font-size:28px;font-weight:900">Safari로 열어 주세요</div>' +
      '<div>오른쪽 아래 <b>···</b> 또는 공유 버튼을 누르고<br>"Safari로 열기"를 골라 주세요.</div>';
    document.body.appendChild(box);
  });
})();
