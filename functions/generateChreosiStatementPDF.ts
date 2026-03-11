import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';

function normalizeUsername(str) {
    return str?.trim().replace(/\s+/g, ' ') || '';
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { accountId, selectedColumns } = await req.json();
        if (!accountId || !selectedColumns?.length) {
            return Response.json({ error: 'Missing accountId or selectedColumns' }, { status: 400 });
        }

        const chreosiAccount = await base44.entities.ChreosiAccount.get(accountId);
        if (!chreosiAccount) return Response.json({ error: 'Account not found' }, { status: 404 });

        const normalizedUsername = normalizeUsername(chreosiAccount.username);
        const allowedSymbols = chreosiAccount.allowed_prediction_symbols;

        // Fetch all persons
        let allPersons = [];
        let page = 0;
        while (true) {
            const batch = await base44.entities.Person.list(null, 1000, page * 1000);
            allPersons = allPersons.concat(batch);
            if (batch.length < 1000) break;
            page++;
        }

        // Filter by assignment and allowed symbols
        const assignedPeople = allPersons.filter(p => {
            const cp1 = normalizeUsername(p.contact_person_1);
            const cp2 = normalizeUsername(p.contact_person_2);
            const isAssigned = cp1 === normalizedUsername || cp2 === normalizedUsername;
            const hasSymbol = !allowedSymbols || allowedSymbols.length === 0 || allowedSymbols.includes(p.prediction_symbol);
            return isAssigned && hasSymbol;
        });

        // Sort: Department -> Admission Year -> Last Name -> First Name
        assignedPeople.sort((a, b) => {
            return (a.department || '').localeCompare(b.department || '') ||
                   (a.admission_year || '').localeCompare(b.admission_year || '') ||
                   (a.last_name || '').localeCompare(b.last_name || '') ||
                   (a.first_name || '').localeCompare(b.first_name || '');
        });

        const columnLabels = {
            department: 'Τμήμα',
            admission_year: 'Έτος Εισδοχής',
            last_name: 'Επίθετο',
            first_name: 'Όνομα',
            mobile_phone: 'Κινητό',
            notes: 'Σημειώσεις'
        };

        const doc = new jsPDF({ orientation: 'landscape' });
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 12;
        const colCount = selectedColumns.length;
        const colWidth = (pageWidth - 2 * margin) / colCount;
        const lineH = 7;

        const drawHeader = () => {
            let y = margin;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`Χρεωστικός: ${chreosiAccount.username}`, margin, y);
            y += lineH + 2;

            if (chreosiAccount.personal_note) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const noteLines = doc.splitTextToSize(`Σημειώσεις: ${chreosiAccount.personal_note}`, pageWidth - 2 * margin);
                doc.text(noteLines, margin, y);
                y += noteLines.length * lineH;
            }

            y += 4;

            // Column headers
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            selectedColumns.forEach((col, i) => {
                doc.text(columnLabels[col] || col, margin + i * colWidth, y);
            });
            y += 2;
            doc.setLineWidth(0.3);
            doc.line(margin, y, pageWidth - margin, y);
            y += lineH;
            doc.setFont('helvetica', 'normal');
            return y;
        };

        const drawFooter = (pageNum) => {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Σελίδα ${pageNum}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        };

        let y = drawHeader();
        let currentPage = 1;

        assignedPeople.forEach(person => {
            // Estimate row height (notes may wrap)
            const notesText = String(person.notes || '');
            const noteLines = selectedColumns.includes('notes')
                ? doc.splitTextToSize(notesText, colWidth - 2).length
                : 1;
            const rowH = Math.max(noteLines, 1) * lineH;

            if (y + rowH > pageHeight - margin - 10) {
                drawFooter(currentPage);
                doc.addPage();
                currentPage++;
                y = drawHeader();
            }

            doc.setFontSize(8);
            selectedColumns.forEach((col, i) => {
                const val = String(person[col] || '');
                const x = margin + i * colWidth;
                if (col === 'notes') {
                    const lines = doc.splitTextToSize(val, colWidth - 2);
                    doc.text(lines, x, y);
                } else {
                    doc.text(val, x, y);
                }
            });
            y += rowH + 1;
        });

        drawFooter(currentPage);

        // Update all page footers with total
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Σελίδα ${i} / ${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
        }

        const pdfBytes = doc.output('arraybuffer');
        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=chreosi_${chreosiAccount.username}.pdf`
            }
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});