const COLUMN_LABELS = {
  admission_year: 'Έτος Εισδοχής',
  department: 'Τμήμα',
  last_name: 'Επίθετο',
  first_name: 'Όνομα',
  mobile_phone: 'Κινητό',
  notes: 'Σημειώσεις',
};

const COLUMN_WIDTHS = {
  admission_year: '10%',
  department: '8%',
  mobile_phone: '10%',
  last_name: '20%',
  first_name: '20%',
};

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeUsername(str) {
  if (!str) return '';
  return str.trim().replace(/\s+/g, ' ').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

// Filter people for a given account using BOTH symbols AND voted statuses.
// Empty symbols = no rows. Empty voted statuses = no rows.
function filterPeople(account, people) {
  const normalizedUsername = normalizeUsername(account.username);
  const allowedSymbols = Array.isArray(account.allowed_prediction_symbols) && account.allowed_prediction_symbols.length > 0
    ? account.allowed_prediction_symbols : null;
  const allowedVotedStatuses = Array.isArray(account.allowed_voted_statuses) && account.allowed_voted_statuses.length > 0
    ? account.allowed_voted_statuses : null;

  // Empty = no rows (consistent with portal and admin)
  if (!allowedSymbols || !allowedVotedStatuses) return [];

  return people.filter((p) => {
    try {
      const cp1 = normalizeUsername(p.contact_person_1);
      const cp2 = normalizeUsername(p.contact_person_2);
      if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) return false;
      if (!allowedSymbols.includes(p.prediction_symbol)) return false;
      const votedStr = p.voted === true ? 'true' : 'false';
      if (!allowedVotedStatuses.includes(votedStr)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

function sortPeople(people, orderedSortFields) {
  return [...people].sort((a, b) => {
    for (const field of orderedSortFields) {
      const aRaw = a[field] ?? '';
      const bRaw = b[field] ?? '';
      let cmp = 0;
      if (field === 'admission_year') {
        const aNum = parseInt(aRaw, 10);
        const bNum = parseInt(bRaw, 10);
        cmp = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : String(aRaw).localeCompare(String(bRaw), 'el');
      } else {
        cmp = String(aRaw).localeCompare(String(bRaw), 'el');
      }
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

function buildTableHtml(rows, orderedColumns, colgroup, safeRPP, ROW_H, colCount) {
  if (rows.length === 0) return `<tr><td colspan="${colCount}" class="empty-cell">Δεν βρέθηκαν εγγραφές</td></tr>`;
  return rows.map(p => {
    const cells = orderedColumns.map(col => {
      const val = p[col];
      const display = (val === null || val === undefined || val === '') ? '-' : escHtml(String(val));
      return `<td class="cell${col === 'notes' ? ' nc' : ''}">${display}</td>`;
    }).join('');
    return `<tr style="height:${ROW_H}mm">${cells}</tr>`;
  }).join('');
}

export function printChreosiStatements({ accounts, people, orderedColumns, orderedSortFields, orientation, rowsPerPage }) {
  const isPortrait = orientation === 'portrait';
  const PAGE_W = isPortrait ? 210 : 297;
  const PAGE_H = isPortrait ? 297 : 210;
  const PAD = 12;
  const USABLE_H = PAGE_H - PAD * 2;
  const HEADER_H = 20;
  const FOOTER_H = 7;
  const BODY_H = USABLE_H - HEADER_H - FOOTER_H;
  const safeRPP = Math.max(1, Math.round(Number(rowsPerPage) || 25));
  const ROW_H = (BODY_H / safeRPP).toFixed(3);

  const colCount = orderedColumns.length;

  // Filter active accounts, get their rows split by voted status
  const accountBlocks = accounts
    .filter(account => account.is_active === true)
    .map(account => {
      const allFiltered = filterPeople(account, people);
      if (allFiltered.length === 0) return null;

      const allowedVotedStatuses = account.allowed_voted_statuses || [];
      const showBothSections = allowedVotedStatuses.includes('false') && allowedVotedStatuses.includes('true');

      let sections;
      if (showBothSections) {
        // Section 1: not voted, Section 2: voted
        const notVoted = sortPeople(allFiltered.filter(p => !p.voted), orderedSortFields);
        const voted = sortPeople(allFiltered.filter(p => p.voted), orderedSortFields);
        sections = [
          { rows: notVoted, label: 'Δεν Ψήφισαν' },
          { rows: voted, label: 'Ψήφισαν' },
        ].filter(s => s.rows.length > 0);
      } else {
        sections = [{ rows: sortPeople(allFiltered, orderedSortFields), label: null }];
      }

      return { account, sections };
    })
    .filter(Boolean);

  if (accountBlocks.length === 0) return false;

  const colgroup = orderedColumns.map(col => {
    const w = COLUMN_WIDTHS[col];
    return w ? `<col style="width:${w}">` : `<col>`;
  }).join('');
  const theadRow = orderedColumns.map(col => `<th>${escHtml(COLUMN_LABELS[col] || col)}</th>`).join('');

  // Build all pages
  const allPagesHtml = accountBlocks.map(({ account, sections }, accountIdx) => {
    const isLastAccount = accountIdx === accountBlocks.length - 1;
    const displayName = escHtml(account.display_name || account.username || '');
    const usernameEsc = escHtml(account.username || '');

    // Flatten all rows across sections, with optional separator rows
    const flatRows = [];
    sections.forEach((section, sIdx) => {
      if (section.label && sections.length > 1) {
        flatRows.push({ _separator: true, label: section.label });
      }
      section.rows.forEach(r => flatRows.push(r));
    });

    // Chunk into pages (separators count as rows for paging purposes)
    const chunks = [];
    for (let i = 0; i < flatRows.length; i += safeRPP) {
      chunks.push(flatRows.slice(i, i + safeRPP));
    }
    const totalPages = chunks.length;

    return chunks.map((chunk, pageIdx) => {
      const isAbsoluteLast = isLastAccount && pageIdx === chunks.length - 1;

      const dataRows = chunk.length > 0
        ? chunk.map(item => {
            if (item._separator) {
              return `<tr class="separator-row"><td colspan="${colCount}" class="section-label">${escHtml(item.label)}</td></tr>`;
            }
            const cells = orderedColumns.map(col => {
              const val = item[col];
              const display = (val === null || val === undefined || val === '') ? '-' : escHtml(String(val));
              return `<td class="cell${col === 'notes' ? ' nc' : ''}">${display}</td>`;
            }).join('');
            return `<tr style="height:${ROW_H}mm">${cells}</tr>`;
          }).join('')
        : `<tr><td colspan="${colCount}" class="empty-cell">Δεν βρέθηκαν εγγραφές</td></tr>`;

      return `<div class="page${isAbsoluteLast ? ' last' : ''}">
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
  <div class="pf" style="height:${FOOTER_H}mm">Σελίδα ${pageIdx + 1} / ${totalPages}</div>
</div>`;
    }).join('\n');
  }).join('\n');

  const title = accountBlocks.length === 1
    ? `Χρεωστικός: ${escHtml(accountBlocks[0].account.username || '')}`
    : `Χρεωστικοί: ${accountBlocks.length} λογαριασμοί`;

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
@page { size: ${PAGE_W}mm ${PAGE_H}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 7.5pt; color: #000; }
.page { width: ${PAGE_W}mm; height: ${PAGE_H}mm; padding: ${PAD}mm; page-break-after: always; break-after: page; overflow: hidden; }
.page.last { page-break-after: avoid; break-after: avoid; }
.ph { display: flex; flex-direction: column; overflow: hidden; }
.ph-top { flex: 1; overflow: hidden; }
.ph-bot { flex-shrink: 0; }
.adn { font-size: 13pt; font-weight: bold; line-height: 1.2; }
.aun { font-size: 8pt; color: #555; margin: 2px 0 3px; }
.ht, .dt { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ht th { background: #efefef; border-top: 1px solid #999; border-bottom: 1px solid #999; padding: 2px 4px; text-align: left; font-size: 7pt; font-weight: bold; white-space: nowrap; overflow: hidden; }
.pb { overflow: hidden; }
.cell { border-bottom: 1px solid #e0e0e0; padding: 0 4px; vertical-align: middle; font-size: 7.5pt; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
tr:nth-child(even) .cell { background: #f9f9f9; }
.empty-cell { text-align: center; padding: 8px; color: #888; font-size: 9pt; }
.section-label { background: #d0e4ff; font-weight: bold; font-size: 8pt; padding: 3px 6px; border-bottom: 1px solid #999; }
.separator-row { height: 10px; }
.pf { display: flex; align-items: flex-end; justify-content: center; font-size: 7.5pt; color: #555; }
</style>
</head>
<body>
${allPagesHtml}
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Παρακαλώ επιτρέψτε τα pop-ups για εκτύπωση.'); return true; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
  return true;
}

export function printChreosiStatement({ account, people, orderedColumns, orderedSortFields, orientation, rowsPerPage }) {
  return printChreosiStatements({ accounts: [account], people, orderedColumns, orderedSortFields, orientation, rowsPerPage });
}