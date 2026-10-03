/* SwipeStack — 판단 카드 스택.
   사용:
     const stack = new SwipeStack(stageEl, {
       renderCard(card) => HTMLElement,      // 카드 앞면(판단 전 정보만)
       canSwipe() => boolean,                // 게이트: 근거 선택 여부
       onBlocked(),                          // 게이트에 막혔을 때 (칩 흔들기 등)
       onCommit(direction, meta)             // 'outperform' | 'underperform', meta = {dx, ms, v, flips, via}
     });
     stack.setDeck(cards); stack.render(); stack.commitByButton('outperform');
   규칙(docs/03_디자인시스템.md §5): 임계 max(80px, 너비×0.3) 또는 속도 0.6px/ms, 회전 ±12°,
   위·아래 스와이프 기능 없음, 스와이프 거리로 확신도를 추정하지 않음. */

(function () {
  const THRESH = 0.3, MINPX = 80, VEL = 0.6, RESET_MS = 180, OUT_MS = 220;

  class SwipeStack {
    constructor(stage, opts) {
      this.stage = stage; this.opts = opts; this.deck = []; this.idx = 0;
      this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    setDeck(cards) { this.deck = cards; this.idx = 0; }
    current() { return this.deck[this.idx]; }
    hasNext() { return this.idx < this.deck.length; }

    render() {
      this.stage.innerHTML = '';
      const n = Math.min(3, this.deck.length - this.idx);
      for (let i = n - 1; i >= 0; i--) {
        const el = document.createElement('div');
        el.className = 'sc' + (i ? ' n' + i : '');
        el.appendChild(this.opts.renderCard(this.deck[this.idx + i]));
        el.insertAdjacentHTML('beforeend', '<div class="sc-stamp sc-stamp--r">잘했다</div><div class="sc-stamp sc-stamp--l">못했다</div>');
        this.stage.appendChild(el);
        if (!i) this._bind(el);
      }
      if (!n) this.stage.innerHTML = '<div class="sc-empty">이번 세션의 카드를 모두 풀었어요</div>';
    }

    _bind(el) {
      const st = { drag: false, sx: 0, sy: 0, dx: 0, dy: 0, t0: 0, flips: 0, last: 0 };
      const w = this.stage.clientWidth;
      const sr = el.querySelector('.sc-stamp--r'), sl = el.querySelector('.sc-stamp--l');
      const pass = () => Math.abs(st.dx) > Math.max(MINPX, w * THRESH) || (Math.abs(st.dx) / Math.max(1, performance.now() - st.t0)) > VEL;

      el.addEventListener('pointerdown', e => {
        st.drag = true; st.sx = e.clientX; st.sy = e.clientY; st.t0 = performance.now(); st.flips = 0; st.last = 0;
        el.classList.add('drag'); el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!st.drag) return;
        st.dx = e.clientX - st.sx; st.dy = e.clientY - st.sy;
        const s = Math.sign(st.dx); if (s && st.last && s !== st.last) st.flips++; if (s) st.last = s;
        const rot = Math.max(-12, Math.min(12, st.dx / 20));
        el.style.transform = `translate(${st.dx}px, ${st.dy * 0.3}px) rotate(${rot}deg)`;
        const p = Math.min(1, Math.abs(st.dx) / Math.max(MINPX, w * THRESH));
        const open = this.opts.canSwipe();
        sr.style.opacity = st.dx > 0 ? (open ? p : Math.min(p, .25)) : 0;
        sl.style.opacity = st.dx < 0 ? (open ? p : Math.min(p, .25)) : 0;
      });
      const end = () => {
        if (!st.drag) return; st.drag = false; el.classList.remove('drag');
        const dt = performance.now() - st.t0, v = Math.abs(st.dx) / Math.max(1, dt);
        if (pass() && this.opts.canSwipe()) {
          this._commit(st.dx > 0 ? 'outperform' : 'underperform', el, { dx: Math.round(st.dx), ms: Math.round(dt), v: +v.toFixed(2), flips: st.flips, via: 'swipe' });
        } else {
          el.style.transform = ''; sr.style.opacity = 0; sl.style.opacity = 0;
          if (pass() && !this.opts.canSwipe() && this.opts.onBlocked) this.opts.onBlocked();
        }
        st.dx = st.dy = 0;
      };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    }

    commitByButton(direction) {
      if (!this.opts.canSwipe()) { this.opts.onBlocked && this.opts.onBlocked(); return; }
      const el = this.stage.lastElementChild; if (!el || !el.classList.contains('sc')) return;
      this._commit(direction, el, { dx: 0, ms: 0, v: 0, flips: 0, via: 'button' });
    }

    _commit(direction, el, meta) {
      const out = (direction === 'outperform' ? 1 : -1) * (this.stage.clientWidth + 120);
      if (!this.reduced) { el.style.transform = `translate(${out}px, -20px) rotate(${direction === 'outperform' ? 14 : -14}deg)`; el.style.opacity = '0'; }
      const card = this.current();
      setTimeout(() => { this.idx++; this.render(); this.opts.onCommit(direction, meta, card); }, this.reduced ? 0 : OUT_MS);
    }

    /* 되돌리기: 마지막 카드로 복귀 (판단 기록 삭제는 호출자가 처리) */
    undo() { if (this.idx > 0) { this.idx--; this.render(); } }
  }

  window.SwipeStack = SwipeStack;
})();
