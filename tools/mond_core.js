/**
 * Mondmission – Personalisierung der PDF (reines JavaScript, läuft in Apps Script und lokal in Node).
 * Stempelt per PDF-Inkrement auf die Basis-Vorlage:
 *   Titel + Urkunde: Name (Raleway Bold) · Ausweis: Name zum Nachspuren (Einstrich-Schrift) + gepunktete Zeile
 *   Sternbild: Anfangsbuchstabe als Sterne · 17 QR-Codes mit dem persönlichen Code (?s=N&k=CODE)
 */
var MOND_PLAYER_URL = 'https://abenteuerweltchen.github.io/mondmission-player/';

function cleanName_(raw) {
  var name = String(raw || '').normalize('NFC').replace(/\([^)]*\)/g, ' ').replace(/[„“"”]/g, '').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('EMPTY_NAME: Kein Name angegeben');
  if (/[@0-9]/.test(name)) throw new Error('BAD_NAME: Name sieht falsch aus: "' + name + '"');
  if (/\b(und|&|\+)\b|,|\//i.test(name)) throw new Error('BAD_NAME: Mehrere Namen? "' + name + '" – bitte prüfen');
  if (Array.from(name).length > 24) throw new Error('NAME_TOO_LONG: Name zu lang (max. 24 Zeichen): "' + name + '"');
  if (name === name.toLowerCase() || name === name.toUpperCase()) {
    name = name.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, function (_, sep, ch) { return sep + ch.toUpperCase(); });
  }
  return name;
}
function cleanGender_(raw) {
  var g = String(raw || '').trim().toLowerCase();
  if (['mädchen', 'maedchen', 'madchen', 'w', 'weiblich', 'girl', 'f', 'female', 'tochter'].indexOf(g) >= 0) return 'w';
  if (['junge', 'm', 'männlich', 'maennlich', 'mannlich', 'boy', 'male', 'sohn'].indexOf(g) >= 0) return 'm';
  throw new Error('BAD_GENDER: Unbekanntes Geschlecht "' + raw + '" (erwartet Junge oder Mädchen)');
}

function personalizeMond(tplBytes, rawName, rawGender, code) {
  var name = cleanName_(rawName), gender = cleanGender_(rawGender);
  if (!/^[a-z0-9]{6,16}$/.test(code)) throw new Error('BAD_CODE');
  var bytes = tplBytes instanceof Uint8Array ? tplBytes : Uint8Array.from(tplBytes, function (b) { return b & 255; });
  var data = readData_(bytes), sp = data.spec;
  var miss = Array.from(name).filter(function (ch) { return !data.font.glyphs[ch] || !data.hershey[ch]; });
  if (miss.length) throw new Error('UNSUPPORTED_CHAR: Zeichen nicht unterstützt: ' + miss.join(' '));
  var ops = {};
  var add = function (page, s) { ops[page] = (ops[page] || '') + s; };
  sp.name_slots.forEach(function (sl) { add(sl.page, textOps_(data.font, name, sl)); });
  sp.qr.forEach(function (q) { add(q.page, qrOps_(MOND_PLAYER_URL + '?s=' + q.s + '&k=' + code, q)); });
  add(sp.ausweis.page, ausweisOps_(data.hershey, name, sp.ausweis));
  add(sp.sternbild.page, sternbildOps_(data, firstLetter_(name), sp.sternbild));

  var tail = asciiSlice_(bytes, Math.max(0, bytes.length - 2048), bytes.length);
  var prev = parseInt(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail)[1], 10);
  var size = parseInt(/\/Size\s+(\d+)/.exec(tail.slice(tail.lastIndexOf('trailer')))[1], 10);
  var infoM = /\/Info\s+(\d+)\s+0\s+R/.exec(tail.slice(tail.lastIndexOf('trailer')));
  var objs = [], next = size;
  var qObj = next++, QObj = next++;
  objs.push([qObj, stream_('q')], [QObj, stream_('Q')]);
  data.pages.forEach(function (pg, idx) {
    var contents = pg.contents;
    if (ops[idx + 1]) {
      var o = next++;
      objs.push([o, stream_('q\n' + ops[idx + 1] + 'Q')]);
      contents = qObj + ' 0 R ' + contents + ' ' + QObj + ' 0 R ' + o + ' 0 R';
    }
    objs.push([pg.obj, pg.dict.replace('__PARENT__', data.root + ' 0 R').replace('__CONTENTS__', '[' + contents + ']')]);
  });
  objs.push([data.root, '<</Type/Pages/Kids[' + data.pages.map(function (p) { return p.obj + ' 0 R'; }).join(' ') + ']/Count ' + data.pages.length + '>>']);
  if (infoM) objs.push([parseInt(infoM[1], 10), '<</Title' + pdfText_('Mission zum Mond – Astronauten-Training für ' + name) + '/Producer(Abenteuerweltchen)>>']);
  var parts = ['\n'], offset = bytes.length + 1, xref = [];
  objs.forEach(function (o) {
    var txt = o[0] + ' 0 obj\n' + o[1] + '\nendobj\n';
    xref.push([o[0], offset]); parts.push(txt); offset += txt.length;
  });
  xref.sort(function (a, b) { return a[0] - b[0]; });
  var xs = 'xref\n0 1\n0000000000 65535 f \n';
  xref.forEach(function (e) { xs += e[0] + ' 1\n' + ('0000000000' + e[1]).slice(-10) + ' 00000 n \n'; });
  xs += 'trailer\n<</Size ' + next + '/Root ' + data.catalog + ' 0 R' + (infoM ? '/Info ' + infoM[1] + ' 0 R' : '') + '/Prev ' + prev + '>>\nstartxref\n' + offset + '\n%%EOF\n';
  parts.push(xs);
  var addStr = parts.join('');
  var out = new Uint8Array(bytes.length + addStr.length);
  out.set(bytes, 0);
  for (var i = 0; i < addStr.length; i++) out[bytes.length + i] = addStr.charCodeAt(i) & 255;
  return { bytes: out, name: name, gender: gender };
}

function firstLetter_(name) {
  var c = Array.from(name)[0].toUpperCase();
  var map = { 'É': 'E', 'È': 'E', 'Ê': 'E', 'Á': 'A', 'À': 'A', 'Â': 'A', 'Ó': 'O', 'Ò': 'O', 'Ô': 'O', 'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ç': 'C', 'Ñ': 'N' };
  return map[c] || c;
}
function rgb_(hex, op) {
  var n = parseInt(hex.slice(1), 16);
  return fmt_(((n >> 16) & 255) / 255) + ' ' + fmt_(((n >> 8) & 255) / 255) + ' ' + fmt_((n & 255) / 255) + ' ' + op + '\n';
}

/** Name als Text, mittig, bei Bedarf kleiner (max_width). */
function textOps_(font, name, sl) {
  var width = function (size) { return layout_(font, name, size, sl.tracking).width; };
  var size = sl.size * Math.min(1, sl.max_width / width(sl.size));
  var l = layout_(font, name, size, sl.tracking), k = size / font.upem, x = sl.cx - l.width / 2, s = rgb_(sl.color, 'rg');
  l.items.forEach(function (it) { if (it.path) s += svgToPdf_(it.path, x + it.x, sl.base, k) + 'f\n'; });
  return s;
}

/** QR-Code als Vektor (weißer Grund, 2 Module Rand). */
function qrOps_(url, q) {
  var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  var n = qr.getModuleCount(), m = q.size / (n + 4), s = '1 1 1 rg\n' + fmt_(q.x) + ' ' + fmt_(q.y) + ' ' + fmt_(q.size) + ' ' + fmt_(q.size) + ' re f\n0.11 0.13 0.18 rg\n';
  for (var r = 0; r < n; r++) {
    var c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      var c0 = c; while (c < n && qr.isDark(r, c)) c++;
      s += fmt_(q.x + (c0 + 2) * m) + ' ' + fmt_(q.y + q.size - (r + 3) * m) + ' ' + fmt_((c - c0) * m + 0.02) + ' ' + fmt_(m + 0.02) + ' re\n';
    }
  }
  return s + 'f\n';
}

/** Ausweis: Name groß zum Nachfahren (grüne Startpunkte) + darunter gepunktet. Koordinaten in Bild-Pixeln (1003×540). */
function ausweisOps_(H, name, a) {
  var X = function (px) { return fmt_(a.x0 + px * a.sc); }, Y = function (py) { return fmt_(a.ytop - py * a.sc); };
  var word = function () {
    var x = 0, res = [];
    Array.from(name).forEach(function (ch) {
      var g = H[ch];
      g.p.forEach(function (p) { res.push(p.map(function (pt) { return [pt[0] + x, pt[1]]; })); });
      x += g.w + 6;
    });
    return { paths: res, w: x - 6 };
  }();
  var shrink = Math.min(1, 903 / (word.w * 140 / 21));   // lange Namen: alles etwas kleiner
  var place = function (base, cap) {
    var k = cap / 21;
    if (word.w * k > 903) k = 903 / word.w;
    return word.paths.map(function (p) { return p.map(function (pt) { return [501.5 - word.w * k / 2 + pt[0] * k, base + (pt[1] - 9) * k]; }); });
  };
  var line = function (p) {
    var s = X(p[0][0]) + ' ' + Y(p[0][1]) + ' m\n';
    for (var i = 1; i < p.length; i++) s += X(p[i][0]) + ' ' + Y(p[i][1]) + ' l\n';
    if (p.length === 1) s += X(p[0][0] + 0.01) + ' ' + Y(p[0][1]) + ' l\n';
    return s + 'S\n';
  };
  var s = '1 J 1 j\n' + rgb_('#d6dee8', 'RG') + fmt_(Math.max(8, 14 * shrink) * a.sc) + ' w\n';
  var big = place(258, 140);
  big.forEach(function (p) { s += line(p); });
  s += rgb_('#a0aab4', 'RG') + fmt_(4.4 * a.sc) + ' w [0 ' + fmt_(9 * a.sc) + '] 0 d\n';
  place(386, 90).forEach(function (p) { s += line(p); });
  return s + '[] 0 d\n';
}

/** Sternbild-Seite: Rahmen, kleine Hintergrundsterne, nummerierte Sterne des Anfangsbuchstabens. Bild-Pixel 1003×534. */
function sternbildOps_(data, letter, b) {
  var X = function (px) { return b.x0 + px * b.sc; }, Y = function (py) { return b.ytop - py * b.sc; };
  var SB = data.sternbild, strokes = SB.letters[letter] || SB.letters['M'];
  var uml = SB.umlaut.indexOf(letter) >= 0;
  var x0 = 260, x1 = 740, y0 = uml ? 130 : 80, y1 = 460;
  if (['I', 'J', 'L'].indexOf(letter) >= 0) { x0 = 380; x1 = 620; }
  var stars = [], segs = [], hints = [];
  strokes.forEach(function (st) {
    var first = stars.length, prev = null;
    st.forEach(function (pt, i) {
      var idx;
      if (typeof pt === 'string') idx = parseInt(pt.slice(1), 10);
      else if (i === st.length - 1 && i > 0 && pt[0] === st[0][0] && pt[1] === st[0][1]) { hints.push([prev, first]); return; }
      else { stars.push([x0 + (x1 - x0) * pt[0], y0 + (y1 - y0) * pt[1]]); idx = stars.length - 1; }
      if (prev !== null) (typeof pt === 'string' ? hints : segs).push([prev, idx]);
      prev = idx;
    });
  });
  var s = '1 J 1 j\n';
  // Rahmen
  s += '1 1 1 rg ' + rgb_('#23345c', 'RG') + fmt_(3 * b.sc) + ' w\n' + rrect_(X(2), Y(532), 999 * b.sc, 530 * b.sc, 26 * b.sc) + 'B\n';
  // Hintergrund-Sterne (fester Zufall je Buchstabe)
  var seed = letter.charCodeAt(0) * 9973, rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  var deco = [];
  for (var t = 0; t < 400 && deco.length < 45; t++) {
    var x = 40 + rnd() * 923, y = 30 + rnd() * 474, r = 4 + rnd() * 5;
    var free = stars.every(function (p) { return Math.hypot(x - p[0], y - p[1]) > 75; }) &&
               deco.every(function (p) { return Math.hypot(x - p[0], y - p[1]) > 18; }) && !(uml && y < 120 && x > 330 && x < 670);
    if (free) deco.push([x, y, r]);
  }
  s += '1 1 1 rg ' + rgb_('#cdd6e2', 'RG') + fmt_(2 * b.sc) + ' w\n';
  deco.forEach(function (d) { s += starPath_(X(d[0]), Y(d[1]), d[2] * b.sc) + 'B\n'; });
  // Hilfslinien (gepunktet) für Rückwege/Schluss
  if (hints.length) {
    s += rgb_('#cdd6e2', 'RG') + fmt_(3 * b.sc) + ' w [0 ' + fmt_(10 * b.sc) + '] 0 d\n';
    hints.forEach(function (h) { s += fmt_(X(stars[h[0]][0])) + ' ' + fmt_(Y(stars[h[0]][1])) + ' m ' + fmt_(X(stars[h[1]][0])) + ' ' + fmt_(Y(stars[h[1]][1])) + ' l S\n'; });
    s += '[] 0 d\n';
  }
  // Umlaut-Punkte als kleine Sterne
  if (uml) {
    s += '1 1 1 rg ' + rgb_('#4c677c', 'RG') + fmt_(3 * b.sc) + ' w\n';
    [395, 605].forEach(function (x) { s += starPath_(X(x), Y(78), 22 * b.sc) + 'B\n'; });
  }
  // Große Sterne + Nummern
  var D = data.digits, k = 24 / D.upem * b.sc;
  stars.forEach(function (p, i) {
    s += '1 1 1 rg ' + rgb_('#4c677c', 'RG') + fmt_(4 * b.sc) + ' w\n' + starPath_(X(p[0]), Y(p[1]), 40 * b.sc) + 'B\n';
    var cx = p[0] + 46, cy = p[1] - 34;
    s += rgb_('#23345c', 'rg') + circle_(X(cx), Y(cy), 19 * b.sc) + 'f\n1 1 1 rg\n';
    var txt = String(i + 1), gl = txt.split('').map(function (c) { return D.glyphs[c]; });
    var w = gl.reduce(function (t, g) { return t + g[0]; }, 0);
    var top = Math.min.apply(null, gl.map(function (g) { return g[2][1]; })), bot = Math.max.apply(null, gl.map(function (g) { return g[2][3]; }));
    var gx = X(cx) - w * k / 2, base = Y(cy) + ((top + bot) / 2) * k;   // y-unten-Glyphen: Mitte der Ziffernhöhe auf cy
    gl.forEach(function (g) { s += svgToPdf_(g[1], gx, base, k) + 'f\n'; gx += g[0] * k; });
  });
  return s;
}
function starPath_(cx, cy, r) {
  var s = '';
  for (var i = 0; i < 10; i++) {
    var rr = i % 2 === 0 ? r : r * 0.45, a = -Math.PI / 2 + i * Math.PI / 5;
    s += fmt_(cx + rr * Math.cos(a)) + ' ' + fmt_(cy - rr * Math.sin(a)) + (i ? ' l\n' : ' m\n');
  }
  return s + 'h\n';
}
function circle_(cx, cy, r) {
  var c = 0.5523 * r;
  return fmt_(cx + r) + ' ' + fmt_(cy) + ' m\n' +
    fmt_(cx + r) + ' ' + fmt_(cy + c) + ' ' + fmt_(cx + c) + ' ' + fmt_(cy + r) + ' ' + fmt_(cx) + ' ' + fmt_(cy + r) + ' c\n' +
    fmt_(cx - c) + ' ' + fmt_(cy + r) + ' ' + fmt_(cx - r) + ' ' + fmt_(cy + c) + ' ' + fmt_(cx - r) + ' ' + fmt_(cy) + ' c\n' +
    fmt_(cx - r) + ' ' + fmt_(cy - c) + ' ' + fmt_(cx - c) + ' ' + fmt_(cy - r) + ' ' + fmt_(cx) + ' ' + fmt_(cy - r) + ' c\n' +
    fmt_(cx + c) + ' ' + fmt_(cy - r) + ' ' + fmt_(cx + r) + ' ' + fmt_(cy - c) + ' ' + fmt_(cx + r) + ' ' + fmt_(cy) + ' c\nh\n';
}
function rrect_(x, y, w, h, r) {
  var c = 0.5523 * r;
  return fmt_(x + r) + ' ' + fmt_(y) + ' m ' + fmt_(x + w - r) + ' ' + fmt_(y) + ' l ' +
    fmt_(x + w - r + c) + ' ' + fmt_(y) + ' ' + fmt_(x + w) + ' ' + fmt_(y + r - c) + ' ' + fmt_(x + w) + ' ' + fmt_(y + r) + ' c ' +
    fmt_(x + w) + ' ' + fmt_(y + h - r) + ' l ' +
    fmt_(x + w) + ' ' + fmt_(y + h - r + c) + ' ' + fmt_(x + w - r + c) + ' ' + fmt_(y + h) + ' ' + fmt_(x + w - r) + ' ' + fmt_(y + h) + ' c ' +
    fmt_(x + r) + ' ' + fmt_(y + h) + ' l ' +
    fmt_(x + r - c) + ' ' + fmt_(y + h) + ' ' + fmt_(x) + ' ' + fmt_(y + h - r + c) + ' ' + fmt_(x) + ' ' + fmt_(y + h - r) + ' c ' +
    fmt_(x) + ' ' + fmt_(y + r) + ' l ' +
    fmt_(x) + ' ' + fmt_(y + r - c) + ' ' + fmt_(x + r - c) + ' ' + fmt_(y) + ' ' + fmt_(x + r) + ' ' + fmt_(y) + ' c h\n';
}

// ---------- Hilfsfunktionen (wie bei den Schatzsuchen) ----------
function readData_(bytes) {
  var start = indexOf_(bytes, '%%AWDATA-BEGIN%%'), end = indexOf_(bytes, '%%AWDATA-END%%', start);
  if (start < 0 || end < 0) throw new Error('TEMPLATE: Vorlage ohne Layoutdaten (falsche Datei?)');
  return JSON.parse(asciiSlice_(bytes, start + 16, end));
}
function indexOf_(bytes, ascii, from) {
  var first = ascii.charCodeAt(0), n = ascii.length;
  outer: for (var i = from || 0; i <= bytes.length - n; i++) {
    if (bytes[i] !== first) continue;
    for (var j = 1; j < n; j++) if (bytes[i + j] !== ascii.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
}
function asciiSlice_(bytes, a, b) {
  var s = '', CH = 8192;
  for (var i = a; i < b; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + CH)));
  return s;
}
function layout_(font, text, size, tracking) {
  var s = size / font.upem, items = [], x = 0;
  Array.from(text).forEach(function (ch) {
    var gl = font.glyphs[ch];
    items.push({ x: x, path: gl[1] });
    x += gl[0] * s + tracking * size;
  });
  return { items: items, width: x - tracking * size };
}
function svgToPdf_(d, ox, oy, k) {
  var t = d.match(/[MLHVQCZmlhvqcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [], i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, out = '';
  var X = function (v) { return fmt_(ox + v * k); }, Y = function (v) { return fmt_(oy - v * k); };
  var num = function () { return parseFloat(t[i++]); };
  while (i < t.length) {
    if (/[A-Za-z]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M') { cx = num(); cy = num(); sx = cx; sy = cy; out += X(cx) + ' ' + Y(cy) + ' m\n'; cmd = 'L'; }
    else if (cmd === 'L') { cx = num(); cy = num(); out += X(cx) + ' ' + Y(cy) + ' l\n'; }
    else if (cmd === 'H') { cx = num(); out += X(cx) + ' ' + Y(cy) + ' l\n'; }
    else if (cmd === 'V') { cy = num(); out += X(cx) + ' ' + Y(cy) + ' l\n'; }
    else if (cmd === 'Q') {
      var qx = num(), qy = num(), x = num(), y = num();
      out += X(cx + 2 / 3 * (qx - cx)) + ' ' + Y(cy + 2 / 3 * (qy - cy)) + ' ' + X(x + 2 / 3 * (qx - x)) + ' ' + Y(y + 2 / 3 * (qy - y)) + ' ' + X(x) + ' ' + Y(y) + ' c\n';
      cx = x; cy = y;
    } else if (cmd === 'C') {
      var a = num(), b = num(), c = num(), e = num(); cx = num(); cy = num();
      out += X(a) + ' ' + Y(b) + ' ' + X(c) + ' ' + Y(e) + ' ' + X(cx) + ' ' + Y(cy) + ' c\n';
    } else if (cmd === 'Z' || cmd === 'z') { out += 'h\n'; cx = sx; cy = sy; cmd = ''; }
    else throw new Error('Unbekannter Pfadbefehl: ' + cmd);
  }
  return out;
}
function fmt_(v) { return (Math.round(v * 1000) / 1000).toString(); }
function stream_(s) { return '<</Length ' + s.length + '>>\nstream\n' + s + '\nendstream'; }
function pdfText_(s) {
  var h = '<FEFF';
  for (var i = 0; i < s.length; i++) h += ('000' + s.charCodeAt(i).toString(16)).slice(-4);
  return h + '>';
}
