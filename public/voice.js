/* RCL ERP – SPEAK INTO A BOX (29-10-2026: "jithe jithe type krun entry hotat … tithe voice mick banaw user apla voice madhe bolel AI
 * samjle user kay boltoy perfect samjel ani text madhe add krel ok hindi english marathi ya sagle language support astil"; his
 * answers: the app AND the website; words and numbers). The same file in every module's page (Store, Engineering, the Portal; inline
 * in Mechanical's) – a box added later gets it by itself.
 *   • A box where an entry is typed (text, number, a phone, a note), when it is in use, shows a small 🎙 at its right end.
 *   • Pressed: the browser's own speech recognition (Chrome / Edge – Google's) listens in मराठी, हिंदी or English – the one chosen
 *     last (chips while it listens), else the page's language. What is said goes into the box as if typed; the page sees it as typed.
 *   • A number box gets the NUMBER: "साडे तीन हजार" → 3500, "बारा पॉइंट पाच" → 12.5, "डेढ़ सौ" → 150, "twenty five" → 25 (RclNum).
 *     A phone box: the digits said one by one. A text box: the words, at the cursor.
 *   • Never in a password box, nor where a page says data-novoice.
 *   • A module's page inside Mechanical's screen (the same address – /store/, /engineering/) listens with the screen's own speech.
 *   • A browser that cannot listen (Firefox), or a page whose rule forbids the microphone: no 🎙 – the boxes as before. */
(function () {
  'use strict';
  if (typeof window !== 'undefined' && window.RclVoice) return;
  /* ---------- a number said in words → the number (English, हिंदी, मराठी, mixed) ---------- */
  const NUM = (function () {
    const W = {};
    const add = (v, ...ws) => ws.forEach(w => { W[w] = v; });
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'].forEach((w, i) => add(i, w));
    ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].forEach((w, i) => add(20 + 10 * i, w));
    add(40, 'fourty');
    'शून्य एक दोन तीन चार पाच सहा सात आठ नऊ दहा अकरा बारा तेरा चौदा पंधरा सोळा सतरा अठरा एकोणीस वीस एकवीस बावीस तेवीस चोवीस पंचवीस सव्वीस सत्तावीस अठ्ठावीस एकोणतीस तीस एकतीस बत्तीस तेहेतीस चौतीस पस्तीस छत्तीस सदतीस अडतीस एकोणचाळीस चाळीस एक्केचाळीस बेचाळीस त्रेचाळीस चव्वेचाळीस पंचेचाळीस सेहेचाळीस सत्तेचाळीस अठ्ठेचाळीस एकोणपन्नास पन्नास एक्कावन्न बावन्न त्रेपन्न चोपन्न पंचावन्न छप्पन्न सत्तावन्न अठ्ठावन्न एकोणसाठ साठ एकसष्ठ बासष्ठ त्रेसष्ठ चौसष्ठ पासष्ठ सहासष्ठ सदुसष्ठ अडुसष्ठ एकोणसत्तर सत्तर एकाहत्तर बाहत्तर त्र्याहत्तर चौर्याहत्तर पंच्याहत्तर शहात्तर सत्याहत्तर अठ्ठ्याहत्तर एकोणऐंशी ऐंशी एक्याऐंशी ब्याऐंशी त्र्याऐंशी चौर्याऐंशी पंच्याऐंशी शहाऐंशी सत्त्याऐंशी अठ्ठ्याऐंशी एकोणनव्वद नव्वद एक्याण्णव ब्याण्णव त्र्याण्णव चौर्याण्णव पंच्याण्णव शहाण्णव सत्त्याण्णव अठ्ठ्याण्णव नव्व्याण्णव'
      .split(' ').forEach((w, i) => add(i, w));
    add(33, 'तेहतीस'); add(41, 'एकेचाळीस', 'एक्केचाळिस'); add(44, 'चव्वेचाळिस'); add(46, 'सेहेचाळिस', 'शेहेचाळीस'); add(51, 'एक्कावन', 'एकावन्न'); add(56, 'छप्पन'); add(58, 'अठ्ठावन'); add(76, 'शहात्तर', 'शहाहत्तर');
    add(99, 'नव्याण्णव'); add(75, 'पंचाहत्तर', 'पंचात्तर'); add(71, 'एक्याहत्तर'); add(73, 'त्र्याहात्तर'); add(85, 'पंचाऐंशी'); add(95, 'पंचाण्णव'); add(65, 'पासष्ट'); add(64, 'चौसष्ट');
    add(6, 'साहा'); add(9, 'नौ'); add(100, 'शंभर');
    'शून्य एक दो तीन चार पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अडतीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अडतालीस उनचास पचास इक्यावन बावन तिरेपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरेसठ चौंसठ पैंसठ छियासठ सडसठ अडसठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे'
      .split(' ').forEach((w, i) => add(i, w));
    add(5, 'पाँच', 'पाच'); add(6, 'छः', 'छै', 'छे'); add(15, 'पन्द्रह'); add(79, 'उनासी', 'उन्नासी'); add(2, 'दोन'); add(53, 'तिरपन'); add(63, 'तिरसठ');
    const MUL = { hundred: 100, 'सौ': 100, 'शे': 100, thousand: 1e3, 'हजार': 1e3, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, 'लाख': 1e5, crore: 1e7, crores: 1e7, 'करोड': 1e7, 'कोटी': 1e7, million: 1e6 };
    const PRE = { 'साडे': .5, 'साढे': .5, 'सव्वा': .25, 'सवा': .25, 'पावणे': -.25, 'पौने': -.25 };
    const ALONE = { 'दीड': 1.5, 'डेढ': 1.5, 'अडीच': 2.5, 'ढाई': 2.5, 'अर्धा': .5, 'अर्धे': .5, 'आधा': .5, 'पाव': .25, half: .5, quarter: .25 };
    const POINT = new Set(['point', 'पॉइंट', 'पॉईंट', 'पॉंईट', 'पाइंट', 'पॉइन्ट', 'प्वाइंट', 'दशांश', 'दशमलव', '.', 'dot', 'डॉट']);
    const SKIP = new Set(['and', 'a', 'an', 'व', 'आणि', 'और']);
    const norm = s => String(s || '').toLowerCase().replace(/[‌‍]/g, '').replace(/़/g, '').replace(/ऱ/g, 'र').replace(/[०-९]/g, d => String(d.charCodeAt(0) - 0x966))
      .replace(/(\d),(?=\d)/g, '$1').replace(/₹/g, ' ');
    function word(t) {
      if (/^\d+(\.\d+)?$/.test(t) || /^\.\d+$/.test(t)) return { v: Number(t), d: t };
      if (POINT.has(t)) return { pt: true };
      if (t in MUL) return { m: MUL[t] };
      if (t in ALONE) return { v: ALONE[t] };
      if (t in W) return { v: W[t], d: String(W[t]) };
      if (t in PRE) return { p: PRE[t] };
      // मराठी joined: साडेतीन, पावणेदोन, सव्वाशे; दोनशे, दीडशे, साडेतीनशे; एकशेवीस (120)
      for (const k of Object.keys(PRE)) if (t.length > k.length && t.startsWith(k)) { const r = word(t.slice(k.length)); if (r && (r.v !== undefined || r.m)) return Object.assign({}, r, { pre: PRE[k] + (r.pre || 0) }); }
      if (/शे$/.test(t) && t.length > 2) { const r = word(t.slice(0, -2)); if (r && r.v !== undefined) return { v: r.v, pre: r.pre, then: 100 }; }
      const m = /^(.+?)शे(.+)$/.exec(t); if (m) { const a = word(m[1]), b = word(m[2]); if (a && a.v !== undefined && b && b.v !== undefined) return { v: a.v * 100 + b.v }; }
      return null;
    }
    function toNumber(text, mode) {
      const toks = norm(text).replace(/(\d)\s*\.\s*(\d)/g, '$1.$2').split(/[\s\-–,;:/]+|(?<=[^\d.])(?=\d)|(?<=\d)(?=[^\d.])/).map(x => x.trim()).filter(Boolean);
      if (mode === 'digits') { let out = ''; for (const t of toks) { const w = word(t); if (w && w.d !== undefined && w.d !== null) out += w.d; } return out; }
      let total = 0, cur = 0, seen = false, pre = 0, frac = null, done = false, last = null;      // (last: the value just before – "twenty five" goes on; "बारा पंधरा" is two numbers: the first)
      for (const t of toks) {
        if (done) break;
        if (SKIP.has(t)) continue;
        const w = word(t);
        if (!w) { if (seen && (frac !== null || cur || total)) done = true; last = null; continue; }      // (a unit or another word after the number: the end)
        if (w.pt) { if (frac === null) { frac = ''; seen = true; } continue; }
        if (frac !== null) { if (w.d !== undefined && w.d !== null) frac += String(w.d).replace('.', ''); else done = true; continue; }      // (after the point: its digits)
        seen = true;
        if (w.p !== undefined && w.v === undefined && !w.m) { pre += w.p; continue; }
        if (w.m && w.v === undefined) { last = null; const base = (cur || 1) + (w.pre || 0) + pre; pre = 0; if (w.m === 100) cur = base * 100; else { total += base * w.m; cur = 0; } continue; }
        if (last !== null && w.v >= 1 && (last % 10 !== 0 || last >= 100 || w.v >= 10 || !Number.isInteger(last))) break;      // (a half / a quarter may follow: "two and a half")
        const v = w.v + (w.pre || 0) + pre; pre = 0;
        if (w.then) { cur += v * w.then; last = null; continue; }
        cur += v; last = v;
      }
      if (!seen) return '';
      let n = total + cur + pre;
      if (frac) n = Math.trunc(n) + Number('0.' + frac) + (n - Math.trunc(n));
      return isFinite(n) ? String(Math.round(n * 1000) / 1000) : '';
    }
    return { toNumber };
  })();
  if (typeof window === 'undefined' || typeof document === 'undefined') { if (typeof module === 'object' && module.exports) module.exports = { toNumber: NUM.toNumber }; return; }      // (node: the unit test)

  /* ---------- the microphone ---------- */
  const LANGS = [['mr', 'मराठी', 'mr-IN'], ['hi', 'हिंदी', 'hi-IN'], ['en', 'English', 'en-IN']];
  const SAY = {
    hear: { mr: 'ऐकत आहे… बोला', hi: 'सुन रहा है… बोलिए', en: 'Listening… speak' },
    none: { mr: 'काहीच ऐकू आले नाही – 🎙 दाबून पुन्हा बोला.', hi: 'कुछ सुनाई नहीं दिया – 🎙 दबाकर फिर बोलिए।', en: 'Nothing was heard – press 🎙 and speak again.' },
    nonum: { mr: 'आकडा समजला नाही', hi: 'संख्या समझ नहीं आई', en: 'No number understood' },
    mic: { mr: 'Microphone ला परवानगी नाही – address च्या डावीकडील 🔒 दाबा → Microphone → Allow, मग 🎙 पुन्हा दाबा.', hi: 'Microphone की अनुमति नहीं – address के बाईं ओर 🔒 दबाएँ → Microphone → Allow, फिर 🎙 दबाएँ।', en: 'The microphone is not allowed – press the 🔒 left of the address → Microphone → Allow, then press 🎙 again.' },
    nomic: { mr: 'या device वर microphone सापडला नाही.', hi: 'इस device पर microphone नहीं मिला।', en: 'No microphone was found on this device.' },
    net: { mr: 'बोललेले समजण्यासाठी internet लागते – connection बघा.', hi: 'बोले हुए को समझने के लिए internet चाहिए – connection देखें।', en: 'Speech needs the internet – check the connection.' },
    cant: { mr: 'हा browser ऐकू शकत नाही – Chrome किंवा Edge वापरा.', hi: 'यह browser सुन नहीं सकता – Chrome या Edge इस्तेमाल करें।', en: 'This browser cannot listen – use Chrome or Edge.' },
    tip: { mr: 'बोलून लिहा (मराठी / हिंदी / English)', hi: 'बोलकर लिखें (मराठी / हिंदी / English)', en: 'Speak to type (मराठी / हिंदी / English)' },
  };
  const keyOf = 'rcl-voice-lang';
  const kept = () => { try { return localStorage.getItem(keyOf) || ''; } catch (e) { return ''; } };
  let lang = (LANGS.find(l => l[0] === kept()) || [])[0] || (typeof window.rclVoiceLang === 'function' && LANGS.some(l => l[0] === window.rclVoiceLang()) ? window.rclVoiceLang() : '') || 'mr';
  const say = k => (SAY[k] || {})[lang] || (SAY[k] || {}).en || '';
  const topWin = () => { try { if (window.top && window.top.location.origin === location.origin && (window.top.SpeechRecognition || window.top.webkitSpeechRecognition)) return window.top; } catch (e) { /* another site */ } return window; };
  const Ctor = () => { const w = topWin(); return w.SpeechRecognition || w.webkitSpeechRecognition || null; };
  const micHere = () => { try { const fp = document.permissionsPolicy || document.featurePolicy; return fp && fp.allowsFeature ? fp.allowsFeature('microphone') : true; } catch (e) { return true; } };
  // the boxes where an entry is typed
  function fits(el) {
    if (!el || el.disabled || el.readOnly || !el.isConnected) return false;
    if (el.closest && el.closest('[data-novoice]')) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    const t = String(el.getAttribute('type') || 'text').toLowerCase();
    if (['text', 'search', 'number', 'tel'].indexOf(t) === -1) return false;
    return !/pass|otp|pin\b|captcha/i.test([el.name, el.id, el.autocomplete].join(' '));
  }
  const kindOf = el => { const t = String(el.getAttribute('type') || '').toLowerCase(), im = String(el.getAttribute('inputmode') || '').toLowerCase();
    return t === 'tel' || im === 'tel' ? 'digits' : t === 'number' || im === 'decimal' || im === 'numeric' ? 'number' : 'text'; };

  let box = null, rec = null, live = false, heard = '';
  const css = document.createElement('style');
  css.textContent = '#rclv_btn{position:fixed;z-index:2147483000;width:30px;height:30px;border-radius:50%;border:1px solid #C9D2DC;background:#fff;color:#1D55E2;display:none;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 1px 4px rgba(16,24,40,.18)}' +
    '#rclv_btn svg{width:17px;height:17px}#rclv_btn.on{background:#D92D20;border-color:#D92D20;color:#fff;animation:rclvp 1.1s ease-in-out infinite}#rclv_btn:focus-visible{outline:2px solid #1D55E2;outline-offset:2px}' +
    '@keyframes rclvp{0%,100%{box-shadow:0 0 0 0 rgba(217,45,32,.45)}50%{box-shadow:0 0 0 7px rgba(217,45,32,0)}}@media (prefers-reduced-motion:reduce){#rclv_btn.on{animation:none}}' +
    '#rclv_tip{position:fixed;z-index:2147483001;max-width:min(360px,calc(100vw - 16px));background:#101828;color:#fff;border-radius:10px;padding:8px 10px;font:13px/1.4 system-ui,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 6px 20px rgba(16,24,40,.28);display:none}' +
    '#rclv_tip .w{margin:2px 0 6px;color:#E4E7EC;word-break:break-word}#rclv_tip .l{display:flex;gap:6px;flex-wrap:wrap}#rclv_tip .l button{border:1px solid #475467;background:transparent;color:#fff;border-radius:999px;padding:2px 10px;font:inherit;cursor:pointer}' +
    '#rclv_tip .l button[aria-pressed="true"]{background:#fff;color:#101828;border-color:#fff}#rclv_tip .bad{color:#FDA29B}';
  document.head.appendChild(css);
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'rclv_btn'; btn.tabIndex = -1;
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>';
  const tip = document.createElement('div'); tip.id = 'rclv_tip'; tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');
  const mount = () => { if (!btn.isConnected) document.body.appendChild(btn); if (!tip.isConnected) document.body.appendChild(tip); };
  const able = () => !!Ctor() && micHere();
  function place() {
    if (!box || !box.isConnected) return hide();
    const r = box.getBoundingClientRect();
    if (r.width < 30 || r.bottom < 0 || r.top > innerHeight) { btn.style.display = 'none'; return; }
    const inside = r.width >= 120, x = inside ? r.right - 34 : r.right + 4, y = r.top + Math.max(0, (Math.min(r.height, 44) - 30) / 2);
    btn.style.left = Math.max(4, Math.min(innerWidth - 34, x)) + 'px'; btn.style.top = Math.max(4, y) + 'px'; btn.style.display = 'flex';
    btn.title = say('tip'); btn.setAttribute('aria-label', say('tip'));
    if (tip.style.display !== 'none') { const tw = Math.min(360, innerWidth - 16); tip.style.left = Math.max(8, Math.min(innerWidth - tw - 8, r.left)) + 'px';
      const below = r.bottom + 8, h = tip.offsetHeight || 80; tip.style.top = (below + h > innerHeight ? Math.max(8, r.top - h - 8) : below) + 'px'; }
  }
  function hide() { btn.style.display = 'none'; if (!live) tip.style.display = 'none'; }
  function show(msg, bad) {
    tip.innerHTML = '<div>' + (live ? '🎙 ' : '') + esc(msg) + '</div>' + (heard ? '<div class="w">“' + esc(heard) + '”</div>' : '') +
      '<div class="l">' + LANGS.map(l => '<button type="button" data-l="' + l[0] + '" aria-pressed="' + (l[0] === lang) + '">' + l[1] + '</button>').join('') + '</div>';
    if (bad) tip.firstChild.className = 'bad';
    tip.style.display = 'block'; place();
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // what was heard → the box, as typed
  function put(text) {
    const el = box; if (!el || !el.isConnected) return;
    const k = kindOf(el), t = String(text || '').trim(); if (!t) { show(say('none'), true); return; }
    let v;
    if (k === 'text') {
      const s = el.selectionStart === null || el.selectionStart === undefined ? el.value.length : el.selectionStart, e = el.selectionEnd === null || el.selectionEnd === undefined ? s : el.selectionEnd;
      const before = el.value.slice(0, s), ins = (before && !/\s$/.test(before) ? ' ' : '') + t;
      const max = el.maxLength > 0 ? el.maxLength : Infinity, out = (before + ins + el.value.slice(e)).slice(0, max);
      el.value = out; try { const c = Math.min(out.length, before.length + ins.length); el.setSelectionRange(c, c); } catch (x) { /* a box without a cursor */ }
    } else {
      v = NUM.toNumber(t, k === 'digits' ? 'digits' : '');
      if (!v) { heard = t; show(say('nonum') + ' – ' + say('none'), true); return; }
      el.value = v;
    }
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    tip.style.display = 'none'; heard = '';
  }
  function fail(code) {
    live = false; btn.classList.remove('on'); rec = null;
    show(code === 'not-allowed' || code === 'service-not-allowed' ? say('mic') : code === 'audio-capture' ? say('nomic') : code === 'network' ? say('net') : code === 'cant' ? say('cant') : say('none'), true);
  }
  function stop() { live = false; btn.classList.remove('on'); const r = rec; rec = null; try { if (r) r.abort(); } catch (e) { /* gone */ } }
  function start() {
    if (live) { stop(); tip.style.display = 'none'; return; }
    heard = ''; live = true; btn.classList.add('on'); show(say('hear'));
    const R = Ctor();
    if (R) {
      const r = new R(); rec = r; r.lang = (LANGS.find(l => l[0] === lang) || LANGS[2])[2]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      let fin = '';
      r.onresult = e => { let t = ''; for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = t; } heard = t; show(say('hear')); };
      r.onerror = e => { if (rec !== r) return; const c = e && e.error; if (c === 'no-speech' || c === 'aborted') return; fail(c); };
      r.onend = () => { if (rec !== r) return; rec = null; const was = live; live = false; btn.classList.remove('on'); if (!was) return; const t = (fin || heard).trim(); if (!t) { show(say('none'), true); return; } put(t); };
      try { r.start(); } catch (e) { fail('cant'); }
      return;
    }
    fail('cant');
  }
  btn.addEventListener('mousedown', e => e.preventDefault());      // (the box keeps the cursor)
  btn.addEventListener('click', e => { e.preventDefault(); if (box) box.focus({ preventScroll: true }); start(); });
  tip.addEventListener('mousedown', e => e.preventDefault());
  tip.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; lang = b.dataset.l; try { localStorage.setItem(keyOf, lang); } catch (x) { /* this browser keeps nothing */ }
    if (live) { stop(); start(); } else show(say('tip')); });
  document.addEventListener('focusin', e => { const el = e.target; if (!fits(el) || !able()) { if (el !== btn && !live) { box = null; hide(); } return; } mount(); if (box !== el && live) stop(); box = el; place(); }, true);
  document.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (live) return; if (!fits(a)) { box = null; hide(); } }, 150), true);
  addEventListener('scroll', () => { if (box) place(); }, true); addEventListener('resize', () => { if (box) place(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && live) { stop(); tip.style.display = 'none'; } });
  window.RclVoice = { toNumber: NUM.toNumber, lang: () => lang };
})();
