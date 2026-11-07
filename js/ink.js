// 펜 필기 층: S펜으로 쓰고, 손가락은 버튼만 누르게 (손바닥이 닿아도 선이 안 그어져요)
// 획은 사진이 아니라 좌표(0~1)로 저장해서 용량이 작고, 어떤 크기로도 다시 그릴 수 있어요.

export const SHEET_RATIO = 1.6; // 가로:세로 = 16:10

export class Ink {
  constructor(sheet, opts = {}) {
    this.sheet = sheet;
    this.readonly = !!opts.readonly;
    this.allowFinger = !!opts.allowFinger;
    this.strokes = (opts.strokes || []).map((s) => ({ c: s.c, w: s.w, p: s.p.slice() }));
    this.tool = 'pen';
    this.color = '#1D4ED8';
    this.onChange = opts.onChange || null;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ink-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    sheet.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(sheet);
    this.resize();

    if (!this.readonly) this.bind();
  }

  destroy() {
    this.ro.disconnect();
    if (this._unbind) this._unbind();
    this.canvas.remove();
  }

  resize() {
    const r = this.sheet.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  setTool(t) { this.tool = t; }
  setColor(c) { this.color = c; this.tool = 'pen'; }

  undo() {
    this.strokes.pop();
    this.redraw();
    this.changed();
  }

  clear() {
    this.strokes = [];
    this.redraw();
    this.changed();
  }

  changed() { if (this.onChange) this.onChange(); }

  toJSON() { return this.strokes; }

  // ---------- 그리기 ----------
  redraw() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    for (const s of this.strokes) this.drawStroke(s);
  }

  drawStroke(s, from = 1) {
    const { ctx, W, H } = this;
    const p = s.p;
    ctx.strokeStyle = s.c;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (!p.length) return;
    if (p.length === 1) {
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(p[0][0] * W, p[0][1] * H, (s.w * W * (0.5 + p[0][2])) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    for (let i = Math.max(1, from); i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      ctx.lineWidth = Math.max(1, s.w * W * (0.5 + (a[2] + b[2]) / 2));
      ctx.beginPath();
      ctx.moveTo(a[0] * W, a[1] * H);
      ctx.lineTo(b[0] * W, b[1] * H);
      ctx.stroke();
    }
  }

  // ---------- 입력 ----------
  canDraw(e) {
    if (e.pointerType === 'pen') return true;
    if (e.pointerType === 'mouse') return !e.target.closest('button, textarea, input, a');
    if (e.pointerType === 'touch') return this.allowFinger && !e.target.closest('button, textarea, input, a');
    return false;
  }

  point(e) {
    const r = this.sheet.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    const pr = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(pr * 100) / 100];
  }

  eraseAt(pt) {
    const R = 0.02;
    const before = this.strokes.length;
    this.strokes = this.strokes.filter((s) => !s.p.some((q) => {
      const dx = q[0] - pt[0];
      const dy = (q[1] - pt[1]) / SHEET_RATIO;
      return dx * dx + dy * dy < R * R;
    }));
    if (this.strokes.length !== before) { this.redraw(); this.changed(); }
  }

  bind() {
    const sheet = this.sheet;
    let cur = null;
    let id = null;
    let moved = 0;
    let start = null;
    let suppressUntil = 0;

    const down = (e) => {
      if (id !== null || !this.canDraw(e)) return;
      // 펜이 글쓰기 칸 위에 닿아도 커서·글자 선택이 아니라 필기가 되게
      if (e.pointerType === 'pen') e.preventDefault();
      id = e.pointerId;
      moved = 0;
      start = [e.clientX, e.clientY];
      try { sheet.setPointerCapture(id); } catch (_) {}
      const pt = this.point(e);
      if (this.tool === 'eraser') { this.eraseAt(pt); cur = null; return; }
      cur = { c: this.color, w: 0.0045, p: [pt] };
      this.strokes.push(cur);
      this.drawStroke(cur);
    };

    const move = (e) => {
      if (e.pointerId !== id) return;
      e.preventDefault();
      moved = Math.max(moved, Math.hypot(e.clientX - start[0], e.clientY - start[1]));
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) {
        const pt = this.point(ev);
        if (this.tool === 'eraser') { this.eraseAt(pt); continue; }
        if (!cur) continue;
        const last = cur.p[cur.p.length - 1];
        if (Math.abs(last[0] - pt[0]) < 0.0015 && Math.abs(last[1] - pt[1]) < 0.0015) continue;
        cur.p.push(pt);
        this.drawStroke(cur, cur.p.length - 1);
      }
    };

    const up = (e) => {
      if (e.pointerId !== id) return;
      try { sheet.releasePointerCapture(id); } catch (_) {}
      id = null;
      if (moved > 6) suppressUntil = performance.now() + 400;
      if (cur) { cur = null; this.changed(); }
    };

    // 펜으로 글씨를 쓰다가 버튼 위에서 끝나도 버튼이 눌리지 않게
    const click = (e) => {
      if (performance.now() < suppressUntil && e.pointerType !== 'touch') { e.stopPropagation(); e.preventDefault(); }
    };

    sheet.addEventListener('pointerdown', down);
    sheet.addEventListener('pointermove', move, { passive: false });
    sheet.addEventListener('pointerup', up);
    sheet.addEventListener('pointercancel', up);
    sheet.addEventListener('click', click, true);
    this._unbind = () => {
      sheet.removeEventListener('pointerdown', down);
      sheet.removeEventListener('pointermove', move);
      sheet.removeEventListener('pointerup', up);
      sheet.removeEventListener('pointercancel', up);
      sheet.removeEventListener('click', click, true);
    };
  }
}
