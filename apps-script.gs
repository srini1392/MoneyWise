/**
 * Spending Tracker — Google Apps Script backend
 * ---------------------------------------------
 * Turns a Google Sheet into the storage for the Spending PWA.
 *
 * SETUP
 * 1. Create a new Google Sheet (this becomes the file in your Drive).
 * 2. Extensions > Apps Script. Delete whatever is there, paste this whole file.
 * 3. Save, then Deploy > New deployment.
 *      Select type ....... Web app
 *      Description ....... spending
 *      Execute as ........ Me
 *      Who has access .... Anyone          <-- required, not "Anyone with Google account"
 * 4. Authorise it (you'll see an "unverified app" warning: Advanced > Go to project).
 * 5. Copy the Web app URL (ends in /exec).
 * 6. In the app: menu (…) > paste it into Script URL > "Save and sync now".
 *
 * The first request creates a "Spending" tab with headers if it doesn't exist.
 *
 * API this exposes (the app already speaks it):
 *   GET  ?                 -> {status:'ok', data:[{rowId,date,category,description,paymentMode,amount,id}]}
 *   POST {date,category,description,paymentMode,amount,id}
 *                          -> appends a row, skipping duplicates by id
 *   POST {action:'delete', rowId, id}
 *                          -> deletes that row (by id when given, else by row number)
 */

var SHEET_NAME = 'Spending';
var HEADERS = ['Date', 'Category', 'Description', 'Payment Mode', 'Amount', 'Id', 'Created', 'Type'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() > 0) {
    var have = sh.getLastColumn();
    if (have < HEADERS.length) {
      sh.getRange(1, have + 1, 1, HEADERS.length - have).setValues([HEADERS.slice(have)]);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    }
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setColumnWidth(1, 100);
    sh.setColumnWidth(3, 220);
    sh.setColumnWidth(6, 260);
  }
  return sh;
}

function out_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var cb = (e && e.parameter && e.parameter.callback) || "";
  var payload;
  try {
    var sh = sheet_();
    var last = sh.getLastRow();
    var data = [];
    if (last > 1) {
      var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
      for (var i = 0; i < values.length; i++) {
        var r = values[i];
        if (!r[0] && !r[5]) continue;
        data.push({
          rowId: i + 2,
          date: isoDate_(r[0]),
          category: String(r[1] || ''),
          description: String(r[2] || ''),
          paymentMode: String(r[3] || ''),
          amount: Number(r[4]) || 0,
          id: String(r[5] || ''),
          type: String(r[7] || 'expense')
        });
      }
    }
    payload = { status: 'ok', count: data.length, data: data };
  } catch (err) {
    payload = { status: 'error', message: String(err) };
  }

  // JSONP: lets a page read this even when the browser blocks the cross-origin
  // fetch. Only a safe callback name is echoed back.
  if (cb && /^[A-Za-z_$][A-Za-z0-9_$]{0,60}$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + "(" + JSON.stringify(payload) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return out_(payload);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return out_({ status: 'error', message: 'busy' });
  }
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var sh = sheet_();
    if (body.action === 'delete') return out_(removeRow_(sh, body));
    if (body.action === 'update') return out_(replaceRow_(sh, body));
    return out_(appendRow_(sh, body));
  } catch (err) {
    return out_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function appendRow_(sh, b) {
  var id = String(b.id || '');
  var date = isoDate_(b.date);
  var amount = Number(b.amount);
  if (!date) return { status: 'error', message: 'bad date' };
  if (!isFinite(amount) || amount <= 0) return { status: 'error', message: 'bad amount' };

  // Idempotent: a retried POST must not create a second row.
  if (id) {
    var existing = findById_(sh, id);
    if (existing) return { status: 'ok', action: 'skipped', reason: 'duplicate id', rowId: existing };
  }

  sh.appendRow([date, b.category || 'Misc', b.description || '', b.paymentMode || '', amount, id, new Date(), b.type || 'expense']);
  return { status: 'ok', action: 'appended', rowId: sh.getLastRow() };
}

function replaceRow_(sh, b) {
  var row = Number(b.rowId);
  if (!row || row < 2 || row > sh.getLastRow()) return { status: 'error', message: 'bad rowId' };
  var date = isoDate_(b.date);
  if (!date) return { status: 'error', message: 'bad date' };
  sh.getRange(row, 1, 1, 8).setValues([[
    date, b.category || 'Misc', b.description || '', b.paymentMode || '', Number(b.amount) || 0,
    String(b.id || ''), new Date(), b.type || 'expense'
  ]]);
  return { status: 'ok', action: 'updated', rowId: row };
}

function removeRow_(sh, b) {
  // Prefer the id: row numbers shift after a delete, ids don't.
  if (b.id) {
    var found = findById_(sh, String(b.id));
    if (found) {
      sh.deleteRow(found);
      return { status: 'ok', action: 'deleted', by: 'id' };
    }
  }
  var row = Number(b.rowId);
  if (row && row >= 2 && row <= sh.getLastRow()) {
    sh.deleteRow(row);
    return { status: 'ok', action: 'deleted', by: 'rowId' };
  }
  return { status: 'ok', action: 'not-found' };
}

function findById_(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 6, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

/** Accepts a Date, a serial number, or any of 2026-10-29 / 29-10-2026 / 29/10/2026. */
function isoDate_(v) {
  if (v === null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  if (typeof v === 'number') {
    var d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  var d2 = new Date(s);
  if (!isNaN(d2.getTime())) return Utilities.formatDate(d2, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return '';
}
