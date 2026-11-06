/**
 * Abenteuerweltchen – MISSION ZUM MOND personalisieren (Google Apps Script Web-App)
 * Eigenes Skript nur für dieses Produkt (die Skripte der Schatzsuchen bleiben unverändert).
 *
 *  1. Make schickt die Bestellung (Name, Geschlecht, E-Mail – auch als rohe Etsy-Angaben) an doPost.
 *  2. Das Skript erzeugt einen geheimen Zufallscode (z. B. k7x2m9q4ab3d) – der Name steht NIE in einer Adresse.
 *  3. Es baut die PDF (Name auf Titel, Ausweis, Sternbild, Urkunde + 17 QR-Codes mit dem Code)
 *     und legt sie in „02 Auslieferungen (automatisch)/<Bestellnr>_<Name>“ (per Link lesbar).
 *  4. Es legt einen PRIVATEN Ordner „Funksprüche (privat)/<Code>“ an und liefert Make die 34 persönlichen
 *     Funkspruch-Texte (Begrüßung + Abschied je Station). Make lässt sie von ElevenLabs sprechen und legt die
 *     MP3s in diesen privaten Ordner.
 *  5. Der Player (abenteuerweltchen.github.io/mondmission-player) ruft doGet mit dem Code auf und bekommt
 *     den Namen und die persönlichen MP3s. Fehlt ein persönlicher Clip, spielt der Player die neutrale Fassung.
 *  6. Aufräumen: Bestellungen älter als 13 Monate werden täglich automatisch gelöscht (Funktion einrichten einmal ausführen).
 *
 * Texte ändern: unten bei TRACKS. {N} = Name, {KAD} Kadett/Kadettin, {COP} Co-Pilot/in, {FOR} Forscher/in, {AST} Astronaut/in.
 */
var CONFIG = {
  TOKEN: '%%TOKEN%%',                                         // geheimer Schlüssel – muss in Make identisch sein
  TEMPLATE_ID: '',                                        // wird von vorlageHolen() automatisch eingetragen (Script-Eigenschaft)
  TEMPLATE_URL: 'https://abenteuerweltchen.github.io/mondmission-player/tools/mondmission_vorlage.bin',
  TEMPLATE_KEY: '%%TEMPLATEKEY%%',                                  // Schlüssel zur verschlüsselten Vorlage
  PRODUCT_FOLDER_ID: '1bFs2ihuS18dSSJ3iaJSXe-5A4lLL4BT4',                         // 01 Produkte › Mission zum Mond
  PRIVATE_FOLDER_ID: '1JGckTpjpfeON1_RJ6gSf2nWkncGhKG-W',                         // 01 Produkte › Mission zum Mond › Funksprüche (privat)
  OUTPUT_FOLDER_ID: '1Afrq-TwLsQ5uvulyVUBl8lFXUSvTvd07',  // 02 Auslieferungen (automatisch)
  PDF_PREFIX: 'Mission-zum-Mond_',
  AUDIO_MODEL: 'eleven_v3',
  VOICES: { mila: '9fvtGcIyqtZAfzFcACPJ', sarah: 'S87WJpstXs0Ge2ukRiXJ', sam: 'cUNmvfLD2G6l2g628j6f' },
  KEEP_DAYS: 400,
};
var GENDER = {
  m: { AST: 'Astronaut', KAD: 'Kadett', COP: 'Co-Pilot', FOR: 'Forscher' },
  w: { AST: 'Astronautin', KAD: 'Kadettin', COP: 'Co-Pilotin', FOR: 'Forscherin' },
};
// [Station, Sprecher, Begrüßung, Abschied]
var TRACKS = [
  ["s00", "mila", "Bodenstation an {N}! Bodenstation an {N}! Hörst du mich?", "Viel Erfolg beim Training, {KAD} {N}! Bodenstation Ende."],
  ["s01", "mila", "Bodenstation an {N}! Hier ist wieder Mila.", "Willkommen im Team, {KAD} {N}! Bodenstation Ende."],
  ["s02", "sam", "Hallo {N}! Hier ist Sam aus der Werkstatt. Schön, dass du da bist!", "Bis gleich, {KAD} {N}! Sam Ende."],
  ["s03", "sam", "{N}, hier ist wieder Sam! Bei mir in der Werkstatt ist Chaos!", "Alles aufgeräumt, {KAD} {N}! Sam Ende."],
  ["s04", "mila", "Bodenstation an {N}! Die Rakete ist startbereit!", "Guter Start, {KAD} {N}! Bodenstation Ende."],
  ["s05", "sarah", "Hallo {N}! Hier ist Sarah, deine Pilotin!", "Toll gemacht, {KAD} {N}! Sarah Ende."],
  ["s06", "sarah", "{N}, hier ist wieder Sarah! Hast du Hunger?", "Danke, {KAD} {N}! Jetzt verhungern wir nicht. Sarah Ende."],
  ["s07", "sam", "{N}, hier ist Sam! Ich brauche deine Hilfe!", "Alles repariert! Ich bin stolz auf dich, {KAD} {N}! Sam Ende."],
  ["s08", "mila", "Bodenstation an {N}! Hier ist Mila. Achtung, Geheimauftrag!", "Signal empfangen, {KAD} {N}! Bodenstation Ende."],
  ["s09", "sarah", "{N}, hier ist Sarah! Zeit für eine Pause!", "Gut erholt, {KAD} {N}? Weiter geht's! Sarah Ende."],
  ["s10", "mila", "Bodenstation an {N}! Der Mond ist schon ganz nah!", "Super gehört, {KAD} {N}! Bodenstation Ende."],
  ["s11", "sarah", "{N}, hier ist Sarah! Halt dich fest, wir landen!", "Gelandet! Ich zähle auf dich, {COP} {N}! Sarah Ende."],
  ["s12", "sam", "Hallo {N}! Hier ist Sam, direkt vom Mond!", "Alle fünf gefunden! Danke, {FOR} {N}! Sam Ende."],
  ["s13", "sam", "{N}, hier ist wieder Sam!", "Prima gesammelt, {FOR} {N}! Sam Ende."],
  ["s14", "mila", "Bodenstation an {N}! Schau mal in den Himmel!", "Dein Sternbild leuchtet, {KAD} {N}! Bodenstation Ende."],
  ["s15", "sarah", "{N}, hier ist Sarah! Wir fliegen nach Hause!", "Auf der nächsten Seite wartet eine Überraschung, {N}! Sarah Ende."],
  ["s16", "mila", "Bodenstation an {N}! Hörst du das? Die ganze Bodenstation jubelt, für dich!", "Herzlichen Glückwunsch, {AST} {N}! Du hast deine Mission geschafft. Bodenstation Ende."]
];

// ---------------- Make → neue Bestellung ----------------
function doPost(e) {
  var p = (e && e.parameter) || {};
  return json_(bestellung_(p));
}

function bestellung_(p) {
  var t0 = Date.now(), props = PropertiesService.getScriptProperties();
  try {
    if (p.token !== CONFIG.TOKEN) return { ok: false, error: 'UNAUTHORIZED: falscher Schlüssel' };
    var input = readInput_(p);
    var name = cleanName_(input.name), gender = cleanGender_(input.gender);
    var order = String(p.order_id || ('TEST-' + Date.now()));
    // gleiche Bestellung nochmal (Nachliefern) → gleicher Code, damit die gedruckten QR-Codes gültig bleiben
    var code = props.getProperty('o_' + order) || neuerCode_();
    var r = personalizeMond(templateBytes_(), name, gender, code);

    var folderName = safe_(order) + '_' + safe_(r.name);
    var parent = DriveApp.getFolderById(CONFIG.OUTPUT_FOLDER_ID);
    var it = parent.getFoldersByName(folderName);
    var folder = it.hasNext() ? it.next() : parent.createFolder(folderName);
    var files = folder.getFiles();
    while (files.hasNext()) files.next().setTrashed(true);
    var pdfName = CONFIG.PDF_PREFIX + safe_(r.name) + '.pdf';
    var signed = new Array(r.bytes.length);
    for (var i = 0; i < r.bytes.length; i++) signed[i] = r.bytes[i] > 127 ? r.bytes[i] - 256 : r.bytes[i];
    var pdf = folder.createFile(Utilities.newBlob(signed, 'application/pdf', pdfName));
    var shared = true;
    try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e2) { shared = false; }

    // privater Ordner für die persönlichen Funksprüche
    var priv = privatOrdner_(code, true);
    var old = priv.getFilesByType('audio/mpeg');
    while (old.hasNext()) old.next().setTrashed(true);
    var info = { name: r.name, g: r.gender, order: order, created: new Date().toISOString() };
    var infos = priv.getFilesByName('info.json');
    while (infos.hasNext()) infos.next().setTrashed(true);
    priv.createFile('info.json', JSON.stringify(info), 'application/json');
    props.setProperty('o_' + order, code);
    props.setProperty('k_' + code, priv.getId());

    var jobs = audioJobs_(r.name, r.gender);
    return {
      ok: true, order_id: order, name: r.name, gender: r.gender, email: input.email, code: code,
      player_url: MOND_PLAYER_URL + '?s=0&k=' + code,
      folder_id: folder.getId(), folder_url: folder.getUrl(), folder_shared: shared,
      file_id: pdf.getId(), file_name: pdfName,
      audio_folder_id: priv.getId(), audio_jobs: jobs, audio_count: jobs.length,
      audio_chars: jobs.reduce(function (t, j) { return t + j.body.text.length; }, 0),
      size_kb: Math.round(r.bytes.length / 1024), ms: Date.now() - t0,
    };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), ms: Date.now() - t0 };
  }
}

function audioJobs_(name, gender) {
  var fill = function (t) {
    t = t.replace(/\{N\}/g, name);
    Object.keys(GENDER[gender]).forEach(function (k) { t = t.split('{' + k + '}').join(GENDER[gender][k]); });
    return t;
  };
  var jobs = [];
  TRACKS.forEach(function (tr) {
    [['open', tr[2]], ['close', tr[3]]].forEach(function (x) {
      jobs.push({ key: tr[0] + '_' + x[0], file_name: tr[0] + '_' + x[0] + '.mp3', voice_id: CONFIG.VOICES[tr[1]],
                  body: { text: fill(x[1]), model_id: CONFIG.AUDIO_MODEL, language_code: 'de' } });
    });
  });
  return jobs;
}

// ---------------- Player → Name + persönliche Funksprüche ----------------
function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    var k = String(p.k || '').toLowerCase();
    if (!/^[a-z0-9]{6,16}$/.test(k)) return json_({ ok: false, error: 'kein Code' });
    var fid = PropertiesService.getScriptProperties().getProperty('k_' + k);
    if (!fid) return json_({ ok: false, error: 'unbekannt' });
    var folder = DriveApp.getFolderById(fid);
    if (p.s === undefined) {
      var info = JSON.parse(folder.getFilesByName('info.json').next().getBlob().getDataAsString());
      return json_({ ok: true, name: info.name, g: info.g });
    }
    var s = ('0' + parseInt(p.s, 10)).slice(-2), out = { ok: true };
    ['open', 'close'].forEach(function (part) {
      var f = folder.getFilesByName('s' + s + '_' + part + '.mp3');
      out[part] = f.hasNext() ? Utilities.base64Encode(f.next().getBlob().getBytes()) : null;
    });
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: 'Fehler' });
  }
}

// ---------------- Einrichtung (einmal im Editor ausführen) ----------------
/** Holt die (verschlüsselte) Vorlage von GitHub, entschlüsselt sie und legt sie in den Produktordner. Ebenso bei Vorlagen-Updates. */
function vorlageHolen() {
  var enc = UrlFetchApp.fetch(CONFIG.TEMPLATE_URL + '?v=' + Date.now()).getContent();
  var plain = xorStream_(enc, CONFIG.TEMPLATE_KEY);
  var signed = new Array(plain.length);
  for (var i = 0; i < plain.length; i++) signed[i] = plain[i] > 127 ? plain[i] - 256 : plain[i];
  if (String.fromCharCode.apply(null, plain.subarray(0, 5)) !== '%PDF-') throw new Error('Entschlüsselung fehlgeschlagen');
  var folder = DriveApp.getFolderById(CONFIG.PRODUCT_FOLDER_ID);
  var old = folder.getFilesByName('mondmission_vorlage.pdf');
  while (old.hasNext()) old.next().setTrashed(true);
  var f = folder.createFile(Utilities.newBlob(signed, 'application/pdf', 'mondmission_vorlage.pdf'));
  PropertiesService.getScriptProperties().setProperty('TEMPLATE_ID', f.getId());
  Logger.log('Vorlage gespeichert: ' + f.getId() + ' (' + plain.length + ' Bytes)');
}
/** Einmal ausführen: täglicher Aufräum-Auftrag (löscht alte Bestellungen nach KEEP_DAYS Tagen). */
function einrichten() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'aufraeumen') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('aufraeumen').timeBased().everyDays(1).atHour(4).create();
  Logger.log('Aufräumen eingerichtet');
}
function aufraeumen() {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties(), limit = Date.now() - CONFIG.KEEP_DAYS * 864e5;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf('k_') !== 0) return;
    try {
      var f = DriveApp.getFolderById(all[key]);
      if (f.getDateCreated().getTime() < limit) { f.setTrashed(true); props.deleteProperty(key); }
    } catch (e) { props.deleteProperty(key); }
  });
}
/** Test im Editor: baut eine Beispiel-Bestellung (Moses) – Ergebnis im Protokoll. */
function testlauf() {
  var r = bestellung_({ token: CONFIG.TOKEN, name: 'Moses', gender: 'Junge', order_id: 'EDITOR-TEST', email: 'test@example.com' });
  if (r.audio_jobs) r.audio_jobs = r.audio_jobs.length + ' Clips, z. B.: ' + JSON.stringify(r.audio_jobs[5]);
  Logger.log(JSON.stringify(r, null, 1));
}

// ---------------- Hilfsfunktionen ----------------
function templateBytes_() {
  var id = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID') || CONFIG.TEMPLATE_ID;
  if (!id) throw new Error('TEMPLATE: Vorlage fehlt – im Editor einmal vorlageHolen ausführen');
  return DriveApp.getFileById(id).getBlob().getBytes();
}
function privatOrdner_(code, create) {
  var parent = DriveApp.getFolderById(CONFIG.PRIVATE_FOLDER_ID), it = parent.getFoldersByName(code);
  return it.hasNext() ? it.next() : (create ? parent.createFolder(code) : null);
}
function neuerCode_() {
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789', bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now()), s = '';
  for (var i = 0; i < 12; i++) s += abc.charAt((bytes[i] & 255) % abc.length);
  return s;
}
function xorStream_(bytes, keyHex) {
  var u = Uint8Array.from(bytes, function (b) { return b & 255; });
  var a = parseInt(keyHex.slice(0, 8), 16) >>> 0, b = parseInt(keyHex.slice(8, 16), 16) >>> 0,
      c = parseInt(keyHex.slice(16, 24), 16) >>> 0, d = parseInt(keyHex.slice(24, 32), 16) >>> 0;
  for (var i = 0; i < u.length; i += 4) {
    var x = Math.imul(b, 5) >>> 0; x = ((x << 7) | (x >>> 25)) >>> 0; var r = Math.imul(x, 9) >>> 0;
    var t = (b << 9) >>> 0;
    c = (c ^ a) >>> 0; d = (d ^ b) >>> 0; b = (b ^ c) >>> 0; a = (a ^ d) >>> 0; c = (c ^ t) >>> 0; d = ((d << 11) | (d >>> 21)) >>> 0;
    for (var j = 0; j < 4 && i + j < u.length; j++) u[i + j] ^= (r >>> (8 * j)) & 255;
  }
  return u;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function safe_(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}
function decode_(s) {
  return String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
/** Liest Name, Geschlecht und E-Mail (direkt oder aus den rohen Etsy-Angaben) – wie bei den Schatzsuchen. */
function readInput_(p) {
  var name = p.name || '', gender = p.gender || '', email = p.email || '';
  var EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/;
  var rawN = [], rawV = [];
  for (var k = 1; k <= 10; k++) {
    if (p['var' + k + '_name'] === undefined && p['var' + k + '_value'] === undefined) continue;
    rawN.push(p['var' + k + '_name'] || ''); rawV.push(p['var' + k + '_value'] || '');
  }
  var fields = [];
  for (var i = 0; i < rawN.length; i++) {
    var n0 = decode_(rawN[i]).trim(), v0 = decode_(rawV[i] || '').trim();
    if (!n0 && !v0) continue;
    var pairs = [], re = /(^|\n)\s*([^:\n]{2,60}?)\s*:\s*([^\n]*)/g, m;
    while ((m = re.exec(v0))) pairs.push([m[2], m[3].trim()]);
    if (pairs.length >= 2 && (rawN.length === 1 || /personali/i.test(n0))) pairs.forEach(function (pr) { fields.push(pr); });
    else fields.push([n0, v0]);
  }
  fields.forEach(function (f) {
    var n = f[0].toLowerCase(), v = f[1];
    var mMail = EMAIL_RE.exec(v);
    if (mMail) {
      if (!email) email = mMail[0];
      v = v.replace(mMail[0], '').replace(/(e-?mail(-adresse)?|adresse)\s*[:=\-]?\s*/ig, '').trim();
    }
    if (/mail/.test(n)) return;
    if (/geschlecht|junge|mädchen|maedchen|gender/.test(n)) { if (!gender) gender = v; return; }
    if (/personali|name/.test(n)) {
      if (!v) return;
      var mName = /(?:vor)?name[^:=\n]*[:=]\s*([^\n,;|]+)/i.exec(v);
      var mGen = /\b(junge|mädchen|maedchen)\b/i.exec(v);
      if (!name) name = mName ? mName[1] : (mGen ? v.replace(mGen[0], '') : v).replace(/[,;|]+/g, ' ');
      if (!gender && mGen) gender = mGen[1];
    }
  });
  return { name: String(name).replace(/\s+/g, ' ').trim(), gender: gender, email: email };
}
