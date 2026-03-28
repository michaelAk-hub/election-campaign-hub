import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const doc = new jsPDF();
        let y = 20;
        const pageHeight = 280;
        const margin = 20;
        const lineHeight = 7;

        const addText = (text, fontSize = 10, isBold = false, indent = 0) => {
            if (y > pageHeight) {
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(fontSize);
            doc.setFont(undefined, isBold ? 'bold' : 'normal');
            const lines = doc.splitTextToSize(text, 170 - indent);
            lines.forEach(line => {
                if (y > pageHeight) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(line, margin + indent, y);
                y += lineHeight;
            });
        };

        const addSection = (title) => {
            y += 5;
            addText(title, 14, true);
            y += 3;
        };

        const addSubSection = (title) => {
            y += 3;
            addText(title, 12, true);
            y += 2;
        };

        // Title
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('Τεκμηρίωση Συστήματος Εκλογών 2026', margin, y);
        y += 10;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text('Πλήρης οδηγός του συστήματος διαχείρισης εκλογών', margin, y);
        y += 15;

        // Overview
        addSection('1. ΕΠΙΣΚΟΠΗΣΗ ΣΥΣΤΗΜΑΤΟΣ');
        addSubSection('Σκοπός');
        addText('Το σύστημα διαχείρισης εκλογών είναι μια ολοκληρωμένη πλατφόρμα για την οργάνωση και παρακολούθηση εκλογικών διαδικασιών. Επιτρέπει στους διαχειριστές να διαχειρίζονται δεδομένα ψηφοφόρων, να παρακολουθούν την ψηφοφορία σε πραγματικό χρόνο, και να συντονίζουν ομάδες εργασίας.');
        
        addSubSection('Αρχιτεκτονική');
        addText('• Frontend: React με Base44 framework, Tailwind CSS για styling', 10, false, 5);
        addText('• Backend: Deno functions, Base44 SDK για database και auth', 10, false, 5);
        addText('• Δεδομένα: Base44 entities, real-time updates, optimistic locking', 10, false, 5);

        addSubSection('Βασικά Χαρακτηριστικά');
        addText('• Διαχείριση πολλαπλών επιπέδων χρηστών (Admin, Organotiki, Chreosi, Kanali)', 10, false, 5);
        addText('• Real-time παρακολούθηση ψηφοφορίας και live updates', 10, false, 5);
        addText('• Προηγμένο data grid με inline editing και conflict resolution', 10, false, 5);
        addText('• Σύστημα ειδοποιήσεων (push messages) για όλους τους χρήστες', 10, false, 5);
        addText('• Import/Export δεδομένων και σύγκριση datasets', 10, false, 5);

        // Roles
        addSection('2. ΡΟΛΟΙ ΧΡΗΣΤΩΝ');
        
        addSubSection('ADMIN - Διαχειριστής');
        addText('Ο διαχειριστής έχει πλήρη πρόσβαση σε όλες τις λειτουργίες του συστήματος.');
        addText('Δικαιώματα:', 10, true);
        addText('• Δημιουργία/διαχείριση χρηστών Organotiki', 10, false, 5);
        addText('• Διαχείριση datasets και εισαγωγή δεδομένων', 10, false, 5);
        addText('• Δημιουργία/διαχείριση λογαριασμών Chreosi και Kanali', 10, false, 5);
        addText('• Αποστολή push messages σε όλους', 10, false, 5);
        addText('• Πρόσβαση σε όλα τα analytics και reports', 10, false, 5);

        addSubSection('ORGANOTIKI - Οργανωτικός');
        addText('Οι οργανωτικοί βοηθούν στη διαχείριση δεδομένων αλλά δεν έχουν admin δικαιώματα.');
        addText('Δικαιώματα:', 10, true);
        addText('• Προβολή και επεξεργασία δεδομένων ψηφοφόρων', 10, false, 5);
        addText('• Χρήση data grid για bulk edits', 10, false, 5);
        addText('• Προβολή analytics και στατιστικών', 10, false, 5);
        addText('• ΔΕΝ μπορεί να δημιουργήσει χρήστες', 10, false, 5);

        addSubSection('CHREOSI - Χρεωστικός');
        addText('Υπεύθυνοι για συγκεκριμένες ομάδες ψηφοφόρων (contact_person_1 ή contact_person_2).');
        addText('Δικαιώματα:', 10, true);
        addText('• Προβολή μόνο των δικών τους ψηφοφόρων', 10, false, 5);
        addText('• Επισήμανση ψηφοφόρων (checkmarks)', 10, false, 5);
        addText('• Λήψη ειδοποιήσεων από admins', 10, false, 5);

        addSubSection('KANALI - Καταγραφέας Ψήφων');
        addText('Καταγράφουν ψήφους σε πραγματικό χρόνο. Υπάρχουν δύο τύποι (A και B).');
        addText('Δικαιώματα:', 10, true);
        addText('• Υποβολή IDs ψηφοφόρων', 10, false, 5);
        addText('• Αυτόματη επισήμανση voted=true', 10, false, 5);
        addText('• ΔΕΝ βλέπουν προσωπικά δεδομένα', 10, false, 5);

        // Pages
        addSection('3. ΣΕΛΙΔΕΣ ΣΥΣΤΗΜΑΤΟΣ');
        
        addSubSection('Admin/Organotiki Σελίδες');
        addText('• Dashboard: Κεντρική σελίδα με στατιστικά και live counters', 10, false, 5);
        addText('• Records: Διαχείριση datasets - δημιουργία, import, field mapping', 10, false, 5);
        addText('• DataGrid: Access-like grid με inline editing και conflict resolution', 10, false, 5);
        addText('• SavedQueries: Δημιουργία custom queries με φίλτρα', 10, false, 5);
        addText('• CompareMerge: Σύγκριση δύο datasets και merge', 10, false, 5);
        addText('• ChreosiAccounts: Διαχείριση λογαριασμών χρεωστικών', 10, false, 5);
        addText('• KanaliAccounts: Διαχείριση λογαριασμών καναλιού', 10, false, 5);
        addText('• NotFoundVoters: Προβολή IDs που δεν βρέθηκαν', 10, false, 5);
        addText('• PushMessages: Αποστολή μηνυμάτων σε portal users', 10, false, 5);
        addText('• UserManagement: Διαχείριση Admin/Organotiki χρηστών', 10, false, 5);

        // Entities
        addSection('4. ΟΝΤΟΤΗΤΕΣ ΔΕΔΟΜΕΝΩΝ');
        
        addSubSection('Person (Ψηφοφόροι)');
        addText('Η κύρια οντότητα για τα δεδομένα ψηφοφόρων.');
        addText('Πεδία: person_id, first_name, last_name, mobile_phone, department, admission_year, contact_person_1, contact_person_2, member, prediction_symbol, voted, notes, custom_data, row_version', 9, false, 5);

        addSubSection('Dataset (Σύνολα Δεδομένων)');
        addText('Οργάνωση δεδομένων σε datasets με import/mapping.');
        addText('Πεδία: name, status, source_file_url, field_mappings, custom_fields, total_records', 9, false, 5);

        addSubSection('AppUser (Χρήστες Συστήματος)');
        addText('Admin και Organotiki χρήστες.');
        addText('Πεδία: role, email, password_hash, name, surname, phone, is_active, session_version', 9, false, 5);

        addSubSection('ChreosiAccount & KanaliAccount');
        addText('Portal users για καταγραφή και παρακολούθηση.');
        addText('Πεδία: username, password_hash, is_active, (KanaliAccount: user_type A/B)', 9, false, 5);

        // Security
        addSection('5. ΑΣΦΑΛΕΙΑ ΣΥΣΤΗΜΑΤΟΣ');
        
        addSubSection('Authentication Flow');
        addText('1. Χρήστης εισάγει credentials (email/password)', 10, false, 5);
        addText('2. Backend function ελέγχει credentials με SHA-256 hash', 10, false, 5);
        addText('3. Δημιουργείται session token και αποθηκεύεται στο DB', 10, false, 5);
        addText('4. Token αποθηκεύεται στο localStorage', 10, false, 5);
        addText('5. Κάθε request στέλνει το token για validation', 10, false, 5);

        addSubSection('Password Management');
        addText('• Passwords αποθηκεύονται με SHA-256 hashing', 10, false, 5);
        addText('• Admin μπορεί να αλλάξει passwords άλλων χρηστών', 10, false, 5);
        addText('• Password changes δημιουργούν notification', 10, false, 5);
        addText('• Session_version increment για force logout', 10, false, 5);

        addSubSection('Role-Based Access Control');
        addText('• Backend functions ελέγχουν role πριν επιτρέψουν ενέργεια', 10, false, 5);
        addText('• Layout components κρύβουν UI elements βάσει role', 10, false, 5);
        addText('• Portal users δεν έχουν πρόσβαση σε admin routes', 10, false, 5);

        // Features
        addSection('6. ΚΥΡΙΕΣ ΛΕΙΤΟΥΡΓΙΕΣ');
        
        addSubSection('Data Grid με AG Grid');
        addText('• Inline editing με auto-save', 10, false, 5);
        addText('• Keyboard navigation (arrows, enter, tab, escape)', 10, false, 5);
        addText('• Column resizing, reordering, hiding', 10, false, 5);
        addText('• Filters και sorting ανά column', 10, false, 5);
        addText('• Optimistic locking για conflicts', 10, false, 5);
        addText('• Live updates κάθε 8 seconds', 10, false, 5);

        addSubSection('Dataset Management');
        addText('• Upload Excel/CSV files', 10, false, 5);
        addText('• AI-powered field mapping', 10, false, 5);
        addText('• Preview δεδομένων πριν import', 10, false, 5);
        addText('• Dataset compare and merge', 10, false, 5);

        addSubSection('Real-Time Voting Tracking');
        addText('• Kanali submit IDs για instant marking', 10, false, 5);
        addText('• Auto-validation (already voted, not found)', 10, false, 5);
        addText('• Live counters στο dashboard', 10, false, 5);

        // Workflow
        addSection('7. ΡΟΗ ΕΡΓΑΣΙΑΣ');
        
        addSubSection('1. Προετοιμασία (Admin)');
        addText('1. Δημιουργία Organotiki users αν χρειάζεται', 10, false, 5);
        addText('2. Upload dataset με δεδομένα ψηφοφόρων', 10, false, 5);
        addText('3. Field mapping για σωστή αντιστοίχηση πεδίων', 10, false, 5);
        addText('4. Ενεργοποίηση dataset', 10, false, 5);
        addText('5. Δημιουργία Chreosi και Kanali accounts', 10, false, 5);

        addSubSection('2. Προ-Εκλογική Περίοδος');
        addText('1. Organotiki επεξεργάζονται/διορθώνουν δεδομένα', 10, false, 5);
        addText('2. Δημιουργία saved queries για συγκεκριμένα segments', 10, false, 5);
        addText('3. Chreosi login και προβολή των δικών τους ψηφοφόρων', 10, false, 5);
        addText('4. Admin στέλνει push messages για οδηγίες', 10, false, 5);

        addSubSection('3. Ημέρα Εκλογών');
        addText('1. Kanali users login και ξεκινούν καταγραφή', 10, false, 5);
        addText('2. Υποβολή person_id κάθε φορά που ψηφίζει κάποιος', 10, false, 5);
        addText('3. Σύστημα auto-validates και marks voted=true', 10, false, 5);
        addText('4. Chreosi παρακολουθούν με checkmarks', 10, false, 5);
        addText('5. Admin/Organotiki βλέπουν live stats στο dashboard', 10, false, 5);

        addSubSection('4. Μετά τις Εκλογές');
        addText('1. Export τελικών δεδομένων από Data Grid', 10, false, 5);
        addText('2. Έλεγχος not found voters για διορθώσεις', 10, false, 5);
        addText('3. Στατιστική ανάλυση με saved queries', 10, false, 5);
        addText('4. Σύγκριση με προηγούμενα datasets', 10, false, 5);

        const pdfBase64 = doc.output('datauristring').split(',')[1];
        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="Documentation_2026.pdf"'
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});