export function printChreosiStatement({ account, people, selectedColumns }) {
  const normalizeUsername = (str) => str?.trim().replace(/\s+/g, ' ') || '';
  const normalizedUsername = normalizeUsername(account.username);
  const allowedSymbols = account.allowed_prediction_symbols;

  const columnLabels = {
    department: 'Τμήμα',
    admission_year: 'Έτος Εισδοχής',
    last_name: 'Επίθετο',
    first_name: 'Όνομα',
    mobile_phone: 'Κινητό',
    notes: 'Σημειώσεις',
  };

  // Fixed widths for non-notes columns (mm approximations as %)
  const columnWidths = {
    department: '14%',
    admission_year: '10%',
    last_name: '14%',
    first_name: '12%',
    mobile_phone: '12%',
    notes: 'auto',
  };

  // Filter people
  const assignedPeople = people.filter(p => {
    const cp1 = normalizeUsername(p.contact_person_1);
    const cp2 = normalizeUsername(p.contact_person_2);
    const isAssigned = cp1 === normalizedUsername || cp2 === normalizedUsername;
    const hasSymbol = !allowedSymbols || allowedSymbols.length === 0 || allowedSymbols.includes(p.prediction_symbol);
    return isAssigned && hasSymbol && p.voted === false;
  });

  // Sort: Department -> Admission Year -> Last Name -> First Name
  assignedPeople.sort((a, b) =>
    (a.department || '').localeCompare(b.department || '', 'el') ||
    (a.admission_year || '').localeCompare(b.admission_year || '', 'el') ||
    (a.last_name || '').localeCompare(b.last_name || '', 'el') ||
    (a.first_name || '').localeCompare(b.first_name || '', 'el')
  );

  const rows = assignedPeople.map(p =>
    `<tr>${selectedColumns.map(col => `<td>${p[col] || ''}</td>`).join('')}</tr>`
  ).join('');

  const headers = selectedColumns.map(col =>
    `<th style="width:${columnWidths[col] || 'auto'}">${columnLabels[col] || col}</th>`
  ).join('');

  const personalNoteHtml = account.personal_note
    ? `<p class="personal-note"><strong>Προσωπικές Σημειώσεις:</strong> ${account.personal_note}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="el">
<head>
  <meta charset="UTF-8">
  <title>Χρεωστικός: ${account.username}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 15mm 12mm 20mm 12mm;
      @bottom-center {
        content: "Σελίδα " counter(page) " / " counter(pages);
        font-size: 9pt;
        font-family: Arial, sans-serif;
        color: #555;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 9pt;
      color: #000;
    }
    h1 {
      font-size: 14pt;
      margin-bottom: 4px;
    }
    .personal-note {
      font-size: 9pt;
      color: #444;
      margin-bottom: 10px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th {
      background: #f0f0f0;
      border-bottom: 2px solid #333;
      padding: 2px 3px;
      text-align: left;
      font-size: 7pt;
      font-weight: bold;
      line-height: 1.2;
    }
    td {
      border-bottom: 1px solid #ddd;
      padding: 1px 3px;
      vertical-align: middle;
      font-size: 7pt;
      word-wrap: break-word;
      line-height: 1.2;
      height: 8mm;
    }
    tr:nth-child(even) td { background: #fafafa; }
    .header { margin-bottom: 10px; }
    .page-break { page-break-before: always; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Χρεωστικός: ${account.username}</h1>
    ${personalNoteHtml}
  </div>
  <table>
    <thead>
      <tr>${headers}</tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}