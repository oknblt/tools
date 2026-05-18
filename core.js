/* ============================================================
   CAP Report Template — çekirdek mantık
   ============================================================ */

(function() {
'use strict';

/* ============================================================
   1. STORE — paylaşılan veri
   ============================================================ */

const store = {
  info: {},
  docs: {},
  _listeners: [],
  subscribe(fn) { this._listeners.push(fn); },
  notify() { this._listeners.forEach(fn => { try { fn(this); } catch(e) { console.error(e); } }); }
};
window.CAP = { store };

/* ============================================================
   2. YARDIMCILAR
   ============================================================ */

const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => (root || document).querySelectorAll(s);
const byId = id => document.getElementById(id);

function showToast(msg, ms = 2200) {
  let t = byId('cap-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cap-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

function timeToMinutes(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function formatHoursMinutes(totalMin) {
  if (totalMin === null || isNaN(totalMin) || totalMin < 0) return '';
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return m === 0 ? `${h} hours` : `${h} hours ${m} minutes`;
}

function calcDailyMinutes(startStr, endStr, breakMin) {
  const s = timeToMinutes(startStr), e = timeToMinutes(endStr);
  const br = parseInt(breakMin, 10) || 0;
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - br);
}

function addMonthsISO(dateStr, months) {
  if (!dateStr) return '';
  // dateStr ISO veya DD.MM.YYYY olabilir
  const parsed = parseAnyDate(dateStr);
  if (!parsed) return '';
  parsed.setMonth(parsed.getMonth() + months);
  // ISO döndür; çağıran formatlar
  return parsed.toISOString().slice(0, 10);
}

// DD.MM.YYYY veya DD.MM.YY veya YYYY-MM-DD parse et
function parseAnyDate(s) {
  if (!s) return null;
  s = String(s).trim();
  // ISO: YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  // DD.MM.YYYY veya DD.MM.YY
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    let d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) {
      // 00-89 → 2000s, 90-99 → 1900s (kullanıcı kuralı)
      y = y >= 90 ? 1900 + y : 2000 + y;
    }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt;
  }
  return null;
}

// DD.MM.YYYY formatına çevir
function toDDMMYYYY(s) {
  const d = parseAnyDate(s);
  if (!d) return s; // parse edemezsek olduğu gibi bırak
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// ISO formatına çevir (YYYY-MM-DD), hesaplamalar için
function toISO(s) {
  const d = parseAnyDate(s);
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

function yearsBetween(start, end) {
  if (!start || !end) return '';
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  let y = e.getFullYear() - s.getFullYear();
  const md = e.getMonth() - s.getMonth();
  if (md < 0 || (md === 0 && e.getDate() < s.getDate())) y--;
  return y;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function getVal(key) {
  const el = document.querySelector(`[data-key="${key}"]`);
  return el ? (el.value || '') : (store.info[key] || '');
}
function num(key) {
  const v = getVal(key);
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

window.CAP.helpers = {
  timeToMinutes, formatHoursMinutes, calcDailyMinutes,
  addMonthsISO, yearsBetween, todayISO, getVal, num, showToast
};

/* ============================================================
   3. HESAPLAMALAR
   ============================================================ */

function setComputed(id, value) {
  const el = byId(id);
  if (el) el.textContent = value || '';
}

/* Validasyon yardımcıları
   - Break min: günlük raw süre (start-end, mola düşülmeden) baz alınır
     <= 4 saat → 15 dk min, 4-7.5 saat → 30 dk min, > 7.5 saat → 60 dk min
   - Genç: günlük net <= 8 saat (480 dk), haftalık <= 40 saat (2400 dk)
   - Hamile: günlük net <= 7.5 saat (450 dk)
*/
function rawMinutes(startStr, endStr) {
  const s = timeToMinutes(startStr), e = timeToMinutes(endStr);
  if (s === null || e === null) return null;
  let diff = e - s;
  if (diff < 0) diff += 24 * 60;
  return diff;
}
function minBreakRequired(rawMin) {
  if (rawMin === null) return 0;
  if (rawMin <= 240) return 15;          // <= 4 saat
  if (rawMin <= 450) return 30;          // <= 7.5 saat
  return 60;                              // > 7.5 saat
}
function markInvalid(elId, invalid) {
  const el = byId(elId);
  if (!el) return;
  el.classList.toggle('invalid', !!invalid);
}

function validateBreak(startKey, endKey, breakKey) {
  // Returns true (geçerli) ya da false (yetersiz)
  const raw = rawMinutes(getVal(startKey), getVal(endKey));
  if (raw === null) return true; // boş, kontrol yok
  const brStr = getVal(breakKey);
  if (brStr === '') return true; // mola girilmemiş, kontrol yok
  const br = parseInt(brStr, 10);
  if (isNaN(br)) return true;
  return br >= minBreakRequired(raw);
}

function getInputId(dataKey) {
  const el = document.querySelector(`[data-key="${dataKey}"]`);
  return el ? el.id : null;
}

function recalcInfo() {
  updateConditionals();

  // Vardiya (info.html)
  const shiftDaily = calcDailyMinutes(getVal('shift_start'), getVal('shift_end'), getVal('shift_break'));
  setComputed('shift_daily_total', formatHoursMinutes(shiftDaily));
  setComputed('shift_weekly_total', formatHoursMinutes(shiftDaily !== null ? shiftDaily * 6 : null));

  // M-F
  const mfDaily = calcDailyMinutes(getVal('mf_start'), getVal('mf_end'), getVal('mf_break'));
  setComputed('mf_daily_total', formatHoursMinutes(mfDaily));
  const mfWeekly = mfDaily !== null ? mfDaily * 5 : null;
  setComputed('mf_weekly_total', formatHoursMinutes(mfWeekly));

  // Cumartesi
  const satRadio = document.querySelector('input[name="saturday_work"]:checked');
  const satOn = satRadio && satRadio.value === 'Yes';
  let satDaily = null;
  if (satOn) satDaily = calcDailyMinutes(getVal('sat_start'), getVal('sat_end'), getVal('sat_break'));
  setComputed('sat_daily_total', formatHoursMinutes(satDaily));

  // Toplam haftalık
  const totalWeeklyMin = (mfWeekly || 0) + (satDaily || 0);
  setComputed('total_weekly', mfWeekly !== null ? formatHoursMinutes(totalWeeklyMin) : '');

  // ---- VALIDASYON: Break süreleri ----
  // Her break input'unun id'sini bul ve invalid class'ını toggle et
  function checkBreak(startKey, endKey, breakKey, condClass) {
    const breakEl = document.querySelector(`[data-key="${breakKey}"]`);
    if (!breakEl) return;
    // Eğer ilgili koşul kapalıysa (örn. Young N), uyarı gösterme
    if (condClass) {
      const cond = document.querySelector(condClass);
      if (!cond || !cond.classList.contains('show')) {
        breakEl.classList.remove('invalid');
        return;
      }
    }
    const ok = validateBreak(startKey, endKey, breakKey);
    breakEl.classList.toggle('invalid', !ok);
  }
  checkBreak('shift_start', 'shift_end', 'shift_break', '.cond-shifts');
  checkBreak('mf_start', 'mf_end', 'mf_break', null);
  checkBreak('sat_start', 'sat_end', 'sat_break', '.cond-saturday');
  checkBreak('young_start', 'young_end', 'young_break', '.cond-young');
  checkBreak('pregnant_start', 'pregnant_end', 'pregnant_break', '.cond-pregnant');

  // Personel
  const mgmtM = num('mgmt_male'), mgmtF = num('mgmt_female');
  const nonM = num('nonmgmt_male'), nonF = num('nonmgmt_female');
  const cM = num('contractor_male'), cF = num('contractor_female');
  setComputed('mgmt_total', mgmtM + mgmtF || '');
  setComputed('nonmgmt_total', nonM + nonF || '');
  setComputed('contractor_total', cM + cF || '');
  const totalEmp = mgmtM + mgmtF + nonM + nonF;
  const totalC = cM + cF;
  const totalWithC = totalEmp + totalC;
  setComputed('total_employees', totalEmp || '');
  setComputed('total_with_contractors', totalWithC || '');
  setComputed('total_male', (mgmtM + nonM) || '');
  setComputed('total_female', (mgmtF + nonF) || '');
  setComputed('total_male_with_c', (mgmtM + nonM + cM) || '');
  setComputed('total_female_with_c', (mgmtF + nonF + cF) || '');
  setComputed('contractor_pct', totalWithC > 0 ? ((totalC / totalWithC) * 100).toFixed(1) + '%' : '');

  // Genç, engelli, göçmen, stajyer, hamile, sendika
  const yTotal = num('young_male') + num('young_female');
  setComputed('young_total', yTotal || '');
  const yD = calcDailyMinutes(getVal('young_start'), getVal('young_end'), getVal('young_break'));
  setComputed('young_daily', formatHoursMinutes(yD));
  const yW = yD !== null ? yD * 5 : null;
  setComputed('young_weekly', formatHoursMinutes(yW));

  // ---- VALIDASYON: Young günlük <= 8h, haftalık <= 40h ----
  const youngCond = document.querySelector('.cond-young');
  const youngActive = youngCond && youngCond.classList.contains('show');
  const youngDailyEl = byId('young_daily');
  const youngWeeklyEl = byId('young_weekly');
  if (youngDailyEl) youngDailyEl.classList.toggle('invalid', !!(youngActive && yD !== null && yD > 480));
  if (youngWeeklyEl) youngWeeklyEl.classList.toggle('invalid', !!(youngActive && yW !== null && yW > 2400));

  const disabledTotal = num('disabled_male') + num('disabled_female');
  setComputed('disabled_total', disabledTotal || '');
  setComputed('migrant_total', (num('migrant_male') + num('migrant_female')) || '');
  setComputed('trainee_total', (num('trainee_male') + num('trainee_female')) || '');

  // ---- VALIDASYON: Disabled %3 (>= 50 toplam çalışan) ----
  const disabledCond = document.querySelector('.cond-disabled');
  const disabledActive = disabledCond && disabledCond.classList.contains('show');
  const disabledTotalEl = byId('disabled_total');
  if (disabledTotalEl) {
    if (disabledActive && totalEmp >= 50) {
      // 3% hesabı, standart yuvarlama (3,5 → 4)
      const required = Math.round(totalEmp * 0.03);
      disabledTotalEl.classList.toggle('invalid', disabledTotal < required);
    } else {
      disabledTotalEl.classList.remove('invalid');
    }
  }

  const pD = calcDailyMinutes(getVal('pregnant_start'), getVal('pregnant_end'), getVal('pregnant_break'));
  setComputed('pregnant_daily', formatHoursMinutes(pD));
  setComputed('pregnant_weekly', formatHoursMinutes(pD !== null ? pD * 5 : null));

  // ---- VALIDASYON: Pregnant günlük <= 7.5h (450 dk) ----
  const pregCond = document.querySelector('.cond-pregnant');
  const pregActive = pregCond && pregCond.classList.contains('show');
  const pregDailyEl = byId('pregnant_daily');
  if (pregDailyEl) pregDailyEl.classList.toggle('invalid', !!(pregActive && pD !== null && pD > 450));

  setComputed('union_total', (num('union_male') + num('union_female')) || '');

  // En genç çalışan
  const yB = getVal('youngest_birth'), yH = getVal('youngest_hire');
  setComputed('youngest_age', yB ? (yearsBetween(yB, todayISO()) || '') : '');
  setComputed('youngest_hire_age', (yB && yH) ? (yearsBetween(yB, yH) || '') : '');

  // Görüşmeler
  const im = num('iv_ind_male'), iff = num('iv_ind_female'), gm = num('iv_grp_male'), gf = num('iv_grp_female');
  setComputed('iv_ind_total', (im + iff) || '');
  setComputed('iv_grp_total', (gm + gf) || '');
  setComputed('iv_total', (im + iff + gm + gf) || '');
  setComputed('iv_male_total', (im + gm) || '');
  setComputed('iv_female_total', (iff + gf) || '');

  // Store'a sync et
  syncDOMToStore();
}

function recalcDocs() {
  const hazard = getVal('hazard_class') || 'low hazardous';
  document.querySelectorAll('.computed-cell[data-expiry-rule]').forEach(cell => {
    const row = cell.dataset.row;
    const issueEl = document.querySelector(`input[data-row="${row}"][data-field="issue"]`);
    const numberEl = document.querySelector(`input[data-row="${row}"][data-field="number"]`);
    const issue = issueEl ? issueEl.value : '';
    let rule;
    try { rule = JSON.parse(cell.dataset.expiryRule); } catch(e) { return; }

    let resultISO = '';
    if (!issue) {
      resultISO = '';
    } else if (rule.type === 'edate') {
      resultISO = addMonthsISO(issue, rule.months);
    } else if (rule.type === 'hazard') {
      const m = rule.months[hazard];
      if (m) resultISO = addMonthsISO(issue, m);
    } else if (rule.type === 'conditional_exempt') {
      const nv = numberEl ? numberEl.value : '';
      resultISO = nv === 'Exemption letter' ? 'N/A' : addMonthsISO(issue, rule.months);
    }

    // Görüntüleme DD.MM.YYYY formatında
    const displayValue = (resultISO && resultISO !== 'N/A') ? toDDMMYYYY(resultISO) : resultISO;
    cell.textContent = displayValue;
    cell.classList.remove('expired', 'warn');
    if (resultISO && resultISO !== 'N/A') {
      const d = parseAnyDate(resultISO), now = new Date();
      if (d) {
        const diffDays = (d - now) / (1000 * 60 * 60 * 24);
        if (diffDays < 0) cell.classList.add('expired');
        else if (diffDays < 60) cell.classList.add('warn');
      }
    }
  });
  syncDOMToStore();
}

function updateConditionals() {
  const map = [
    { name: 'multiple_shifts', cls: '.cond-shifts', on: 'yes' },
    { name: 'saturday_work', cls: '.cond-saturday', on: 'Yes' },
    { name: 'contractors', cls: '.cond-contractors', on: 'yes' },
    { name: 'young_employee', cls: '.cond-young', on: 'Yes' },
    { name: 'disabled', cls: '.cond-disabled', on: 'Yes' },
    { name: 'migrant', cls: '.cond-migrant', on: 'Yes' },
    { name: 'trainee', cls: '.cond-trainee', on: 'Yes' },
    { name: 'pregnant', cls: '.cond-pregnant', on: 'Yes' },
    { name: 'unionized', cls: '.cond-unionized', on: 'Yes' },
  ];
  map.forEach(m => {
    const checked = document.querySelector(`input[name="${m.name}"]:checked`);
    const show = checked && checked.value === m.on;
    document.querySelectorAll(m.cls).forEach(el => el.classList.toggle('show', show));
  });
}

function recalcAll() {
  recalcInfo();
  recalcDocs();
  store.notify();
  // Rapor panellerini yenile
  refreshActiveReport();
}
window.CAP.recalcAll = recalcAll;

/* ============================================================
   4. DOM ↔ STORE SENKRONİZASYON
   ============================================================ */

function syncDOMToStore() {
  store.info = {};
  store.docs = {};

  document.querySelectorAll('[data-key]').forEach(el => {
    store.info[el.dataset.key] = el.value || '';
  });

  ['multiple_shifts','saturday_work','contractors','young_employee','disabled',
   'migrant','trainee','pregnant','unionized'].forEach(name => {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    store.info[name] = checked ? checked.value : '';
  });

  // Hesaplanan değerler de store'a girsin (raporlamada kullanılacak)
  // setComputed'in yazdığı tüm id'li elementleri yakala
  const computedIds = ['shift_daily_total','shift_weekly_total','mf_daily_total','mf_weekly_total',
    'sat_daily_total','total_weekly','mgmt_total','nonmgmt_total','contractor_total',
    'total_employees','total_with_contractors','total_male','total_female',
    'total_male_with_c','total_female_with_c','contractor_pct',
    'young_total','young_daily','young_weekly','disabled_total','migrant_total','trainee_total',
    'pregnant_daily','pregnant_weekly','union_total','youngest_age','youngest_hire_age',
    'iv_total','iv_male_total','iv_female_total','iv_ind_total','iv_grp_total'];
  computedIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) store.info['_computed_' + id] = el.textContent || '';
  });

  document.querySelectorAll('input[data-doc-key]').forEach(el => {
    store.docs[el.dataset.docKey] = el.value || '';
  });
  document.querySelectorAll('.computed-cell[data-row]').forEach(el => {
    const row = el.dataset.row;
    store.docs[`${row}_expiry_auto`] = el.textContent || '';
  });
}

function syncStoreToDOM() {
  Object.entries(store.info).forEach(([k, v]) => {
    if (k.startsWith('_computed_')) return;
    const el = document.querySelector(`[data-key="${k}"]`);
    if (el) {
      el.value = v;
    } else {
      const r = document.querySelector(`input[name="${k}"][value="${v}"]`);
      if (r) r.checked = true;
    }
  });
  Object.entries(store.docs).forEach(([k, v]) => {
    const el = document.querySelector(`input[data-doc-key="${k}"]`);
    if (el) el.value = v;
  });
  recalcAll();
}

/* ============================================================
   5. KAYDET / YÜKLE — JSON
   ============================================================ */

function saveJSON() {
  syncDOMToStore();
  const data = {
    _version: 1,
    _timestamp: new Date().toISOString(),
    info: store.info,
    docs: store.docs
  };
  const fname = (data.info.facility_name || 'facility').toString().replace(/[^\w-]+/g, '_').slice(0, 40);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `CAP_${fname}_${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Saved');
}

function loadJSON() {
  let inp = byId('cap-file-input');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.id = 'cap-file-input';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.info) throw new Error('Geçersiz format');
          // Önce DOM'u sıfırla
          clearDOM();
          store.info = data.info || {};
          store.docs = data.docs || {};
          syncStoreToDOM();
          showToast('Loaded');
        } catch (err) {
          showToast('Load failed: ' + err.message, 3500);
        }
      };
      reader.readAsText(f);
      e.target.value = '';
    });
  }
  inp.click();
}

function newForm() {
  if (!confirm('Reset all fields? Unsaved changes will be lost.')) return;
  clearDOM();
  applyDefaults();
  recalcAll();
  showToast('Reset');
}

function clearDOM() {
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], input[type="time"], textarea').forEach(el => {
    if (el.id === 'cap-file-input') return;
    if (el.dataset.key || el.dataset.docKey) el.value = '';
  });
}

function applyDefaults() {
  const defaults = {
    building_type: 'not shared',
    property_building: 'The building belongs to the facility.',
    hazard_class: 'low hazardous',
    canteen: 'Canteen is available.',
    dormitory: 'Dormitory is not available.',
    payment_method: 'by bank transfer',
    product_type: "men's and women's outwear garments",
    production_processes: 'cutting, sewing, ironing and packing',
  };
  Object.entries(defaults).forEach(([k, v]) => {
    const el = document.querySelector(`[data-key="${k}"]`);
    if (el) el.value = v;
  });
  document.querySelectorAll('input[type="radio"]').forEach(r => {
    if (['no','No','NA'].includes(r.value)) r.checked = true;
  });
}

/* ============================================================
   6. EXCEL EXPORT — SheetJS (CDN)
   ============================================================ */

function exportExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded (internet needed)', 4000);
    return;
  }
  syncDOMToStore();
  const info = store.info, docs = store.docs;
  const c = k => info['_computed_' + k] || '';

  const infoRows = [
    ['FACILITY INFORMATION', ''],
    ['Facility name', info.facility_name || ''],
    ['Facility address', info.facility_address || ''],
    ['GPS coordinates', info.gps || ''],
    ['Establishment date', info.establishment_date || ''],
    ['Operation time at current address', info.operation_time || ''],
    ['Product type', info.product_type || ''],
    ['Production processes', info.production_processes || ''],
    ['Multiple shifts?', info.multiple_shifts || 'no'],
    ['Shift start', info.shift_start || ''],
    ['Shift end', info.shift_end || ''],
    ['Shift break (min)', info.shift_break || ''],
    ['Shift working days', info.shift_workdays || ''],
    ['Shift department(s)', info.shift_departments || ''],
    ['Shift daily total', c('shift_daily_total')],
    ['Shift weekly (6 days)', c('shift_weekly_total')],
    ['M-F start', info.mf_start || ''],
    ['M-F end', info.mf_end || ''],
    ['M-F break (min)', info.mf_break || ''],
    ['M-F department(s)', info.mf_departments || ''],
    ['M-F daily total', c('mf_daily_total')],
    ['M-F weekly (5 days)', c('mf_weekly_total')],
    ['Saturday work?', info.saturday_work || 'No'],
    ['Sat start', info.sat_start || ''],
    ['Sat end', info.sat_end || ''],
    ['Sat break (min)', info.sat_break || ''],
    ['Sat daily total', c('sat_daily_total')],
    ['Total weekly working time', c('total_weekly')],
    ['Time recording system', info.time_recording || ''],
    ['Wage date', info.wage_date || ''],
    ['Payment method', info.payment_method || ''],
    ['Monthly production capacity', info.monthly_capacity || ''],
    ['Peak months', info.peak_months || ''],
    ['Contractors', info.contractors || 'no'],
    ['Contractor male', info.contractor_male || 0],
    ['Contractor female', info.contractor_female || 0],
    ['Total contractors', c('contractor_total')],
    ['Contractor info', info.contractor_info || ''],
    ['Facility closed area (sqm)', info.closed_area || ''],
    ['Building type', info.building_type || ''],
    ['Number of floors', info.num_floors || ''],
    ['Building structure', info.building_structure || ''],
    ['Total with contractors', c('total_with_contractors')],
    ['Total employees', c('total_employees')],
    ['Management male', info.mgmt_male || ''],
    ['Management female', info.mgmt_female || ''],
    ['Management total', c('mgmt_total')],
    ['Non-management male', info.nonmgmt_male || ''],
    ['Non-management female', info.nonmgmt_female || ''],
    ['Non-management total', c('nonmgmt_total')],
    ['Young employee', info.young_employee || 'No'],
    ['Young male', info.young_male || ''],
    ['Young female', info.young_female || ''],
    ['Total young', c('young_total')],
    ['Young start', info.young_start || ''],
    ['Young end', info.young_end || ''],
    ['Young break (min)', info.young_break || ''],
    ['Young daily', c('young_daily')],
    ['Young weekly', c('young_weekly')],
    ['Disabled employee', info.disabled || 'No'],
    ['Disabled male', info.disabled_male || 0],
    ['Disabled female', info.disabled_female || 0],
    ['Total disabled', c('disabled_total')],
    ['Migrant employee', info.migrant || 'No'],
    ['Migrant male', info.migrant_male || 0],
    ['Migrant female', info.migrant_female || 0],
    ['Total migrant', c('migrant_total')],
    ['Nationalities', info.nationalities || ''],
    ['Trainee', info.trainee || 'NA'],
    ['Trainee male', info.trainee_male || ''],
    ['Trainee female', info.trainee_female || ''],
    ['Total trainee', c('trainee_total')],
    ['Pregnant employee', info.pregnant || 'No'],
    ['Pregnant count', info.pregnant_num || 0],
    ['Pregnant start', info.pregnant_start || ''],
    ['Pregnant end', info.pregnant_end || ''],
    ['Pregnant break (min)', info.pregnant_break || ''],
    ['Pregnant daily', c('pregnant_daily')],
    ['Pregnant weekly', c('pregnant_weekly')],
    ['On breastfeeding leave', info.breastfeeding || 0],
    ['On maternity leave', info.maternity || 0],
    ['Unionized', info.unionized || 'No'],
    ['Union male', info.union_male || ''],
    ['Union female', info.union_female || ''],
    ['Total unionized', c('union_total')],
    ['Union info', info.union_info || ''],
    ['Youngest birth date', info.youngest_birth || ''],
    ['Youngest hire date', info.youngest_hire || ''],
    ['Youngest current age', c('youngest_age')],
    ['Youngest hire age', c('youngest_hire_age')],
    ['Canteen', info.canteen || ''],
    ['Dormitory', info.dormitory || ''],
    ['Property of building', info.property_building || ''],
    ['Hazard class', info.hazard_class || ''],
    ['Last paid month', info.last_paid_month || ''],
    ['Selected month 2', info.month_2 || ''],
    ['Selected month 3', info.month_3 || ''],
    ['Interview ind. male', info.iv_ind_male || ''],
    ['Interview ind. female', info.iv_ind_female || ''],
    ['Interview grp male', info.iv_grp_male || ''],
    ['Interview grp female', info.iv_grp_female || ''],
    ['Total interviewed', c('iv_total')],
    ['Total interviewed male', c('iv_male_total')],
    ['Total interviewed female', c('iv_female_total')],
    ['Employees on audit date', info.employees_on_audit || ''],
    ['Certifications', info.certifications || ''],
    ['Main equipment', info.main_equipment || ''],
    ['Night shift %', info.night_shift_pct || ''],
    ['Social compliance title', info.sc_title || ''],
    ['Lowest wage (net)', info.lowest_net || ''],
    ['Lowest wage (gross)', info.lowest_gross || ''],
    ['Highest wage (net)', info.highest_net || ''],
    ['Highest wage (gross)', info.highest_gross || ''],
    ['Audit start', info.audit_start || ''],
    ['Audit end', info.audit_end || ''],
    ['Contractor %', c('contractor_pct')],
    ['SC responsible name', info.sc_name || ''],
    ['SC responsible gender', info.sc_gender || ''],
    ['Audit day male', info.audit_male || ''],
    ['Audit day female', info.audit_female || ''],
    ['Total male incl. contractors', c('total_male_with_c')],
    ['Total female incl. contractors', c('total_female_with_c')],
    ['Total male', c('total_male')],
    ['Total female', c('total_female')],
    ['Previous audit date', info.prev_audit || ''],
  ];

  const docsRows = [['Scope', 'Document', 'Issue', 'Expiry', 'Number', 'Notes']];
  Object.keys(docs).filter(k => k.endsWith('_issue')).sort().forEach(k => {
    const rowId = k.replace('_issue', '');
    docsRows.push([
      '',
      rowId,
      docs[k] || '',
      docs[`${rowId}_expiry_auto`] || docs[`${rowId}_expiry`] || '',
      docs[`${rowId}_number`] || '',
      docs[`${rowId}_notes`] || ''
    ]);
  });

  const wb = XLSX.utils.book_new();
  const wsI = XLSX.utils.aoa_to_sheet(infoRows);
  wsI['!cols'] = [{ wch: 38 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsI, 'Info');
  const wsD = XLSX.utils.aoa_to_sheet(docsRows);
  wsD['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsD, 'Docs');

  const fname = (info.facility_name || 'facility').toString().replace(/[^\w-]+/g, '_').slice(0, 40);
  XLSX.writeFile(wb, `CAP_${fname}_${todayISO()}.xlsx`);
  showToast('Excel saved');
}

/* ============================================================
   7. PANEL YÜKLEYİCİ (fetch ile)
   ============================================================ */

const panelCache = {};
const reportRenderers = {};

window.CAP.registerReport = function(name, renderFn) {
  reportRenderers[name] = renderFn;
};

async function loadPanel(name) {
  const container = document.getElementById(`panel-${name}`);
  if (!container) return;
  if (container.dataset.loaded === '1') return;

  let html;
  if (panelCache[name]) {
    html = panelCache[name];
  } else {
    try {
      const resp = await fetch(`panels/${name}.html`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
      panelCache[name] = html;
    } catch (e) {
      container.innerHTML = `<p style="color:var(--error); padding:20px;">Panel yüklenemedi (${name}): ${e.message}<br><small>Bu dosya yerel açıldıysa, küçük bir HTTP sunucusu üzerinden açın (python3 -m http.server).</small></p>`;
      container.dataset.loaded = '1';
      return;
    }
  }
  container.innerHTML = html;
  container.dataset.loaded = '1';

  // Eğer panel bir scripttsa, içerideki script'leri çalıştır
  container.querySelectorAll('script').forEach(s => {
    const ns = document.createElement('script');
    if (s.src) ns.src = s.src;
    else ns.textContent = s.textContent;
    s.parentNode.replaceChild(ns, s);
  });

  // Bilgi paneli ise mevcut store'u DOM'a yansıt
  if (name === 'info' || name === 'docs') {
    syncStoreToDOM();
    initAllTextareas();
  } else {
    // Rapor panelleri: rapor render fonksiyonu çağrılır
    refreshReport(name);
  }
}

function refreshReport(name) {
  const fn = reportRenderers[name];
  if (!fn) return;
  const container = document.getElementById(`panel-${name}`);
  if (!container) return;
  syncDOMToStore();
  try {
    fn(container, store);
  } catch (e) {
    console.error(`Rapor render hatası (${name}):`, e);
  }
}

function refreshActiveReport() {
  const active = document.querySelector('.panel.active');
  if (!active) return;
  const name = active.id.replace('panel-', '');
  if (reportRenderers[name]) refreshReport(name);
}

/* ============================================================
   8. TAB YÖNETİMİ
   ============================================================ */

async function activateTab(name) {
  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  if (!panel) return;
  panel.classList.add('active');
  await loadPanel(name);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupTabs() {
  document.querySelectorAll('nav.tabs button').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

/* ============================================================
   9. SMART STICKY ÜST BAR
   ============================================================ */

function setupSticky() {
  const bar = document.querySelector('header.topbar');
  if (!bar) return;
  let lastY = 0;
  const threshold = 60;

  function onScroll() {
    const y = window.scrollY;
    if (y <= threshold) {
      bar.classList.remove('hidden');
    } else if (y > lastY) {
      // Aşağı kaydırıyor — gizle
      bar.classList.add('hidden');
    }
    // Yukarı kaydırırken gösterme (sadece en üste dönünce gözüksün)
    lastY = y;

    // Scroll-to-top butonu
    const stb = document.getElementById('cap-scroll-top');
    if (stb) stb.classList.toggle('show', y > 300);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
}

function setupScrollTop() {
  const btn = document.createElement('button');
  btn.id = 'cap-scroll-top';
  btn.className = 'scroll-top';
  btn.title = 'Scroll to top';
  btn.setAttribute('aria-label', 'Scroll to top');
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 15l-6-6-6 6"/></svg>`;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
}

/* ============================================================
   10. BAŞLATMA
   ============================================================ */

async function init() {
  setupTabs();
  setupSticky();
  setupScrollTop();

  // Buton bağlantıları
  const btnNew = byId('btnNew'); if (btnNew) btnNew.addEventListener('click', newForm);
  const btnLoad = byId('btnLoad'); if (btnLoad) btnLoad.addEventListener('click', loadJSON);
  const btnSave = byId('btnSave'); if (btnSave) btnSave.addEventListener('click', saveJSON);
  const btnExport = byId('btnExport'); if (btnExport) btnExport.addEventListener('click', exportExcel);
  const btnTheme = byId('btnTheme');
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      const root = document.documentElement;
      const cur = root.getAttribute('data-theme');
      // Cycle: auto (yok) -> dark -> light -> auto
      if (!cur) root.setAttribute('data-theme', 'dark');
      else if (cur === 'dark') root.setAttribute('data-theme', 'light');
      else root.removeAttribute('data-theme');
      showToast('Theme: ' + (root.getAttribute('data-theme') || 'auto'));
    });
  }

  // Tüm form değişiklikleri merkezi recalc
  document.addEventListener('input', e => {
    // Textarea auto-grow (field-sizing desteklemeyen tarayıcılar için fallback)
    if (e.target.tagName === 'TEXTAREA' && !CSS.supports('field-sizing: content')) {
      autoGrowTextarea(e.target);
    }
    recalcAll();
  });
  document.addEventListener('change', recalcAll);

  // Docs tarih alanları: blur'da DD.MM.YY → DD.MM.YYYY otomatik dönüşüm
  document.addEventListener('blur', e => {
    const el = e.target;
    if (el.tagName === 'INPUT' && el.dataset.dateField) {
      const v = el.value.trim();
      if (!v) return;
      const formatted = toDDMMYYYY(v);
      if (formatted && formatted !== v) {
        el.value = formatted;
        // Hesaplamaları tetikle (auto expiry, vade vb.)
        recalcAll();
      }
    }
  }, true);

  // İlk sekme yükleme
  await activateTab('info');
  applyDefaults();
  recalcAll();
}

// Textarea auto-grow fallback
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// Sayfa yüklenince tüm textarea'ları bir kere auto-grow yap
function initAllTextareas() {
  if (CSS.supports('field-sizing: content')) return;
  document.querySelectorAll('textarea').forEach(t => autoGrowTextarea(t));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
