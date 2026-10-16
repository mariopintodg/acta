/* Acta · página de presentación: animaciones con el scroll */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Volver a la app si ya se usa en este equipo */
  try { if (localStorage.getItem('acta:settings')) $('#returning').hidden = false; } catch (e) {}

  /* Nav sólida al bajar */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* Videos: se cargan al acercarse y solo se reproducen cuando se ven */
  const vids = $$('video.bgv');
  const io = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting) {
      if (v.dataset.src && !v.src) { v.src = v.dataset.src; v.load(); }
      if (!reduce && (v.classList.contains('on') || !v.classList.contains('scene'))) v.play().catch(() => {});
    } else v.pause();
  }), { rootMargin: '300px 0px' });
  vids.forEach(v => io.observe(v));

  /* Manifiesto: palabras */
  const br = $('#bigRead');
  if (br) {
    const walk = n => [...n.childNodes].forEach(c => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) f.appendChild(document.createTextNode(t)); else { const s = document.createElement('span'); s.className = 'word'; s.textContent = t; f.appendChild(s); } });
        c.replaceWith(f);
      } else walk(c);
    });
    walk(br);
  }

  /* Tarjeta de estudio que se da vuelta */
  const flash = $('.flash');
  if (flash && !reduce) setInterval(() => { const r = flash.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) flash.classList.toggle('flip'); }, 2600);

  const start = () => {
    const G = window.gsap, ST = window.ScrollTrigger;
    if (!G || !ST || reduce) { document.documentElement.classList.remove('js'); if (br) br.classList.add('done'); return; }
    G.registerPlugin(ST);

    /* 1 · Portada */
    const intro = G.timeline({ defaults: { ease: 'power3.out' } });
    intro.to('.hero-title .w', { opacity: 1, y: 0, rotate: 0, filter: 'blur(0px)', duration: 1, stagger: .07 })
      .to('.hero .reveal-up', { opacity: 1, y: 0, duration: .9, stagger: .12 }, '-=.6')
      .from('#heroDevice .device', { y: 120, opacity: 0, rotate: 4, duration: 1.3, ease: 'expo.out' }, .3)
      .from('#heroDevice .float', { scale: .8, opacity: 0, duration: .7, stagger: .15, ease: 'back.out(1.6)' }, 1);
    G.to('#heroMedia', { scale: 1.12, opacity: .35, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    G.to('#heroDevice', { y: -120, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    G.to('.hero-copy', { y: -60, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: '20% top', end: '80% top', scrub: true } });

    /* 2 · Manifiesto, palabra por palabra */
    if (br) G.to(br.querySelectorAll('.word'), { opacity: 1, stagger: .05, ease: 'none', scrollTrigger: { trigger: br, start: 'top 80%', end: 'bottom 45%', scrub: true } });

    const mm = G.matchMedia();

    /* 3 · Graba: escena fija, cambia el lugar */
    const scenes = $$('#graba .scene'), places = $$('#graba .places li'), dots = $$('#graba .stage-progress i');
    let cur = -1;
    const setScene = i => {
      if (i === cur) return; cur = i;
      scenes.forEach((v, k) => { const on = k === i; v.classList.toggle('on', on); if (on) { if (v.dataset.src && !v.src) { v.src = v.dataset.src; v.load(); } v.play().catch(() => {}); } else v.pause(); });
      places.forEach((p, k) => p.classList.toggle('on', k === i));
      dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    };
    setScene(0);
    ST.create({ trigger: '#graba', start: 'top top', end: '+=220%', pin: '.stage-pin', scrub: true, onUpdate: s => setScene(Math.min(2, Math.floor(s.progress * 3))) });
    G.from('.stage-device .device', { y: 140, rotate: -6, opacity: 0, ease: 'power2.out', scrollTrigger: { trigger: '#graba', start: 'top 70%', end: 'top top', scrub: true } });

    /* 4 · La voz se vuelve texto: el video avanza con el scroll */
    const vv = $('#voiceVideo');
    const voiceTl = G.timeline({ scrollTrigger: { trigger: '#voz', start: 'top top', end: '+=200%', pin: '.voice-pin', scrub: .5,
      onUpdate: s => { if (vv && vv.duration) { const t = Math.min(vv.duration - .05, s.progress * 1.25 * vv.duration); if (Math.abs(vv.currentTime - t) > .03) vv.currentTime = t; } } } });
    voiceTl.from('.voice-copy', { y: 40, opacity: 0, duration: .25 })
      .to('.tx-l', { opacity: 1, y: 0, stagger: .12, duration: .2 }, .35)
      .to({}, { duration: .2 });

    /* 5 · El acta se arma sola */
    const wide = innerWidth > 820;
    const asTl = G.timeline({ scrollTrigger: wide ? { trigger: '#acta', start: 'top top', end: '+=180%', pin: '.assemble-pin', scrub: .6 } : { trigger: '#acta', start: 'top 75%', end: 'bottom 85%', scrub: .6 } });
    asTl.from('.as-copy', { y: 40, opacity: 0, duration: .3 })
      .from('.as-dev', { scale: .82, opacity: 0, y: 60, duration: .4 }, 0)
      .from('.piece.p1', { x: -260, y: -80, rotate: -12, opacity: 0, duration: .35 }, .25)
      .from('.piece.p2', { x: 260, y: -60, rotate: 10, opacity: 0, duration: .35 }, .35)
      .from('.piece.p5', { x: -300, y: 40, rotate: 8, opacity: 0, duration: .35 }, .45)
      .from('.piece.p3', { x: -200, y: 160, rotate: -10, opacity: 0, duration: .35 }, .55)
      .from('.g-val', { strokeDasharray: '0 100', duration: .35 }, .6)
      .from('.piece.p4', { x: 240, y: 180, rotate: 12, opacity: 0, duration: .35 }, .65)
      .from('.bars span', { scaleX: 0, transformOrigin: 'left', stagger: .05, duration: .2 }, .8)
      .to({}, { duration: .2 });

    /* 6 · Galería horizontal (computador) */
    mm.add('(min-width: 821px)', () => {
      const track = $('#gTrack');
      const dist = () => Math.max(0, track.scrollWidth - innerWidth);
      G.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#pantallas', start: 'top top', end: () => '+=' + dist(), pin: '.gallery-pin', scrub: .6, invalidateOnRefresh: true } });
      $$('.g-item .device').forEach((d, i) => G.from(d, { y: 60 + (i % 2) * 40, rotate: i % 2 ? 3 : -3, ease: 'none', scrollTrigger: { trigger: '#pantallas', start: 'top 80%', end: 'top top', scrub: true } }));
    });

    /* 7 · Compromisos: primer plano de la frase y mensaje de WhatsApp */
    const cmTl = G.timeline({ scrollTrigger: { trigger: '#compromisos', start: 'top 70%', end: 'center 45%', scrub: .6 } });
    cmTl.from('#compromisos .sd', { y: 120, rotate: 5, opacity: 0, duration: .5 })
      .from('.zoom-card', { scale: .5, x: 80, opacity: 0, duration: .4 }, .3)
      .from('.wa', { y: 60, x: 40, opacity: 0, scale: .9, duration: .4 }, .5);
    G.from('#compromisos .split-copy > *', { y: 30, opacity: 0, stagger: .08, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: '#compromisos', start: 'top 70%' } });

    /* 8 · Modo Clase: la página pasa a claro */
    ST.create({ trigger: '#clase', start: 'top 55%', end: 'bottom 45%', onToggle: s => document.body.classList.toggle('is-light', s.isActive) });
    G.from('#clase .vframe', { clipPath: 'inset(18% 18% 18% 18% round 32px)', scale: 1.08, ease: 'none', scrollTrigger: { trigger: '#clase', start: 'top 85%', end: 'center center', scrub: true } });
    G.from('#clase .sd', { y: 140, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#clase', start: 'top 60%', end: 'center center', scrub: true } });

    /* 9 · Todo de una vez: abanico de archivos */
    const fan = innerWidth < 900 ? 0.62 : 1;
    const pos = [[-210, -120, -14], [-70, -170, -5], [80, -150, 6], [210, -60, 14], [-150, 90, -8], [140, 110, 9]];
    $$('.files .file').forEach((f, i) => {
      const [x, y, r] = pos[i];
      G.fromTo(f, { x: 0, y: 40, rotate: 0, scale: .7, opacity: 0 }, { x: x * fan, y: y * fan + 40, rotate: r, scale: 1, opacity: 1, ease: 'power2.out', scrollTrigger: { trigger: '#exportar', start: 'top 70%', end: 'center 55%', scrub: .6 } });
    });
    G.from('.ex-copy > *', { y: 30, opacity: 0, stagger: .08, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: '#exportar', start: 'top 65%' } });

    /* Entradas suaves de títulos y tarjetas */
    $$('.sec-head, .trust-grid > div, .plan, details, .final-in > *, #clase .split-copy > *').forEach(el =>
      G.from(el, { y: 36, opacity: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } }));

    addEventListener('load', () => ST.refresh());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
