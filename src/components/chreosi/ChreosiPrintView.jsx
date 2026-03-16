const COLUMN_LABELS = {
  admission_year: 'Έτος Εισδοχής',
  department: 'Τμήμα',
  last_name: 'Επίθετο',
  first_name: 'Όνομα',
  mobile_phone: 'Κινητό',
  notes: 'Σημειώσεις',
};

// Absolute widths for compact/flexible columns.
// notes is intentionally absent → gets all remaining width (table-layout: fixed remainder rule).
const COLUMN_WIDTHS = {
  admission_year: '20mm',
  department: '30mm',
  last_name:  '32mm',
  first_name: '28mm',
  mobile_phone: '28mm',
};

// ── Helpers ──────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeStr(s) {
  return (s || '').trim().replace(/\s+/g, ' ');
}

// ── Filtering ─────────────────────────────────────────────

function filterPeople(account, people) {
  const normalizedUsername = normalizeStr(account.username);
  const allowedSymbols =
    Array.isArray(account.allowed_prediction_symbols) && account.allowed_prediction_symbols.length > 0
      ? account.allowed_prediction_symbols
      : null;

  return people.filter((p) => {
    try {
      const cp1 = normalizeStr(p.contact_person_1);
      const cp2 = normalizeStr(p.contact_person_2);
      if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) return false;
      if (p.voted !== false) return false;
      if (allowedSymbols && !allowedSymbols.includes(p.prediction_symbol)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

// ── Sorting ───────────────────────────────────────────────

function sortPeople(people, orderedSortFields) {
  return [...people].sort((a, b) => {
    for (const field of orderedSortFields) {
      const aRaw = a[field] ?? '';
      const bRaw = b[field] ?? '';
      let cmp = 0;
      if (field === 'admission_year') {
        const aNum = parseInt(aRaw, 10);
        const bNum = parseInt(bRaw, 10);
        cmp = (!isNaN(aNum) && !isNaN(bNum))
          ? aNum - bNum
          : String(aRaw).localeCompare(String(bRaw), 'el');
      } else {
        cmp = String(aRaw).localeCompare(String(bRaw), 'el');
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

// ── Main print function ───────────────────────────────────

export function printChreosiStatement({ account, people, orderedColumns, orderedSortFields, orientation, rowsPerPage }) {
  const filtered = filterPeople(account, people);
  const sorted = sortPeople(filtered, orderedSortFields);

  // Validated rows-per-page
  const safeRPP = Math.max(1, Math.round(Number(rowsPerPage) || 25));

  // ── Page layout constants (mm) ──
  const isPortrait = orientation === 'portrait';
  const PAGE_W = isPortrait ? 210 : 297;
  const PAGE_H = isPortrait ? 297 : 210;
  const PAD = 12;                          // padding on all sides
  const USABLE_H = PAGE_H - PAD * 2;       // height available inside page
  const HEADER_H = 20;                     // account info + column header row
  const FOOTER_H = 7;                      // page number area
  const BODY_H = USABLE_H - HEADER_H - FOOTER_H;  // data rows area
  const ROW_H = (BODY_H / safeRPP).toFixed(3);    // per-row height in mm

  // ── Chunk data into pages ──
  const chunks = [];
  for (let i = 0; i < sorted.length; i += safeRPP) {
    chunks.push(sorted.slice(i, i + safeRPP));
  }
  if (chunks.length === 0) chunks.push([]); // always at least one page
  const totalPages = chunks.length;
  const colCount = orderedColumns.length;

  // ── Escaped header values ──
  const displayName = escHtml(account.display_name || account.username || '');
  const usernameEsc = escHtml(account.username || '');

  // ── Column definitions shared by header table and data table ──
  // notes col has no entry in COLUMN_WIDTHS → no width attribute → gets all leftover space
  const colgroup = orderedColumns
    .map(col => {
      const w = COLUMN_WIDTHS[col];
      return w ? `<col style="width:${w}">` : `<col>`;
    })
    .join('');
  const theadRow = orderedColumns
    .map(col => `<th>${escHtml(COLUMN_LABELS[col] || col)}</th>`)
    .join('');

  // ── Generate one page container per chunk ──
  const pagesHtml = chunks.map((chunk, idx) => {
    const pageNum = idx + 1;
    const isLast = idx === chunks.length - 1;

    const dataRows = chunk.length > 0
      ? chunk.map(p => {
          const cells = orderedColumns.map(col => {
            const val = p[col];
            const display = (val === null || val === undefined || val === '')
              ? '-'
              : escHtml(String(val));
            return `<td class="cell${col === 'notes' ? ' nc' : ''}">${display}</td>`;
          }).join('');
          return `<tr style="height:${ROW_H}mm">${cells}</tr>`;
        }).join('')
      : `<tr><td colspan="${colCount}" class="empty-cell">Δεν βρέθηκαν εγγραφές</td></tr>`;

    return `<div class="page${isLast ? ' last' : ''}">
  <div class="ph" style="height:${HEADER_H}mm">
    <div class="ph-top">
      <div class="adn">${displayName}</div>
      <div class="aun">Username: ${usernameEsc}</div>
    </div>
    <div class="ph-bot">
      <table class="ht"><colgroup>${colgroup}</colgroup><tr>${theadRow}</tr></table>
    </div>
  </div>
  <div class="pb" style="height:${BODY_H}mm">
    <table class="dt"><colgroup>${colgroup}</colgroup><tbody>${dataRows}</tbody></table>
  </div>
  <div class="pf" style="height:${FOOTER_H}mm">Σελίδα ${pageNum} / ${totalPages}</div>
</div>`;
  }).join('\n');

  // ── Full document ──
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>Χρεωστικός: ${usernameEsc}</title>
<style>
@page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; }

.page {
  width: ${PAGE_W}mm; height: ${PAGE_H}mm;
  padding: ${PAD}mm;
  page-break-after: always; break-after: page;
  overflow: hidden;
}
.page.last { page-break-after: avoid; break-after: avoid; }

/* ── Page header (account info + column headers) ── */
.ph { display: flex; flex-direction: column; overflow: hidden; }
.ph-top { flex: 1; overflow: hidden; }
.ph-bot { flex-shrink: 0; }
.adn { font-size: 13pt; font-weight: bold; line-height: 1.2; }
.aun { font-size: 8pt; color: #555; margin: 2px 0 3px; }

/* ── Header table + data table share identical colgroup ── */
/* table-layout:fixed with explicit col widths: unspecified cols (notes) absorb the remainder */
.ht, .dt { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ht th {
  background: #efefef;
  border-top: 1px solid #999; border-bottom: 1px solid #999;
  padding: 2px 4px; text-align: left;
  font-size: 7pt; font-weight: bold;
  white-space: nowrap; overflow: hidden;
}

/* ── Data rows area ── */
.pb { overflow: hidden; }
.cell {
  border-bottom: 1px solid #e0e0e0;
  padding: 0 4px; vertical-align: middle;
  font-size: 7.5pt; line-height: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 0;
}
.nc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
tr:nth-child(even) .cell { background: #f9f9f9; }
.empty-cell { text-align: center; padding: 8px; color: #888; font-size: 9pt; }

/* ── Footer ── */
.pf {
  display: flex; align-items: flex-end; justify-content: center;
  font-size: 7.5pt; color: #555;
}
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('Παρακαλώ επιτρέψτε τα pop-ups για εκτύπωση.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}