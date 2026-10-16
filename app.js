(function () {
  'use strict';
  var VERSION = '1';
  var LAT = 45.9003, LON = 12.17, TZ = 'Europe/Rome', PLACE = 'Pieve di Soligo';
  var TTL = 30 * 60 * 1000, TIMEOUT = 12000, RETRIES = 2, PAST = 21, FUT = 10;
  var RAD = Math.PI / 180, DAYMS = 864e5;

  var dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  function num(x) { return (x === null || x === undefined || x === '') ? NaN : Number(x); }
  function ok(x) { return typeof x === 'number' && isFinite(x); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function SUM(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function MEAN(a) { return a.length ? SUM(a) / a.length : NaN; }
  function MIN(a) { return Math.min.apply(null, a); }
  function MAX(a) { return Math.max.apply(null, a); }
  function f(x, nd) { return ok(x) ? x.toFixed(nd === undefined ? 1 : nd).replace('.', ',') : 'n/d'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } }
  function lsJson(k, d) { try { var v = JSON.parse(lsGet(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function getJson(url) {
    var attempt = 0;
    function go() {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
      return fetch(url, { signal: ctrl.signal })
        .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (e) {
          clearTimeout(timer);
          if (attempt < RETRIES) { var w = Math.pow(2, attempt) * 1000; attempt++; return sleep(w).then(go); }
          throw new Error(e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'errore di rete');
        });
    }
    return go();
  }

  // ---------- date (ora di Roma) ----------
  function todayStr() { return dayFmt.format(new Date()); }
  function addDays(date, n) {
    var p = date.split('-').map(Number);
    return dayFmt.format(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n, 12)));
  }
  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAYMS);
  }
  function toDate(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); }
  function fmtWd(d) { return new Intl.DateTimeFormat('it-IT', { weekday: 'short', timeZone: 'UTC' }).format(d).replace('.', ''); }
  function fmtDm(d) { return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace('.', ''); }
  function lab(s) { var d = toDate(s); return fmtWd(d) + ' ' + fmtDm(d); }
  function monthOf(s) { return Number(s.slice(5, 7)); }
  function domOf(s) { return Number(s.slice(8, 10)); }
  var MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  function nowHour() {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(new Date()));
  }
  // elenco di mesi come testo: [3,4,5,9] -> "mar–mag, set"
  function mesiTxt(a) {
    if (!a || !a.length) return 'no';
    var s = a.slice().sort(function (x, y) { return x - y; }), out = [], i = 0;
    // gestisce il passaggio dicembre-gennaio
    if (s.indexOf(1) >= 0 && s.indexOf(12) >= 0) {
      var k = s.length - 1; while (k > 0 && s[k - 1] === s[k] - 1) k--;
      var tail = s.slice(k), head = []; s = s.slice(0, k);
      var j = 0; while (j < s.length && s[j] === j + 1) { head.push(s[j]); j++; }
      s = s.slice(j);
      var wrap = tail.concat(head);
      out.push(MESI[tail[0] - 1] + '–' + MESI[head[head.length - 1] - 1]);
      void wrap;
    }
    while (i < s.length) {
      var a0 = s[i], b0 = a0;
      while (i + 1 < s.length && s[i + 1] === b0 + 1) { i++; b0 = s[i]; }
      out.push(a0 === b0 ? MESI[a0 - 1] : MESI[a0 - 1] + '–' + MESI[b0 - 1]);
      i++;
    }
    return out.join(', ');
  }
  // ---------- luna (calcolata sul telefono) ----------
  function toDays(ms) { return ms / DAYMS - 0.5 + 2440588 - 2451545; }
  var OBL = RAD * 23.4397;
  function rightAsc(l, b) { return Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)); }
  function decl(l, b) { return Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l)); }
  function sunCoords(d) {
    var M = RAD * (357.5291 + 0.98560028 * d);
    var C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var L = M + C + RAD * 102.9372 + Math.PI;
    return { dec: decl(L, 0), ra: rightAsc(L, 0) };
  }
  function moonCoords(d) {
    var L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.229350 * d);
    var l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
    return { ra: rightAsc(l, b), dec: decl(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function moonPhase(ms) {
    var d = toDays(ms), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    var phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    var inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    var ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { frac: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / Math.PI, dist: m.dist };
  }
  // istanti esatti delle fasi principali (algoritmo di Meeus), ms UTC
  function phaseTime(k, q) {
    var kk = k + q * 0.25, T = kk / 1236.85, d2 = Math.pow(T, 2), d3 = d2 * T, d4 = d3 * T;
    var jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * d2 - 0.00000015 * d3 + 0.00000000073 * d4;
    var E = 1 - 0.002516 * T - 0.0000074 * d2;
    var M = RAD * (2.5534 + 29.1053567 * kk - 0.0000014 * d2 - 0.00000011 * d3);
    var Mp = RAD * (201.5643 + 385.81693528 * kk + 0.0107582 * d2 + 0.00001238 * d3 - 0.000000058 * d4);
    var F = RAD * (160.7108 + 390.67050284 * kk - 0.0016118 * d2 - 0.00000227 * d3 + 0.000000011 * d4);
    var Om = RAD * (124.7746 - 1.56375588 * kk + 0.0020672 * d2 + 0.00000215 * d3);
    var s = Math.sin, c = 0;
    if (q === 0 || q === 2) {
      var a = q === 0 ? [-0.4072, 0.17241, 0.01608, 0.01039, 0.00739, -0.00514, 0.00208, -0.00111, -0.00057, 0.00056, -0.00042, 0.00042, 0.00038, -0.00024, -0.00017]
        : [-0.40614, 0.17302, 0.01614, 0.01043, 0.00734, -0.00515, 0.00209, -0.00111, -0.00057, 0.00056, -0.00042, 0.00042, 0.00038, -0.00024, -0.00017];
      c = a[0] * s(Mp) + a[1] * E * s(M) + a[2] * s(2 * Mp) + a[3] * s(2 * F) + a[4] * E * s(Mp - M) + a[5] * E * s(Mp + M) + a[6] * E * E * s(2 * M) +
        a[7] * s(Mp - 2 * F) + a[8] * s(Mp + 2 * F) + a[9] * E * s(2 * Mp + M) + a[10] * s(3 * Mp) + a[11] * E * s(M + 2 * F) + a[12] * E * s(M - 2 * F) +
        a[13] * E * s(2 * Mp - M) + a[14] * s(Om);
    } else {
      c = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F) + 0.00454 * E * s(Mp - M) +
        0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F) - 0.0007 * s(Mp + 2 * F) - 0.0004 * s(3 * Mp) - 0.00034 * E * s(2 * Mp - M) +
        0.00032 * E * s(M + 2 * F) + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M) + 0.00027 * E * s(2 * Mp + M) - 0.00017 * s(Om);
      var W = 0.00306 - 0.00038 * E * Math.cos(M) + 0.00026 * Math.cos(Mp) - 0.00002 * Math.cos(Mp - M) + 0.00002 * Math.cos(Mp + M) + 0.00002 * Math.cos(2 * F);
      c += q === 1 ? W : -W;
    }
    return (jde + c - 69 / 86400 - 2440587.5) * DAYMS;
  }
  function phaseEvents(fromMs, toMs) {
    var k0 = Math.floor((fromMs / DAYMS / 365.25 + 1970 - 2000) * 12.3685) - 2, out = [], k, q;
    for (k = k0; k < k0 + 8 + Math.ceil((toMs - fromMs) / DAYMS / 29.5); k++) {
      for (q = 0; q < 4; q++) { var t = phaseTime(k, q); if (t >= fromMs && t < toMs) out.push({ t: t, q: q }); }
    }
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  var PHASE_NAMES = ['Luna nuova', 'Primo quarto', 'Luna piena', 'Ultimo quarto'];

  function localParts(ms) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)), o = {};
    p.forEach(function (x) { o[x.type] = x.value; });
    return { date: o.year + '-' + o.month + '-' + o.day, h: Number(o.hour), mi: Number(o.minute) };
  }
  function localMs(date, hh_, mi) {
    var p = date.split('-').map(Number), base = Date.UTC(p[0], p[1] - 1, p[2], hh_, mi || 0), off;
    for (off = 3; off >= 0; off--) {
      var c = base - off * 3600e3, q = localParts(c);
      if (q.date === date && q.h === hh_ && q.mi === (mi || 0)) return c;
    }
    return base - 2 * 3600e3;
  }
  function clock(ms) { var q = localParts(ms); return (q.h < 10 ? '0' : '') + q.h + ':' + (q.mi < 10 ? '0' : '') + q.mi; }

  // Situazione lunare di un giorno, riferita a mezzogiorno locale
  var moonMemo = {};
  function moonDay(date) {
    if (moonMemo[date]) return moonMemo[date];
    var ref = localMs(date, 12, 0), ph = moonPhase(ref), p = ph.phase;
    var t0 = localMs(date, 0, 0), t1 = localMs(addDays(date, 1), 0, 0);
    var ev = phaseEvents(t0, t1)[0] || null;
    var d1 = moonCoords(toDays(ref - 12 * 3600e3)).dec, d2 = moonCoords(toDays(ref + 12 * 3600e3)).dec;
    // vicinanza alla luna nuova o piena (in giorni)
    var dn = Math.min(p, 1 - p) * 29.53, df = Math.abs(p - 0.5) * 29.53, near = Math.min(dn, df);
    var o = {
      p: p, frac: ph.frac, waxing: p < 0.5, asc: d2 > d1, ev: ev, near: near,
      newfull: near < 1.0,
      name: ev ? PHASE_NAMES[ev.q] : (p < 0.25 ? 'Falce crescente' : p < 0.5 ? 'Gibbosa crescente' : p < 0.75 ? 'Gibbosa calante' : 'Falce calante'),
      kind: p < 0.5 ? 'crescente' : 'calante'
    };
    moonMemo[date] = o;
    return o;
  }
  function moonSvg(p, size) {
    var pp = p < 0.5 ? p : 1 - p, rx = Math.abs(Math.cos(2 * Math.PI * pp)) * 18;
    var lit = 'M20 2A18 18 0 0 1 20 38A' + rx.toFixed(2) + ' 18 0 0 ' + (pp < 0.25 ? 0 : 1) + ' 20 2z';
    return '<svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '" role="img" aria-label="Fase lunare" style="width:' + size + 'px;height:' + size + 'px">' +
      '<circle cx="20" cy="20" r="18" fill="var(--moon-dark)" stroke="var(--line)" stroke-width="1"/>' +
      '<path d="' + lit + '" fill="var(--moon-lit)"' + (p >= 0.5 ? ' transform="translate(40 0) scale(-1 1)"' : '') + '/></svg>';
  }
  // ---------- meteo: motore in background (pioggia passata, previsioni, evapotraspirazione, suolo) ----------
  var W = { days: [], soilNow: null, loaded: false, error: null, last: null, nmodels: 0, soilOk: false };
  var API = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&timezone=Europe%2FRome&past_days=' + PAST + '&forecast_days=' + FUT;
  var D_VARS = 'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration';
  var H_VARS = 'soil_temperature_6cm,soil_temperature_18cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm';

  function extraRad(doy) {
    var lat = LAT * RAD, dr = 1 + 0.033 * Math.cos(2 * Math.PI / 365 * doy), dec = 0.409 * Math.sin(2 * Math.PI / 365 * doy - 1.39);
    var ws = Math.acos(clamp(-Math.tan(lat) * Math.tan(dec), -1, 1));
    return 24 * 60 / Math.PI * 0.082 * dr * (ws * Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.sin(ws));
  }
  // ET0 di riserva (Hargreaves-Samani) se l'API non la fornisce
  function hargreaves(tmax, tmin, date) {
    var p = date.split('-').map(Number), doy = Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(p[0], 0, 0)) / DAYMS);
    var ra = extraRad(doy) / 2.45, tm = (tmax + tmin) / 2;
    return Math.max(0, 0.0023 * (tm + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * ra);
  }

  function parseBase(j) {
    var d = j.daily, h = j.hourly, days = [], i, today = todayStr();
    for (i = 0; i < d.time.length; i++) {
      var o = { date: d.time[i], tmax: num(d.temperature_2m_max[i]), tmin: num(d.temperature_2m_min[i]), p: num(d.precipitation_sum[i]),
        pp: num(d.precipitation_probability_max && d.precipitation_probability_max[i]), et0: num(d.et0_fao_evapotranspiration && d.et0_fao_evapotranspiration[i]),
        t6: NaN, t18: NaN, m1: NaN, m2: NaN, m3: NaN, pmin: NaN, pmax: NaN, nm: 1 };
      if (!ok(o.et0) && ok(o.tmax) && ok(o.tmin)) { o.et0 = hargreaves(o.tmax, o.tmin, o.date); o.et0est = true; }
      days.push(o);
    }
    var idx = {};
    days.forEach(function (o, k) { idx[o.date] = k; });
    var soilOk = false, nowSoil = null, nh = nowHour(), acc = {};
    if (h && h.time) {
      var keys = [['t6', 'soil_temperature_6cm'], ['t18', 'soil_temperature_18cm'], ['m1', 'soil_moisture_3_to_9cm'], ['m2', 'soil_moisture_9_to_27cm'], ['m3', 'soil_moisture_27_to_81cm']];
      h.time.forEach(function (t, n) {
        var dt = t.slice(0, 10), k = idx[dt];
        if (k === undefined) return;
        keys.forEach(function (kk) {
          var v = h[kk[1]] ? num(h[kk[1]][n]) : NaN;
          if (!ok(v)) return;
          (acc[dt + kk[0]] = acc[dt + kk[0]] || []).push(v);
          if (dt === today && Number(t.slice(11, 13)) === nh) { nowSoil = nowSoil || {}; nowSoil[kk[0]] = v; }
        });
      });
      days.forEach(function (o) {
        ['t6', 't18', 'm1', 'm2', 'm3'].forEach(function (k) { var a = acc[o.date + k]; if (a && a.length) { o[k] = MEAN(a); soilOk = true; } });
      });
    }
    return { days: days, soilNow: nowSoil, soilOk: soilOk };
  }

  function fetchBase() {
    return getJson(API + '&daily=' + D_VARS + '&hourly=' + H_VARS)
      .catch(function () { return getJson(API + '&daily=' + D_VARS); })
      .catch(function () { return getJson(API + '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum'); })
      .then(parseBase);
  }
  // pioggia prevista: media di più modelli (ECMWF, ICON, GFS) oltre al modello di base
  function fetchRainModel(model) {
    return getJson('https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON + '&timezone=Europe%2FRome&forecast_days=' + FUT +
      '&daily=precipitation_sum,precipitation_probability_max&models=' + model).then(function (j) {
      var o = {}; (j.daily.time || []).forEach(function (t, i) { o[t] = { p: num(j.daily.precipitation_sum[i]), pp: num(j.daily.precipitation_probability_max && j.daily.precipitation_probability_max[i]) }; });
      return o;
    }).catch(function () { return null; });
  }
  function mergeRain(base, models) {
    var today = todayStr(), used = 0;
    models.filter(Boolean).forEach(function () { used++; });
    base.days.forEach(function (o) {
      var vals = [], pps = [];
      if (ok(o.p)) vals.push(o.p);
      if (ok(o.pp)) pps.push(o.pp);
      if (o.date >= today) {
        models.forEach(function (m) { var e = m && m[o.date]; if (e && ok(e.p)) vals.push(e.p); if (e && ok(e.pp)) pps.push(e.pp); });
      }
      if (vals.length) { o.p = MEAN(vals); o.pmin = MIN(vals); o.pmax = MAX(vals); o.nm = vals.length; }
      if (pps.length) o.pp = MEAN(pps);
    });
    return used;
  }

  function loadWeather(force) {
    var key = 'orto.w1', c = lsJson(key, null), now = Date.now();
    if (c && !force && now - c.t < TTL && c.days && c.days.length && c.today === todayStr()) {
      W.days = c.days; W.soilNow = c.soilNow; W.soilOk = c.soilOk; W.nmodels = c.nmodels || 1; W.loaded = true; W.last = new Date(c.t); W.error = null;
      return Promise.resolve(W);
    }
    return fetchBase().then(function (base) {
      return Promise.all(['ecmwf_ifs025', 'icon_seamless', 'gfs_seamless'].map(fetchRainModel)).then(function (ms) {
        var used = mergeRain(base, ms);
        W.days = base.days; W.soilNow = base.soilNow; W.soilOk = base.soilOk; W.nmodels = used + 1; W.loaded = true; W.last = new Date(now); W.error = null;
        lsSet(key, JSON.stringify({ t: now, today: todayStr(), days: W.days, soilNow: W.soilNow, soilOk: W.soilOk, nmodels: W.nmodels }));
        return W;
      });
    }).catch(function (e) {
      if (c && c.days && c.days.length) {
        W.days = c.days; W.soilNow = c.soilNow; W.soilOk = c.soilOk; W.nmodels = c.nmodels || 1; W.loaded = true; W.last = new Date(c.t); W.error = 'Dati salvati (' + e.message + ')';
        return W;
      }
      W.error = e.message; W.loaded = false;
      return W;
    });
  }

  function wIndex(date) {
    for (var i = 0; i < W.days.length; i++) if (W.days[i].date === date) return i;
    return -1;
  }
  function todayIdx() { return wIndex(todayStr()); }
  function sumP(a, b) { var s = 0, i, n = 0; for (i = Math.max(0, a); i <= Math.min(W.days.length - 1, b); i++) if (ok(W.days[i].p)) { s += W.days[i].p; n++; } return n ? s : NaN; }
  // ---------- terreno, bilancio idrico e consiglio di irrigazione ----------
  var SOILS = {
    sabbioso: { nome: 'Sabbioso', awc: 80, fc: 0.15, wp: 0.07, max: 12 },
    medio: { nome: 'Medio impasto', awc: 140, fc: 0.29, wp: 0.15, max: 20 },
    argilloso: { nome: 'Argilloso', awc: 160, fc: 0.38, wp: 0.22, max: 25 }
  };
  var METHODS = { goccia: { nome: 'A goccia', eff: 0.9 }, tubo: { nome: 'Annaffiatoio o tubo', eff: 0.75 }, aspersione: { nome: 'A pioggia (aspersore)', eff: 0.7 } };
  var settings = lsJson('orto.set', { soil: 'medio', method: 'tubo' });
  if (!SOILS[settings.soil]) settings.soil = 'medio';
  if (!METHODS[settings.method]) settings.method = 'tubo';
  function saveSettings() { lsSet('orto.set', JSON.stringify(settings)); }

  function vegById(id) { for (var i = 0; i < ORTAGGI.length; i++) if (ORTAGGI[i].id === id) return ORTAGGI[i]; return null; }

  // coefficiente colturale in base all'età della coltura (fasi FAO-56 semplificate)
  function kcAt(v, age) {
    var L = v.cyc, k = v.kc;
    if (age === null || age === undefined) return k[1];
    var a = Math.max(0, age), ini = 0.15 * L, dev = 0.30 * L, mid = 0.35 * L;
    if (a <= ini) return k[0];
    if (a <= ini + dev) return k[0] + (k[1] - k[0]) * (a - ini) / dev;
    if (a <= ini + dev + mid) return k[1];
    return k[1] + (k[2] - k[1]) * Math.min(1, (a - ini - dev - mid) / (0.2 * L));
  }
  function rootAt(v, age) {
    if (age === null || age === undefined) return v.zr;
    return Math.max(0.15, v.zr * Math.min(1, (Math.max(0, age) + 10) / (0.5 * v.cyc)));
  }
  function effRain(p, serra) { return serra || !ok(p) ? 0 : (p < 1 ? 0 : 0.85 * p); }

  // crop: { v, serra, start (data messa a dimora o null), irrig: [{d, mm}] }
  function simulate(crop) {
    var v = crop.v, soil = SOILS[settings.soil], eff = METHODS[settings.method].eff, rows = [], i, dr = NaN, started = false;
    var logs = {};
    (crop.irrig || []).forEach(function (e) { logs[e.d] = (logs[e.d] || 0) + e.mm * eff; });
    for (i = 0; i < W.days.length; i++) {
      var d = W.days[i], age = crop.start ? daysBetween(crop.start, d.date) : null;
      if (age !== null && age < 0) { rows.push({ date: d.date, pre: true }); continue; }
      var zr = rootAt(v, age), taw = soil.awc * zr, raw = v.p * taw;
      if (!started) {
        started = true;
        if (age !== null && age >= 0 && age <= 1) dr = 0.15 * taw;
        else {
          var th = ok(d.m2) ? d.m2 : d.m1, rel = ok(th) && W.soilOk ? clamp((th - soil.wp) / (soil.fc - soil.wp), 0, 1) : NaN;
          dr = ok(rel) ? (1 - rel) * taw : 0.3 * taw;
        }
      }
      var kc = kcAt(v, age), et = (ok(d.et0) ? d.et0 : 2) * kc * (crop.serra ? 0.8 : 1);
      var pe = effRain(d.p, crop.serra), ir = logs[d.date] || 0;
      dr = clamp(dr + et - pe - ir, 0, taw);
      rows.push({ date: d.date, dr: dr, taw: taw, raw: raw, rain: ok(d.p) ? d.p : 0, pe: pe, etc: et, irr: ir, kc: kc, zr: zr, past: i < PAST, today: i === PAST });
    }
    return { rows: rows, soil: soil, eff: eff };
  }

  // consiglio: ora / presto / aspetta / non serve / terreno bagnato
  function advise(crop) {
    var sim = simulate(crop), t = todayIdx(), r = sim.rows, eff = sim.eff;
    if (t < 0 || !r[t] || r[t].pre) return { kind: 'na', txt: 'Messa a dimora in programma', sim: sim };
    var cur = r[t], area = (crop.v.dp && crop.v.df) ? crop.v.dp * crop.v.df / 10000 : NaN;
    var pct = Math.round(100 * (1 - cur.dr / cur.taw));
    var rain48 = sumP(t + 1, t + 2), out = { sim: sim, pct: pct, taw: cur.taw, raw: cur.raw, dr: cur.dr };
    function dose(mm) {
      var cap = SOILS[settings.soil].max, net = Math.min(mm, cap), g = net / eff;
      return { net: net, gross: g, plant: ok(area) ? g * area : NaN, total: mm, repeat: mm > cap + 1 };
    }
    var recentRain = sumP(t - 1, t), futRain = sumP(t, t + 2);
    if (cur.dr <= 0.08 * cur.taw && ((ok(recentRain) && recentRain >= 12) || (ok(futRain) && futRain >= 18))) {
      out.kind = 'wet'; out.txt = 'Terreno ben bagnato: non irrigare'; return out;
    }
    if (cur.dr >= cur.raw) {
      var ra = ok(rain48) ? effRain(rain48, crop.serra) : 0;
      if (!crop.serra && cur.dr < 0.9 * cur.taw && ra >= 0.6 * cur.dr) {
        out.kind = 'wait'; out.txt = 'Puoi aspettare: pioggia prevista (' + f(rain48, 0) + ' mm in 2 giorni)'; out.dose = dose(cur.dr); return out;
      }
      out.kind = 'now'; out.txt = 'Irriga oggi'; out.dose = dose(cur.dr); return out;
    }
    for (var j = t + 1; j < r.length; j++) {
      if (r[j] && !r[j].pre && r[j].dr >= r[j].raw) {
        out.kind = 'soon'; out.when = r[j].date; out.in = j - t; out.dose = dose(r[j].dr);
        out.txt = out.in === 1 ? 'Irriga domani' : 'Irriga tra ' + out.in + ' giorni (' + lab(r[j].date) + ')';
        return out;
      }
    }
    out.kind = 'none'; out.txt = 'Non serve irrigare nei prossimi ' + (r.length - 1 - t) + ' giorni'; return out;
  }
  function soilLabel(rel) {
    return !ok(rel) ? 'n/d' : rel < 0.25 ? 'molto secco' : rel < 0.5 ? 'asciutto' : rel < 0.85 ? 'umido' : rel <= 1.05 ? 'a capacità idrica (ottimo)' : 'saturo';
  }
  function soilRel(th) { var s = SOILS[settings.soil]; return ok(th) ? (th - s.wp) / (s.fc - s.wp) : NaN; }

  // ortaggi in coltura nel mese corrente: dalla semina/trapianto fino alla prima raccolta, più i mesi di raccolta
  function activeNow(v, date) {
    var m = monthOf(date), set = {}, base = v.sa.concat(v.sp, v.ta, v.tp);
    v.ra.forEach(function (x) { set[x] = 1; });
    base.forEach(function (s) {
      for (var k = 0; k < 12; k++) { var mm = (s - 1 + k) % 12 + 1; set[mm] = 1; if (v.ra.indexOf(mm) >= 0) break; }
    });
    return !!set[m];
  }
  // ---------- quando seminare e trapiantare (aperto o serra) ----------
  var HYPO = { radice: 1, bulbo: 1, tubero: 1 };
  function extendMonths(a) {
    var s = {};
    a.forEach(function (m) { s[m] = 1; s[(m + 10) % 12 + 1] = 1; s[m % 12 + 1] = 1; });
    return Object.keys(s).map(Number).sort(function (x, y) { return x - y; });
  }
  // finestre di calendario per ogni operazione e luogo
  function windows(v) {
    var spEff = v.sp.length ? v.sp : (v.sa.length ? extendMonths(v.sa) : []);
    var tpEff = v.tp.length ? v.tp : (v.ta.length ? extendMonths(v.ta) : []);
    return {
      'semina|aperto': v.sa, 'semina|serra': spEff, 'trapianto|aperto': v.ta, 'trapianto|serra': tpEff,
      derivedSp: !v.sp.length && spEff.length > 0, derivedTp: !v.tp.length && tpEff.length > 0
    };
  }
  function calState(list, date) {
    if (!list || !list.length) return -1;
    var m = monthOf(date), d = domOf(date), nxt = m % 12 + 1, prv = (m + 10) % 12 + 1;
    if (list.indexOf(m) >= 0) return 2;
    if (list.indexOf(nxt) >= 0 && d >= 20) return 1;
    if (list.indexOf(prv) >= 0 && d <= 10) return 1;
    return 0;
  }
  // condizioni meteo dei giorni attorno alla data (null se oltre la previsione)
  function wctx(date) {
    var i = wIndex(date);
    if (i < 0 || !W.loaded) return null;
    var d = W.days, a = d.slice(i, i + 3), b = d.slice(i, i + 4);
    var t6 = a.map(function (x) { return x.t6; }).filter(ok), tmn = b.map(function (x) { return x.tmin; }).filter(ok), tmx = a.map(function (x) { return x.tmax; }).filter(ok);
    var tm = a.map(function (x) { return (x.tmax + x.tmin) / 2; }).filter(ok);
    return {
      soilT: t6.length ? MEAN(t6) : (tm.length ? MEAN(tm) - 1 : NaN), soilReal: t6.length > 0,
      tmin: tmn.length ? MIN(tmn) : NaN, tmax: tmx.length ? MAX(tmx) : NaN, rain: ok(d[i].p) ? d[i].p : 0
    };
  }
  // luna: -1 sconsigliata, 0 neutra, 1 favorevole, 2 ideale
  function moonFor(v, op, date) {
    var m = moonDay(date), hypo = !!HYPO[v.cat], fav, align;
    if (m.newfull) return { s: -1, txt: (m.p < 0.25 || m.p > 0.75 ? 'Luna nuova' : 'Luna piena') + ': meglio evitare', m: m };
    if (op === 'semina') { fav = hypo ? m.kind === 'calante' : m.kind === 'crescente'; align = hypo ? !m.asc : m.asc; }
    else { fav = m.kind === 'calante'; align = !m.asc; }
    if (!fav) return { s: 0, txt: 'Luna ' + m.kind + ': non ideale (meglio ' + (op === 'semina' ? (hypo ? 'calante' : 'crescente') : 'calante') + ')', m: m };
    return { s: align ? 2 : 1, txt: 'Luna ' + m.kind + (align ? (m.asc ? ' e ascendente' : ' e discendente') : '') + ': favorevole', m: m };
  }
  function gradeTxt(g) { return g >= 3 ? 'Ottimo' : g === 2 ? 'Buono' : g === 1 ? 'Con cautela' : 'No'; }

  // valuta un'operazione ('semina'|'trapianto') in un luogo ('aperto'|'serra') in una data
  function evalOp(v, op, place, date, noMoonSearch) {
    var w = windows(v), list = w[op + '|' + place], cs = calState(list, date);
    if (cs < 0) return null;
    var why = [], g;
    if (cs === 0) return { op: op, place: place, g: 0, why: ['Fuori periodo (' + mesiTxt(list) + ')'], out: true, win: list };
    g = cs === 2 ? 2 : 1;
    if (cs === 1) why.push('Inizio o fine del periodo (' + mesiTxt(list) + ')');
    else why.push('Periodo giusto (' + mesiTxt(list) + ')');
    var c = wctx(date), serra = place === 'serra', bonus = serra ? 3 : 0;
    if (c) {
      if (ok(c.tmin)) {
        var te = c.tmin + bonus, margin = te - v.tmin;
        if (op === 'trapianto' || (op === 'semina' && place === 'aperto')) {
          if (margin < 0) { g = 0; why.push('Rischio freddo: minime fino a ' + f(c.tmin, 0) + '°C' + (serra ? ' (serra non riscaldata)' : '') + ', la pianta regge fino a circa ' + f(v.tmin, 0) + '°C'); }
          else if (margin < 2) { g = Math.min(g, 1); why.push('Minime di ' + f(c.tmin, 0) + '°C vicine al limite della pianta (' + f(v.tmin, 0) + '°C): proteggi con tessuto non tessuto'); }
        }
      }
      if (op === 'semina' && place === 'aperto' && ok(c.soilT)) {
        var tg = v.tg;
        if (c.soilT < tg - 1) { g = 0; why.push('Terreno troppo freddo: ' + f(c.soilT, 0) + '°C a 6 cm, servono almeno ' + f(tg, 0) + '°C per germinare'); }
        else if (c.soilT < tg + 1) { g = Math.min(g, 1); why.push('Terreno ai limiti: ' + f(c.soilT, 0) + '°C a 6 cm (minimo ' + f(tg, 0) + '°C)'); }
        else why.push('Terreno a ' + f(c.soilT, 0) + '°C: va bene per germinare');
      }
      if (place === 'aperto' && v.tott[1] <= 22 && ok(c.tmax) && c.tmax >= 30) { g = Math.min(g, 1); why.push('Caldo eccessivo (fino a ' + f(c.tmax, 0) + '°C) per una coltura da clima fresco'); }
      if (place === 'aperto' && c.rain >= 20) { g = Math.min(g, 1); why.push('Pioggia forte prevista (' + f(c.rain, 0) + ' mm): meglio un giorno asciutto'); }
    } else why.push('Oltre i 9 giorni il meteo non è prevedibile: ricontrolla vicino alla data');
    var mo = moonFor(v, op, date), gg = g;
    if (g >= 2 && mo.s >= 1) gg = 3;
    var o = { op: op, place: place, g: gg, base: g, why: why, moon: mo, win: list };
    // se la luna non è ideale ma il resto sì, cerca il prossimo giorno favorevole
    if (!noMoonSearch && g >= 2 && mo.s < 1) {
      for (var k = 1; k <= 14; k++) {
        var d2 = addDays(date, k), e2 = evalOp(v, op, place, d2, true);
        if (e2 && e2.base >= 2 && e2.moon.s >= 1) { o.next = d2; break; }
      }
    }
    return o;
  }
  // tutte le valutazioni di un ortaggio in una data
  function evalVeg(v, date) {
    var res = [];
    ['semina', 'trapianto'].forEach(function (op) { ['aperto', 'serra'].forEach(function (pl) { var e = evalOp(v, op, pl, date); if (e) res.push(e); }); });
    var best = res.reduce(function (m, e) { return Math.max(m, e.out ? -1 : e.g); }, -1);
    return { v: v, res: res, best: best };
  }
  // ---------- interfaccia ----------
  var SINK = document.createElement('div');
  function $(id) { return document.getElementById(id) || SINK; }
  var CATI = { foglia: '🥬', frutto: '🍅', radice: '🥕', bulbo: '🧅', tubero: '🥔', seme: '🌱', infiorescenza: '🥦', stelo: '🌿' };
  var state = { tab: lsGet('orto.tab') || 'oggi', sdate: todayStr(), sop: 'tutto', spl: 'tutti', q: '', iq: '', open: null, my: lsJson('orto.my', []) };
  function saveMy() { lsSet('orto.my', JSON.stringify(state.my)); }
  function catI(c) { return (CATI[c] || '🌿') + ' '; }
  function pill(cls, txt) { return '<span class="pill ' + cls + '">' + txt + '</span>'; }
  function gcls(g) { return g >= 3 ? 'ok' : g === 2 ? 'ok2' : g === 1 ? 'warn' : 'off'; }
  function wNeed() { return !W.loaded ? '<div class="empty">' + (W.error ? 'Meteo non disponibile (' + esc(W.error) + '). Premi Aggiorna per riprovare.' : 'Carico il meteo...') + '</div>' : ''; }

  // ---------- grafici ----------
  function rainChart() {
    var t = todayIdx(), ds = W.days, n = ds.length, Wd = 420, H = 210, L = 34, R = 12, T = 18, B = 28, i;
    var mx = 5; ds.forEach(function (d) { if (ok(d.p) && d.p > mx) mx = d.p; if (ok(d.et0) && d.et0 > mx) mx = d.et0; });
    mx = Math.ceil(mx / 5) * 5;
    var bw = (Wd - L - R) / n;
    function X(k) { return L + (k + 0.5) * bw; }
    function Y(v) { return T + (H - T - B) * (1 - v / mx); }
    var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Pioggia e evapotraspirazione giorno per giorno">';
    [0, 0.5, 1].forEach(function (k) { s += '<line class="gl" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(mx * k) + '" y2="' + Y(mx * k) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(mx * k) + 4) + '" text-anchor="end">' + (mx * k) + '</text>'; });
    s += '<text class="ax" x="' + L + '" y="' + (T - 6) + '">mm</text>';
    var pts = [];
    for (i = 0; i < n; i++) {
      var d = ds[i], op = i < t ? 0.55 : 1;
      if (ok(d.p) && d.p > 0) s += '<rect x="' + (X(i) - bw / 2 + 1) + '" y="' + Y(d.p) + '" width="' + (bw - 2) + '" height="' + Math.max(1.5, Y(0) - Y(d.p)) + '" rx="1.5" fill="var(--rain)" fill-opacity="' + op + '"/>';
      if (ok(d.et0)) pts.push(X(i) + ',' + Y(d.et0));
    }
    if (pts.length) s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--tmax)" stroke-width="2" stroke-linejoin="round"/>';
    if (t >= 0) s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-dasharray="3 3"/><text class="ax" x="' + X(t) + '" y="' + (T - 6) + '" text-anchor="middle">oggi</text>';
    for (i = 0; i < n; i += 3) { var dt = toDate(ds[i].date); s += '<text class="ax" x="' + X(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + dt.getUTCDate() + '</text>'; }
    return s + '</svg>';
  }
  function waterChart(sim, crop) {
    var rows = sim.rows.filter(function (r) { return !r.pre; }), n = rows.length, Wd = 420, H = 250, L = 34, R = 12, T = 20, B = 26, split = 168;
    if (n < 2) return '';
    var bw = (Wd - L - R) / n, t = rows.findIndex ? rows.findIndex(function (r) { return r.today; }) : -1, i;
    function X(k) { return L + (k + 0.5) * bw; }
    function Y(pct) { return T + (split - T) * (1 - pct / 100); }
    var mxr = 5; rows.forEach(function (r) { mxr = Math.max(mxr, r.rain, r.irr); }); mxr = Math.ceil(mxr / 5) * 5;
    function YR(v) { return split + 14 + (H - B - split - 14) * (1 - v / mxr); }
    var s = '<svg viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Acqua disponibile nel terreno">';
    [0, 50, 100].forEach(function (p) { s += '<line class="gl" x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(p) + '" y2="' + Y(p) + '"/><text class="ax" x="' + (L - 6) + '" y="' + (Y(p) + 4) + '" text-anchor="end">' + p + '%</text>'; });
    var thr = 100 * (1 - crop.v.p);
    s += '<rect x="' + L + '" y="' + Y(thr) + '" width="' + (Wd - L - R) + '" height="' + (Y(0) - Y(thr)) + '" fill="var(--bad)" fill-opacity="0.08"/>';
    s += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(thr) + '" y2="' + Y(thr) + '" stroke="var(--bad)" stroke-dasharray="4 3"/><text class="ax" x="' + (Wd - R) + '" y="' + (Y(thr) - 4) + '" text-anchor="end" style="fill:var(--bad)">soglia di stress</text>';
    var pts = rows.map(function (r, k) { return X(k).toFixed(1) + ',' + Y(clamp(100 * (1 - r.dr / r.taw), 0, 100)).toFixed(1); });
    s += '<polygon points="' + pts.join(' ') + ' ' + X(n - 1) + ',' + Y(0) + ' ' + X(0) + ',' + Y(0) + '" fill="var(--ok)" fill-opacity="0.18"/>';
    s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="var(--ok)" stroke-width="2.4" stroke-linejoin="round"/>';
    for (i = 0; i < n; i++) {
      var r = rows[i], x = X(i) - bw / 2 + 1;
      if (r.rain > 0) s += '<rect x="' + x + '" y="' + YR(r.rain) + '" width="' + (bw - 2) / (r.irr > 0 ? 2 : 1) + '" height="' + Math.max(1.5, YR(0) - YR(r.rain)) + '" fill="var(--rain)" fill-opacity="' + (i < t ? 0.55 : 1) + '"/>';
      if (r.irr > 0) s += '<rect x="' + (x + (r.rain > 0 ? (bw - 2) / 2 : 0)) + '" y="' + YR(r.irr) + '" width="' + (bw - 2) / (r.rain > 0 ? 2 : 1) + '" height="' + Math.max(1.5, YR(0) - YR(r.irr)) + '" fill="var(--sunfill)"/>';
    }
    if (t >= 0) s += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--muted)" stroke-dasharray="3 3"/><text class="ax" x="' + X(t) + '" y="' + (T - 7) + '" text-anchor="middle">oggi</text>';
    s += '<text class="ax" x="' + L + '" y="' + (split + 10) + '">pioggia (mm)</text>';
    for (i = 0; i < n; i += 3) s += '<text class="ax" x="' + X(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + toDate(rows[i].date).getUTCDate() + '</text>';
    return s + '</svg>';
  }

  // ---------- OGGI ----------
  function renderToday() {
    var t = todayIdx();
    if (!W.loaded || t < 0) { $('alerts').innerHTML = ''; $('stats').innerHTML = wNeed(); $('raincht').innerHTML = ''; }
    else {
      var d = W.days[t], al = '', soil = SOILS[settings.soil];
      var r7 = sumP(t - 7, t - 1), r14 = sumP(t - 14, t - 1), f7 = sumP(t, t + 6), f2 = sumP(t, t + 1);
      var tmins = W.days.slice(t, t + 4).filter(function (x) { return ok(x.tmin); });
      var tm = tmins.length ? tmins.reduce(function (a, b) { return b.tmin < a.tmin ? b : a; }) : null;
      var tmaxs = W.days.slice(t, t + 3).filter(function (x) { return ok(x.tmax); });
      var hot = tmaxs.length ? tmaxs.reduce(function (a, b) { return b.tmax > a.tmax ? b : a; }) : null;
      if (tm && tm.tmin <= 0) al += '<div class="alert bad"><b>Gelo previsto</b> · minima di ' + f(tm.tmin, 0) + '°C (' + lab(tm.date) + '). Copri le colture sensibili con tessuto non tessuto e non seminare né trapiantare all\'aperto ortaggi da caldo.</div>';
      else if (tm && tm.tmin <= 3) al += '<div class="alert warn"><b>Rischio brina</b> · minima di ' + f(tm.tmin, 0) + '°C (' + lab(tm.date) + '). Proteggi pomodori, peperoni, zucchine e piantine appena trapiantate.</div>';
      if (hot && hot.tmax >= 32) al += '<div class="alert warn"><b>Caldo forte</b> · fino a ' + f(hot.tmax, 0) + '°C (' + lab(hot.date) + '). Irriga la sera o all\'alba e pacciama il terreno.</div>';
      if (ok(f2) && f2 >= 30) al += '<div class="alert warn"><b>Pioggia forte</b> · ' + f(f2, 0) + ' mm in 2 giorni. Evita di irrigare e controlla i ristagni.</div>';
      if (ok(r14) && r14 < 8 && ok(d.et0) && d.et0 >= 2.5) al += '<div class="alert warn"><b>Periodo secco</b> · solo ' + f(r14, 0) + ' mm di pioggia in 14 giorni.</div>';
      $('alerts').innerHTML = al;
      var sn = W.soilNow || {}, t6 = ok(sn.t6) ? sn.t6 : d.t6, m2 = ok(sn.m2) ? sn.m2 : d.m2, m1 = ok(sn.m1) ? sn.m1 : d.m1;
      var rel2 = soilRel(m2), rel1 = soilRel(m1);
      function tile(l, v, s2) { return '<div class="stat"><span class="sl">' + l + '</span><span class="sv">' + v + '</span><span class="ss">' + s2 + '</span></div>'; }
      $('stats').innerHTML =
        tile('Pioggia ultimi 7 giorni', f(r7, 0) + ' mm', 'ultimi 14 giorni: ' + f(r14, 0) + ' mm') +
        tile('Pioggia prevista', f(f7, 0) + ' mm', 'prossimi 7 giorni · oggi ' + f(d.p, 0) + ' mm') +
        tile('Evapotraspirazione', f(d.et0, 1) + ' mm', 'acqua che il terreno perde oggi' + (d.et0est ? ' (stima)' : '')) +
        tile('Temperatura terreno', ok(t6) ? f(t6, 0) + '°C' : 'n/d', ok(t6) ? 'a 6 cm di profondità' : 'dato non disponibile') +
        tile('Umidità in superficie', ok(rel1) ? soilLabel(rel1) : 'n/d', ok(rel1) ? 'strato 3–9 cm (modello)' : 'dato non disponibile') +
        tile('Umidità in profondità', ok(rel2) ? soilLabel(rel2) : 'n/d', ok(rel2) ? 'strato 9–27 cm (modello)' : 'dato non disponibile') +
        tile('Minima prossime notti', tm ? f(tm.tmin, 0) + '°C' : 'n/d', tm ? lab(tm.date) : '') +
        tile('Terreno scelto', soil.nome, 'cambialo in Irrigazione');
      $('raincht').innerHTML = rainChart();
    }
    // da fare adesso
    var td = todayStr(), todo = '', mo = moonDay(td);
    todo += '<div class="todo"><b>Luna</b> · ' + moonSvg(mo.p, 22) + ' ' + mo.name + ', ' + mo.kind + (mo.asc ? ' e ascendente' : ' e discendente') + '. ' +
      (mo.newfull ? 'Meglio non seminare né trapiantare oggi.' : mo.kind === 'crescente' ? 'Favorevole alla semina di ortaggi da foglia, frutto e seme.' : 'Favorevole a radici, bulbi, tuberi e ai trapianti.') + '</div>';
    if (W.loaded) {
      var my = state.my.map(function (e) { return { e: e, a: advise(cropOf(e)) }; });
      var need = my.filter(function (x) { return x.a.kind === 'now'; });
      if (my.length) {
        todo += '<div class="todo"><b>Irrigazione</b> · ' + (need.length ? need.map(function (x) { return esc(x.e.nome) + ' (' + f(x.a.dose.gross, 0) + ' L/m²)'; }).join(', ') + ' da irrigare oggi.' : 'nessuna delle tue colture ha bisogno d\'acqua oggi.') + '</div>';
      } else todo += '<div class="todo"><b>Irrigazione</b> · aggiungi i tuoi ortaggi in «Il mio orto» per avere litri e giorni precisi. Intanto vedi i consigli generali in «Irrigazione».</div>';
      var ev = ORTAGGI.map(function (v) { return evalVeg(v, td); }).filter(function (e) { return e.best >= 2; });
      var op = ev.filter(function (e) { return e.res.some(function (r) { return !r.out && r.g >= 2 && r.place === 'aperto'; }); }).map(function (e) { return e.v.nome; });
      var sr = ev.filter(function (e) { return !e.res.some(function (r) { return !r.out && r.g >= 2 && r.place === 'aperto'; }); }).map(function (e) { return e.v.nome; });
      todo += '<div class="todo"><b>All\'aperto si può seminare o trapiantare</b> · ' + (op.length ? op.slice(0, 14).map(esc).join(', ') + (op.length > 14 ? ' e altri ' + (op.length - 14) : '') : 'poco o niente in questo periodo') + '.</div>';
      todo += '<div class="todo"><b>In serra o semenzaio</b> · ' + (sr.length ? sr.slice(0, 14).map(esc).join(', ') + (sr.length > 14 ? ' e altri ' + (sr.length - 14) : '') : 'niente in più') + '.</div>';
    }
    $('todo').innerHTML = todo;
  }
  // ---------- SEMINA E TRAPIANTO ----------
  function detailsHtml(v) {
    var l = [];
    if (v.dp || v.df) l.push('Distanze: ' + (v.dp ? v.dp + ' cm tra le piante' : '') + (v.dp && v.df ? ', ' : '') + (v.df ? v.df + ' cm tra le file' : ''));
    if (v.prof) l.push('Profondità di semina: ' + v.prof + ' cm');
    if (v.gg) l.push('Dalla semina/trapianto alla raccolta: ' + (v.gg[0] === v.gg[1] ? v.gg[0] : v.gg[0] + '–' + v.gg[1]) + ' giorni (indicativi)');
    l.push('Temperatura ideale: ' + v.tott[0] + '–' + v.tott[1] + '°C · germina da ' + v.tg + '°C · sopporta minime fino a circa ' + v.tmin + '°C');
    if (v.acqua) l.push('Fabbisogno d\'acqua (scheda): ' + v.acqua);
    if (v.irr) l.push('Irrigazione: ' + esc(v.irr));
    if (v.suolo) l.push('Terreno: ' + esc(v.suolo));
    if (v.sole) l.push('Esposizione: ' + esc(v.sole));
    if (v.note) l.push(esc(v.note));
    l.push('Semina all\'aperto: ' + mesiTxt(v.sa) + ' · in semenzaio/serra: ' + mesiTxt(v.sp) + ' · trapianto: ' + mesiTxt(v.ta) + ' · raccolta: ' + mesiTxt(v.ra));
    return '<ul class="dl">' + l.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul><a class="lnk" href="' + esc(v.url) + '" target="_blank" rel="noopener">Scheda completa su ortodacoltivare.it</a>';
  }
  var OPN = { semina: 'Semina', trapianto: 'Trapianto' }, PLN = { aperto: 'all\'aperto', serra: 'in serra o tunnel' };
  function sowCard(e) {
    var v = e.v, h = '';
    var best = e.res.filter(function (r) { return !r.out; }).reduce(function (m, r) { return Math.max(m, r.g); }, -1);
    h += '<div class="veg"><div class="vh"><span class="vn">' + catI(v.cat) + esc(v.nome) + '</span>' + (best >= 0 ? pill(gcls(best), gradeTxt(best)) : pill('off', 'Non ora')) + '</div>';
    e.res.forEach(function (r) {
      if (r.out) return;
      var sp = (r.place === 'serra' && ((r.op === 'semina' && windows(v).derivedSp) || (r.op === 'trapianto' && windows(v).derivedTp))) ? ' (stima)' : '';
      h += '<div class="opr"><span class="opn">' + OPN[r.op] + ' ' + PLN[r.place] + sp + '</span>' + pill(gcls(r.g), gradeTxt(r.g)) + '</div>';
      h += '<div class="why">' + r.why.map(esc).join(' · ') + '</div>';
      if (r.moon) h += '<div class="why moon">🌙 ' + esc(r.moon.txt) + (r.next ? ' · giorno lunare favorevole: ' + lab(r.next) : '') + '</div>';
    });
    if (best < 0) {
      var w = windows(v), rows = [];
      [['semina|aperto', 'Semina all\'aperto'], ['semina|serra', 'Semina in semenzaio/serra'], ['trapianto|aperto', 'Trapianto all\'aperto'], ['trapianto|serra', 'Trapianto in serra']].forEach(function (k) { if (w[k[0]].length) rows.push(k[1] + ': ' + mesiTxt(w[k[0]])); });
      h += '<div class="why">' + (rows.length ? rows.join(' · ') : 'Nessun periodo indicato') + '</div>';
    }
    h += '<details><summary>Scheda</summary>' + detailsHtml(v) + '</details></div>';
    return h;
  }
  function renderSow() {
    var date = state.sdate, strip = '', i;
    for (i = 0; i < 10; i++) {
      var d = addDays(todayStr(), i), m = moonDay(d), t = toDate(d), wi = wIndex(d), tn = wi >= 0 ? W.days[wi].tmin : NaN;
      strip += '<button type="button" class="day sd" data-sd="' + d + '" aria-pressed="' + (d === date) + '"><span class="dn">' + fmtWd(t) + '</span><span class="dd">' + fmtDm(t) + '</span>' +
        '<span class="mi">' + moonSvg(m.p, 26) + '</span><span class="rr">' + (m.newfull ? 'evita' : m.kind) + (m.asc ? ' ↑' : ' ↓') + '</span><span class="rr">' + (ok(tn) ? 'min ' + f(tn, 0) + '°' : '') + '</span></button>';
    }
    $('sdays').innerHTML = strip;
    var mo = moonDay(date), c = wctx(date);
    $('sinfo').innerHTML = '<div class="sinfo">' + moonSvg(mo.p, 30) + '<div><b>' + lab(date) + '</b> · ' + mo.name + ', luna ' + mo.kind + (mo.asc ? ' ascendente' : ' discendente') + '<br><span class="dim">' +
      (c ? 'Terreno ' + (ok(c.soilT) ? f(c.soilT, 0) + '°C' : 'n/d') + (c.soilReal ? '' : ' (stima)') + ' · minima ' + f(c.tmin, 0) + '°C · massima ' + f(c.tmax, 0) + '°C · pioggia ' + f(c.rain, 0) + ' mm' : W.loaded ? 'Meteo non disponibile per questa data' : 'Carico il meteo...') + '</span></div></div>';
    ['tutto', 'semina', 'trapianto'].forEach(function (k) { $('so-' + k).setAttribute('aria-pressed', String(state.sop === k)); });
    ['tutti', 'aperto', 'serra'].forEach(function (k) { $('sp-' + k).setAttribute('aria-pressed', String(state.spl === k)); });
    var q = state.q.trim().toLowerCase(), good = [], caut = [], none = [];
    ORTAGGI.forEach(function (v) {
      if (q && v.nome.toLowerCase().indexOf(q) < 0 && v.nomeSito.toLowerCase().indexOf(q) < 0) return;
      var e = evalVeg(v, date);
      e.res = e.res.filter(function (r) { return (state.sop === 'tutto' || r.op === state.sop) && (state.spl === 'tutti' || r.place === state.spl); });
      var best = e.res.filter(function (r) { return !r.out; }).reduce(function (m, r) { return Math.max(m, r.g); }, -1);
      e.res.sort(function (a, b) { return (b.out ? -1 : b.g) - (a.out ? -1 : a.g); });
      (best >= 2 ? good : best === 1 ? caut : none).push({ e: e, best: best });
    });
    function srt(a, b) { return b.best - a.best || (a.e.v.nome < b.e.v.nome ? -1 : 1); }
    good.sort(srt); caut.sort(srt); none.sort(srt);
    var h = '';
    h += '<h3 class="gh">Da fare adesso <span class="cnt">' + good.length + '</span></h3>' + (good.length ? good.map(function (x) { return sowCard(x.e); }).join('') : '<div class="empty">Niente di consigliato per questa data con i filtri scelti.</div>');
    if (caut.length) h += '<h3 class="gh">Con cautela <span class="cnt">' + caut.length + '</span></h3>' + caut.map(function (x) { return sowCard(x.e); }).join('');
    h += '<details class="grp"><summary>Fuori periodo o sconsigliati (' + none.length + ')</summary>' + none.map(function (x) { return sowCard(x.e); }).join('') + '</details>';
    $('slist').innerHTML = h;
  }

  // ---------- IRRIGAZIONE ----------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function cropOf(e) { var v = vegById(e.vid); return v ? { v: v, serra: !!e.serra, start: e.start, irrig: e.irrig || [], nome: e.nome } : null; }
  var KORD = { now: 0, wait: 1, soon: 2, wet: 3, none: 4, na: 5 };
  var KCLS = { now: 'bad', wait: 'warn', soon: 'warn', wet: 'rainp', none: 'ok', na: 'off' };
  function doseTxt(a) {
    if (!a.dose) return '';
    var dd = a.dose, s = '<b>' + f(dd.gross, 0) + ' L/m²</b>' + (ok(dd.plant) && dd.plant > 0.05 ? ' · circa ' + f(dd.plant, 1) + ' L a pianta' : '') + ' (' + METHODS[settings.method].nome.toLowerCase() + ')';
    if (dd.repeat) s += '<br><span class="dim">Terreno molto asciutto (mancano ' + f(dd.total / METHODS[settings.method].eff, 0) + ' L/m² in tutto): dai questa dose e ripeti dopo 1–2 giorni.</span>';
    return s;
  }
  function cropRow(key, c, a, mine) {
    var open = state.open === key, name = mine ? esc(c.nome) : esc(c.v.nome);
    var h = '<div class="crop' + (open ? ' open' : '') + '"><button type="button" class="crow" data-c="' + key + '"><span class="cn">' + catI(c.v.cat) + name + (mine ? ' <span class="dim">· ' + (c.serra ? 'serra' : 'aperto') + '</span>' : '') + '</span>' +
      pill(KCLS[a.kind], esc(a.txt)) + '</button>';
    if (a.kind !== 'na') h += '<div class="csub">Acqua nel terreno ' + a.pct + '%' + (a.dose && (a.kind === 'now' || a.kind === 'soon' || a.kind === 'wait') ? ' · ' : '') + (a.kind === 'now' || a.kind === 'wait' ? doseTxt(a) : (a.kind === 'soon' ? 'dose: ' + doseTxt(a) : '')) + '</div>';
    if (open) h += cropDetail(c, a, mine);
    return h + '</div>';
  }
  function cropDetail(c, a, mine) {
    var s = a.sim, t = todayIdx(), cur = s.rows[t], v = c.v, h = '<div class="cdet">';
    if (!cur || cur.pre) return h + '<p class="dim">La coltura parte dal ' + lab(c.start) + '.</p></div>';
    h += waterChart(s, c);
    h += '<ul class="dl"><li>Radici: circa ' + Math.round(cur.zr * 100) + ' cm · riserva utile del terreno ' + f(a.taw, 0) + ' mm, si irriga quando ne è stata consumata la quota ' + f(a.raw, 0) + ' mm (circa ' + Math.round(v.p * 100) + '%)</li>';
    h += '<li>Coefficiente colturale oggi: ' + f(cur.kc, 2) + ' · consumo stimato oggi ' + f(cur.etc, 1) + ' mm' + (c.serra ? ' (serra: niente pioggia, consumo ridotto del 20%)' : '') + '</li>';
    if (a.dose) h += '<li>Dose: ' + doseTxt(a) + '</li>';
    h += '<li>Controllo pratico: infila un dito a 5 cm; se la terra è asciutta e non si appallottola, irriga. Preferisci mattina presto o sera, bagnando il terreno e non le foglie.</li>';
    if (v.irr) h += '<li>Dalla scheda: ' + esc(v.irr) + '</li>';
    if (!mine) h += '<li class="dim">Calcolo per una coltura già in pieno sviluppo. Per consigli sulla tua coltura aggiungila in «Il mio orto».</li>';
    if (mine && c.irrig.length) h += '<li>Irrigazioni segnate: ' + c.irrig.slice(-5).map(function (x) { return lab(x.d) + ' ' + x.mm + ' L/m²'; }).join(', ') + '</li>';
    return h + '</ul></div>';
  }
  function renderIrr() {
    $('set-soil').value = settings.soil; $('set-method').value = settings.method;
    if (!W.loaded) { $('ilist').innerHTML = wNeed(); return; }
    var q = state.iq.trim().toLowerCase(), t0 = todayStr(), h = '', mineHtml = '', gen = [], mine = [];
    state.my.forEach(function (e, k) { var c = cropOf(e); if (c) mine.push({ key: 'm:' + e.id, c: c, a: advise(c) }); });
    ORTAGGI.forEach(function (v) {
      if (!activeNow(v, t0)) return;
      if (q && v.nome.toLowerCase().indexOf(q) < 0) return;
      var c = { v: v, serra: false, start: null, irrig: [] };
      gen.push({ key: 'g:' + v.id, c: c, a: advise(c) });
    });
    function srt(x, y) { return KORD[x.a.kind] - KORD[y.a.kind] || ((x.a.in || 0) - (y.a.in || 0)) || (x.c.v.nome < y.c.v.nome ? -1 : 1); }
    mine.sort(srt); gen.sort(srt);
    if (mine.length) h += '<h3 class="gh">Il mio orto <span class="cnt">' + mine.length + '</span></h3>' + mine.map(function (x) { return cropRow(x.key, x.c, x.a, true); }).join('');
    h += '<h3 class="gh">Ortaggi in coltura in questo periodo <span class="cnt">' + gen.length + '</span></h3>' + gen.map(function (x) { return cropRow(x.key, x.c, x.a, false); }).join('');
    $('ilist').innerHTML = h;
  }
  function findCrop(key) {
    if (key.indexOf('m:') === 0) { var id = key.slice(2), e = state.my.filter(function (x) { return x.id === id; })[0]; return e ? cropOf(e) : null; }
    var v = vegById(key.slice(2)); return v ? { v: v, serra: false, start: null, irrig: [] } : null;
  }

  // ---------- IL MIO ORTO ----------
  function stageTxt(c) {
    if (!c.start) return '';
    var age = daysBetween(c.start, todayStr()), L = c.v.cyc;
    if (age < 0) return 'Parte il ' + lab(c.start);
    var fr = age / L;
    return 'Giorno ' + age + ' di circa ' + L + ' · ' + (fr < 0.15 ? 'attecchimento' : fr < 0.45 ? 'crescita' : fr < 0.8 ? 'piena produzione' : fr < 1 ? 'maturazione' : 'a fine ciclo');
  }
  function renderMy() {
    var h = '';
    if (!state.my.length) h = '<div class="empty">Non hai ancora aggiunto ortaggi. Scegli che cosa hai seminato o trapiantato e da quando: avrai litri e giorni di irrigazione su misura.</div>';
    state.my.forEach(function (e) {
      var c = cropOf(e); if (!c) return;
      var a = W.loaded ? advise(c) : { kind: 'na', txt: 'Meteo in caricamento' };
      var last = c.irrig.length ? c.irrig[c.irrig.length - 1] : null;
      h += '<div class="mycrop"><div class="vh"><span class="vn">' + catI(c.v.cat) + esc(c.nome) + '</span>' + pill(KCLS[a.kind], esc(a.txt)) + '</div>' +
        '<div class="why">' + (e.mode === 'trapianto' ? 'Trapiantato' : 'Seminato') + ' ' + (c.serra ? 'in serra' : 'all\'aperto') + ' il ' + lab(c.start) + ' · ' + stageTxt(c) + '</div>' +
        (a.dose ? '<div class="csub">Dose consigliata: ' + doseTxt(a) + '</div>' : '') +
        '<div class="why">' + (last ? 'Ultima irrigazione segnata: ' + lab(last.d) + ' (' + last.mm + ' L/m²)' : 'Nessuna irrigazione segnata') + '</div>' +
        '<div class="acts"><span class="dim">Ho irrigato oggi:</span> ' + [5, 10, 20].map(function (mm) { return '<button type="button" class="mini-btn" data-act="irr" data-id="' + e.id + '" data-mm="' + mm + '">' + mm + ' L/m²</button>'; }).join('') +
        '<button type="button" class="mini-btn danger" data-act="del" data-id="' + e.id + '">Elimina</button></div></div>';
    });
    $('mylist').innerHTML = h;
  }

  // ---------- LUNA ----------
  function renderMoonTab() {
    var td = todayStr(), mo = moonDay(td), ref = localMs(td, 12, 0), ph = moonPhase(ref);
    var news = phaseEvents(ref - 31 * DAYMS, ref).filter(function (e) { return e.q === 0; }), age = news.length ? (ref - news[news.length - 1].t) / DAYMS : mo.p * 29.53;
    var h = '<div class="mhero"><div class="mic">' + moonSvg(mo.p, 72) + '</div><div><div class="mname">' + mo.name + '</div><div class="msub">Illuminata al ' + Math.round(ph.frac * 100) + '% · età ' + f(age, 1) + ' giorni</div>' +
      '<div class="msub">Luna ' + mo.kind + ' e ' + (mo.asc ? 'ascendente' : 'discendente') + '</div></div></div>';
    h += '<p class="adv">' + (mo.newfull ? 'Oggi luna ' + (mo.p < 0.25 || mo.p > 0.75 ? 'nuova' : 'piena') + ': la tradizione consiglia riposo, niente semine né trapianti.' :
      mo.kind === 'crescente' ? 'Luna crescente: favorevole per seminare ortaggi da foglia, frutto e seme (insalate, cavoli, pomodori, zucchine, legumi).' :
        'Luna calante: favorevole per seminare radici, bulbi e tuberi (carote, cipolle, aglio, patate) e per trapiantare.') + '</p>';
    var nx = phaseEvents(Date.now(), Date.now() + 40 * DAYMS).slice(0, 4);
    h += '<p class="sub">Prossime fasi</p>';
    nx.forEach(function (e) { var q = localParts(e.t), td2 = toDate(q.date); h += '<div class="pl two"><span class="phn">' + moonSvg(e.q * 0.25, 22) + PHASE_NAMES[e.q] + '</span><span class="vv">' + fmtWd(td2) + ' ' + fmtDm(td2) + ' · ' + clock(e.t) + '</span></div>'; });
    $('moonnow').innerHTML = h;
    var cells = '', i;
    for (i = 0; i < 30; i++) {
      var d = addDays(td, i), m = moonDay(d), t = toDate(d);
      cells += '<div class="mc ' + (m.newfull ? 'mnf' : m.kind === 'crescente' ? 'mcr' : 'mca') + '"><span class="mdn">' + fmtWd(t) + ' ' + t.getUTCDate() + '</span>' + moonSvg(m.p, 24) + '<span class="mar">' + (m.asc ? '↑' : '↓') + '</span></div>';
    }
    $('moongrid').innerHTML = cells;
  }

  // ---------- coordinamento ----------
  function setStatus() {
    var el = $('lead');
    if (W.loaded) {
      var hh_ = W.last ? new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(W.last) : '';
      el.textContent = 'Meteo aggiornato alle ' + hh_ + ' · ' + W.nmodels + (W.nmodels === 1 ? ' modello' : ' modelli') + (W.error ? ' · ' + W.error : '');
    } else el.textContent = W.error ? 'Meteo non disponibile: ' + W.error : 'Carico il meteo...';
  }
  function renderAll() {
    var errs = [];
    [['oggi', renderToday], ['semina', renderSow], ['irrigazione', renderIrr], ['orto', renderMy], ['luna', renderMoonTab]].forEach(function (p) {
      try { p[1](); } catch (e) { errs.push(p[0] + ': ' + e.message); }
    });
    setStatus();
    $('diag').textContent = errs.length ? 'Avviso: sezione non mostrata (' + errs.join('; ') + ').' : '';
  }
  function showTab(t) {
    state.tab = t; lsSet('orto.tab', t);
    ['oggi', 'semina', 'irrigazione', 'orto', 'luna'].forEach(function (k) {
      var on = k === t; $('t-' + k).hidden = !on; $('tb-' + k).setAttribute('aria-selected', String(on));
    });
    window.scrollTo(0, 0);
  }
  function refresh(force) {
    $('refresh').disabled = true; $('lead').textContent = 'Aggiorno il meteo...';
    renderAll();
    loadWeather(force).then(function () { $('refresh').disabled = false; renderAll(); }, function () { $('refresh').disabled = false; renderAll(); });
  }
  function init() {
    var sel = '<option value="">Scegli l\'ortaggio...</option>' + ORTAGGI.slice().sort(function (a, b) { return a.nome < b.nome ? -1 : 1; }).map(function (v) { return '<option value="' + v.id + '">' + esc(v.nome) + '</option>'; }).join('');
    $('f-veg').innerHTML = sel;
    $('f-date').value = todayStr();
    ['oggi', 'semina', 'irrigazione', 'orto', 'luna'].forEach(function (k) { $('tb-' + k).addEventListener('click', function () { showTab(k); }); });
    $('refresh').addEventListener('click', function () { refresh(true); });
    $('sdays').addEventListener('click', function (e) { var b = e.target.closest('[data-sd]'); if (b) { state.sdate = b.getAttribute('data-sd'); renderSow(); } });
    ['tutto', 'semina', 'trapianto'].forEach(function (k) { $('so-' + k).addEventListener('click', function () { state.sop = k; renderSow(); }); });
    ['tutti', 'aperto', 'serra'].forEach(function (k) { $('sp-' + k).addEventListener('click', function () { state.spl = k; renderSow(); }); });
    $('s-q').addEventListener('input', function () { state.q = this.value; renderSow(); });
    $('i-q').addEventListener('input', function () { state.iq = this.value; renderIrr(); });
    $('set-soil').addEventListener('change', function () { settings.soil = this.value; saveSettings(); renderAll(); });
    $('set-method').addEventListener('change', function () { settings.method = this.value; saveSettings(); renderAll(); });
    $('ilist').addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; var k = b.getAttribute('data-c'); state.open = state.open === k ? null : k; renderIrr(); });
    $('f-add').addEventListener('click', function () {
      var id = $('f-veg').value, v = vegById(id);
      if (!v) { $('f-msg').textContent = 'Scegli prima un ortaggio.'; return; }
      var d = $('f-date').value || todayStr();
      state.my.push({ id: uid(), vid: id, nome: v.nome, serra: $('f-place').value === 'serra', mode: $('f-mode').value, start: d, irrig: [] });
      saveMy(); $('f-msg').textContent = v.nome + ' aggiunto.'; renderAll();
    });
    $('mylist').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var id = b.getAttribute('data-id'), k = state.my.map(function (x) { return x.id; }).indexOf(id);
      if (k < 0) return;
      if (b.getAttribute('data-act') === 'del') { if (confirm('Eliminare ' + state.my[k].nome + '?')) state.my.splice(k, 1); }
      else { state.my[k].irrig = (state.my[k].irrig || []).concat([{ d: todayStr(), mm: Number(b.getAttribute('data-mm')) }]); }
      saveMy(); renderAll();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && (!W.last || Date.now() - W.last.getTime() > TTL)) refresh(false);
    });
    var ft = $('foot'); if (ft) ft.textContent += ' Versione app ' + VERSION + '.';
    showTab(state.tab);
    refresh(false);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* facoltativo */ });
  }
  init();
})();
