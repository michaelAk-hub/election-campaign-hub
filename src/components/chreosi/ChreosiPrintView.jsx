const COLUMN_LABELS = {
  admission_year: 'Έτος Εισδοχής',
  department: 'Τμήμα',
  last_name: 'Επίθετο',
  first_name: 'Όνομα',
  mobile_phone: 'Κινητό',
  notes: 'Σημειώσεις',
};

// Fixed widths per column key (must total ~100%)
const COLUMN_WIDTHS = {
  admission_year: '10%',
  department: '15%',
  last_name: '15%',
  first_name: '13%',
  mobile_phone: '12%',
  notes: '35%',
};

function normalizeStr(s) {
  return (s || '').trim().replace(/\s+/g, ' ');
}

function filterPeople(account, people) {
  const normalizedUsername = normalizeStr(account.username);
  const allowedSymbols =
    Array.isArray(account.allowed_prediction_symbols) && account.allowed_prediction_symbols.length > 0
      ? account.allowed_prediction_symbols
      : null;

  return people.filter((p) => {
    try {
      // 1. Assignment: must be contact_person_1 or contact_person_2
      const cp1 = normalizeStr(p.contact_person_1);
      const cp2 = normalizeStr(p.contact_person_2);
      if (cp1 !== normalizedUsername && cp2 !== normalizedUsername) return false;

      // 2. Not yet voted
      if (p.voted !== false) return false;

      // 3. Allowed prediction symbols (skip check if no restrictions)
      if (allowedSymbols && !allowedSymbols.includes(p.prediction_symbol)) return false;

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
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = String(aRaw).localeCompare(String(bRaw), 'el');
        }
      } else {
        cmp = String(aRaw).localeCompare(String(bRaw), 'el');
      }

      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

export function printChreosiStatement({ account, people, orderedColumns, orderedSortFields, orientation }) {
  const filtered = filterPeople(account, people);
  const sorted = sortPeople(filtered, orderedSortFields);
  const colCount = orderedColumns.length;
  const pageSize = orientation === 'portrait' ? 'A4 portrait' : 'A4 landscape';
  const displayName = account.display_name || account.username || '';

  const headers = orderedColumns
    .map((col) => `<th style="width:${COLUMN_WIDTHS[col] || 'auto'}">${COLUMN_LABELS[col] || col}</th>`)
    .join('');

  const rows = sorted.length
    ? sorted
        .map(
          (p) =>
            `<tr>${orderedColumns
              .map((col) => {
                const val = p[col];
                const display =
                  val === null || val === undefined || val === '' ? '-' : String(val);
                return `<td class="cell${col === 'notes' ? ' notes-cell' : ''}">${display}</td>`;
              })
              .join('')}</tr>`
        )
        .join('')
    : `<tr><td colspan="${colCount}" class="empty-row">Δεν βρέθηκαν εγγραφές</td></tr>`;

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <title>Χρεωστικός: ${account.username}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 12mm 12mm 16mm 12mm;
      @bottom-center {
        content: "Σελίδα " counter(page) " / " counter(pages);
        font-size: 8pt;
        font-family: Arial, sans-serif;
        color: #555;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    thead { display: table-header-group; }

    .account-header-cell {
      padding: 4px 0 6px 0;
      border-bottom: 2px solid #333;
    }
    .acc-display-name {
      font-size: 13pt;
      font-weight: bold;
      line-height: 1.3;
    }
    .acc-username {
      font-size: 8pt;
      color: #555;
      margin-top: 1px;
    }

    th {
      background: #efefef;
      border-top: 1px solid #999;
      border-bottom: 1px solid #999;
      padding: 3px 4px;
      text-align: left;
      font-size: 7.5pt;
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
    }
    .cell {
      border-bottom: 1px solid #e0e0e0;
      padding: 2px 4px;
      font-size: 7.5pt;
      height: 7mm;
      vertical-align: middle;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .notes-cell {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    tr:nth-child(even) .cell { background: #f9f9f9; }

    .empty-row {
      text-align: center;
      padding: 12px;
      color: #888;
      font-size: 9pt;
    }

    .page-break-after {
      page-break-after: always;
      break-after: page;
    }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>
        <td colspan="${colCount}" class="account-header-cell">
          <div class="acc-display-name">${displayName}</div>
          <div class="acc-username">Username: ${account.username}</div>
        </td>
      </tr>
      <tr>${headers}</tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="page-break-after"></div>
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
  setTimeout(() => { win.print(); }, 500);
}