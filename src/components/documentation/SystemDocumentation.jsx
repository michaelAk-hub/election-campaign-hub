import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
    Users, Database, Lock, Layout, FileText, GitBranch, 
    Server, Settings, CheckCircle, Shield, Bell, Search,
    ChevronRight, Vote, UserCog, MessageSquare
} from 'lucide-react';

export default function SystemDocumentation() {
    const [activeTab, setActiveTab] = useState('overview');

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                    Τεκμηρίωση Συστήματος Εκλογών 2026
                </h1>
                <p className="text-slate-600 dark:text-slate-300">
                    Πλήρης οδηγός του συστήματος διαχείρισης εκλογών
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-7 mb-6">
                    <TabsTrigger value="overview">Επισκόπηση</TabsTrigger>
                    <TabsTrigger value="roles">Ρόλοι</TabsTrigger>
                    <TabsTrigger value="pages">Σελίδες</TabsTrigger>
                    <TabsTrigger value="entities">Οντότητες</TabsTrigger>
                    <TabsTrigger value="auth">Ασφάλεια</TabsTrigger>
                    <TabsTrigger value="features">Λειτουργίες</TabsTrigger>
                    <TabsTrigger value="workflow">Ροή Εργασίας</TabsTrigger>
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Layout className="h-5 w-5" />
                                Επισκόπηση Συστήματος
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h3 className="font-semibold mb-3">Σκοπός</h3>
                                <p className="text-slate-600 dark:text-slate-300">
                                    Το σύστημα διαχείρισης εκλογών είναι μια ολοκληρωμένη πλατφόρμα για την οργάνωση 
                                    και παρακολούθηση εκλογικών διαδικασιών. Επιτρέπει στους διαχειριστές να διαχειρίζονται 
                                    δεδομένα ψηφοφόρων, να παρακολουθούν την ψηφοφορία σε πραγματικό χρόνο, και να συντονίζουν 
                                    ομάδες εργασίας.
                                </p>
                            </div>

                            <div>
                                <h3 className="font-semibold mb-3">Αρχιτεκτονική</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 border rounded-lg">
                                        <Layout className="h-8 w-8 text-blue-600 mb-2" />
                                        <h4 className="font-medium mb-1">Frontend</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">
                                            React με Base44 framework, Tailwind CSS για styling
                                        </p>
                                    </div>
                                    <div className="p-4 border rounded-lg">
                                        <Server className="h-8 w-8 text-green-600 mb-2" />
                                        <h4 className="font-medium mb-1">Backend</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">
                                            Deno functions, Base44 SDK για database και auth
                                        </p>
                                    </div>
                                    <div className="p-4 border rounded-lg">
                                        <Database className="h-8 w-8 text-purple-600 mb-2" />
                                        <h4 className="font-medium mb-1">Δεδομένα</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300">
                                            Base44 entities, real-time updates, optimistic locking
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-semibold mb-3">Βασικά Χαρακτηριστικά</h3>
                                <ul className="space-y-2 text-slate-600 dark:text-slate-300">
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>Διαχείριση πολλαπλών επιπέδων χρηστών (Admin, Organotiki, Chreosi, Kanali)</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>Real-time παρακολούθηση ψηφοφορίας και live updates</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>Προηγμένο data grid με inline editing και conflict resolution</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>Σύστημα ειδοποιήσεων (push messages) για όλους τους χρήστες</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                        <span>Import/Export δεδομένων και σύγκριση datasets</span>
                                    </li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ROLES */}
                <TabsContent value="roles">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-purple-600" />
                                    ADMIN - Διαχειριστής
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Badge className="mb-3 bg-purple-100 text-purple-800">Πλήρη Δικαιώματα</Badge>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">
                                    Ο διαχειριστής έχει πλήρη πρόσβαση σε όλες τις λειτουργίες του συστήματος.
                                </p>
                                <h4 className="font-medium mb-2">Δικαιώματα:</h4>
                                <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                    <li>• Δημιουργία/διαχείριση χρηστών Organotiki</li>
                                    <li>• Διαχείριση datasets και εισαγωγή δεδομένων</li>
                                    <li>• Δημιουργία/διαχείριση λογαριασμών Chreosi και Kanali</li>
                                    <li>• Αποστολή push messages σε όλους</li>
                                    <li>• Πρόσβαση σε όλα τα analytics και reports</li>
                                    <li>• Αλλαγή κωδικών άλλων χρηστών</li>
                                    <li>• Ενεργοποίηση/απενεργοποίηση χρηστών</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <UserCog className="h-5 w-5 text-blue-600" />
                                    ORGANOTIKI - Οργανωτικός
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Badge className="mb-3 bg-blue-100 text-blue-800">Περιορισμένα Δικαιώματα</Badge>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">
                                    Οι οργανωτικοί βοηθούν στη διαχείριση δεδομένων αλλά δεν έχουν admin δικαιώματα.
                                </p>
                                <h4 className="font-medium mb-2">Δικαιώματα:</h4>
                                <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                    <li>• Προβολή και επεξεργασία δεδομένων ψηφοφόρων</li>
                                    <li>• Χρήση data grid για bulk edits</li>
                                    <li>• Προβολή analytics και στατιστικών</li>
                                    <li>• Ενεργοποίηση/απενεργοποίηση άλλων Organotiki</li>
                                    <li>• ΔΕΝ μπορεί να δημιουργήσει χρήστες</li>
                                    <li>• ΔΕΝ μπορεί να διαγράψει datasets</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="h-5 w-5 text-green-600" />
                                    CHREOSI - Χρεωστικός
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Badge className="mb-3 bg-green-100 text-green-800">Πύλη Χρήστη</Badge>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">
                                    Υπεύθυνοι για συγκεκριμένες ομάδες ψηφοφόρων (contact_person_1 ή contact_person_2).
                                </p>
                                <h4 className="font-medium mb-2">Δικαιώματα:</h4>
                                <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                    <li>• Προβολή μόνο των δικών τους ψηφοφόρων</li>
                                    <li>• Επισήμανση ψηφοφόρων (checkmarks)</li>
                                    <li>• Λήψη ειδοποιήσεων από admins</li>
                                    <li>• Ξεχωριστό portal login</li>
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Vote className="h-5 w-5 text-orange-600" />
                                    KANALI - Καταγραφέας Ψήφων
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Badge className="mb-3 bg-orange-100 text-orange-800">Πύλη Χρήστη</Badge>
                                <p className="text-slate-600 dark:text-slate-300 mb-4">
                                    Καταγράφουν ψήφους σε πραγματικό χρόνο. Υπάρχουν δύο τύποι (A και B).
                                </p>
                                <h4 className="font-medium mb-2">Δικαιώματα:</h4>
                                <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                    <li>• Υποβολή IDs ψηφοφόρων</li>
                                    <li>• Αυτόματη επισήμανση voted=true</li>
                                    <li>• Προβολή αποτελεσμάτων υποβολών</li>
                                    <li>• Λήψη ειδοποιήσεων</li>
                                    <li>• ΔΕΝ βλέπουν προσωπικά δεδομένα</li>
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* PAGES */}
                <TabsContent value="pages">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Admin/Organotiki Σελίδες</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="p-3 border-l-4 border-blue-500 bg-blue-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Layout className="h-4 w-4" />
                                            Dashboard (Πίνακας Ελέγχου)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Κεντρική σελίδα με στατιστικά, live counters ψηφοφορίας, πρόσφατες ενέργειες.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-green-500 bg-green-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Database className="h-4 w-4" />
                                            Records (Εγγραφές)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Διαχείριση datasets - δημιουργία, import από Excel/CSV, field mapping, ενεργοποίηση.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-purple-500 bg-purple-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Database className="h-4 w-4" />
                                            DataGrid (Πλέγμα Δεδομένων)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Access-like grid με inline editing, keyboard navigation, auto-save, conflict resolution, 
                                            column customization, filters, export.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-yellow-500 bg-yellow-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Search className="h-4 w-4" />
                                            SavedQueries (Αποθηκευμένα Ερωτήματα)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Δημιουργία custom queries με φίλτρα, λογικούς operators, αποθήκευση για επαναχρησιμοποίηση.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-red-500 bg-red-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <GitBranch className="h-4 w-4" />
                                            CompareMerge (Σύγκριση & Συγχώνευση)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Σύγκριση δύο datasets, προβολή διαφορών, επιλογή merge strategy.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-indigo-500 bg-indigo-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Users className="h-4 w-4" />
                                            ChreosiAccounts (Λογαριασμοί Χρεωστικών)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Δημιουργία/διαχείριση λογαριασμών chreosi, αλλαγή κωδικών, ενεργοποίηση/απενεργοποίηση.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-orange-500 bg-orange-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Vote className="h-4 w-4" />
                                            KanaliAccounts (Λογαριασμοί Καναλιού)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Δημιουργία λογαριασμών kanali (τύπος A/B), διαχείριση, στατιστικά υποβολών.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-pink-500 bg-pink-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <FileText className="h-4 w-4" />
                                            NotFoundVoters (Αποτυχημένες Ψήφοι)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Προβολή IDs που δεν βρέθηκαν ή είχαν ήδη ψηφίσει, για έλεγχο και διόρθωση.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-teal-500 bg-teal-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <MessageSquare className="h-4 w-4" />
                                            PushMessages (Μηνύματα)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Αποστολή push messages σε chreosi/kanali/both, παρακολούθηση acknowledgments.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-gray-500 bg-gray-50 dark:bg-slate-800">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <UserCog className="h-4 w-4" />
                                            UserManagement (Χρήστες Organotiki)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Διαχείριση ADMIN και ORGANOTIKI users - δημιουργία, διαγραφή, ενεργοποίηση.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-cyan-500 bg-cyan-50">
                                        <h4 className="font-medium flex items-center gap-2">
                                            <Bell className="h-4 w-4" />
                                            NotificationPreferences (Προτιμήσεις Ειδοποιήσεων)
                                        </h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Ρυθμίσεις για τύπους ειδοποιήσεων που θέλει να λαμβάνει ο χρήστης.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Portal Σελίδες (Chreosi/Kanali)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="p-3 border-l-4 border-green-500 bg-green-50">
                                        <h4 className="font-medium">Portal (Κεντρική Πύλη)</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Διαχωρισμένη σελίδα για Chreosi και Kanali με τις αντίστοιχες λειτουργίες τους.
                                        </p>
                                    </div>

                                    <div className="p-3 border-l-4 border-blue-500 bg-blue-50">
                                        <h4 className="font-medium">PortalLogin (Σύνδεση Πύλης)</h4>
                                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                            Ξεχωριστή σελίδα login για portal users (chreosi/kanali).
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Authentication Σελίδες</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="p-3 border-l-4 border-purple-500 bg-purple-50">
                                    <h4 className="font-medium">AdminLogin (Σύνδεση Admin/Organotiki)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                        Login για διαχειριστές και οργανωτικούς με email/password.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ENTITIES */}
                <TabsContent value="entities">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Database className="h-5 w-5" />
                                    Βασικές Οντότητες
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-3 bg-blue-50 rounded-lg">
                                    <h4 className="font-medium mb-2">Person (Ψηφοφόροι)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Η κύρια οντότητα για τα δεδομένα ψηφοφόρων.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• person_id, first_name, last_name, mobile_phone</div>
                                        <div>• department, admission_year, academic_level, ucid</div>
                                        <div>• contact_person_1, contact_person_2 (για chreosi)</div>
                                        <div>• member, prediction_symbol, voted (boolean)</div>
                                        <div>• notes, custom_data, dataset_id, row_version</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-green-50 rounded-lg">
                                    <h4 className="font-medium mb-2">Dataset (Σύνολα Δεδομένων)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Οργάνωση δεδομένων σε datasets με import/mapping.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• name, status (pending/mapping/active/archived)</div>
                                        <div>• source_file_url, field_mappings, custom_fields</div>
                                        <div>• total_records, activated_at</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-purple-50 rounded-lg">
                                    <h4 className="font-medium mb-2">AppUser (Χρήστες Συστήματος)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Admin και Organotiki χρήστες.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• role (ADMIN/ORGANOTIKI), email, password_hash</div>
                                        <div>• name, surname, phone, is_active</div>
                                        <div>• session_version (για force logout)</div>
                                        <div>• password_changed_at, created_by_admin_id</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-orange-50 rounded-lg">
                                    <h4 className="font-medium mb-2">ChreosiAccount & KanaliAccount</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Portal users για καταγραφή και παρακολούθηση.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• username, password_hash, is_active</div>
                                        <div>• KanaliAccount: user_type (A/B)</div>
                                        <div>• ChreosiAccount: display_name, phone</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-yellow-50 rounded-lg">
                                    <h4 className="font-medium mb-2">SavedQuery (Ερωτήματα)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Αποθηκευμένα custom queries.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• name, description, filters, columns</div>
                                        <div>• sort_field, sort_direction</div>
                                        <div>• logicalExpression (advanced filtering)</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-pink-50 rounded-lg">
                                    <h4 className="font-medium mb-2">GridPreference (Layout Grid)</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Αποθήκευση layout preferences για κάθε χρήστη.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• user_email, grid_key, state_json</div>
                                        <div>• state_json: column order, widths, hidden, filters, sorts</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-red-50 rounded-lg">
                                    <h4 className="font-medium mb-2">Submission & Tracking Entities</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Καταγραφή ενεργειών και ψήφων.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• KanaliSubmission: καταγραφή υποβολών από kanali</div>
                                        <div>• ChreosiCheckmark: checkmarks από chreosi</div>
                                        <div>• NotFoundVoter: IDs που δεν βρέθηκαν</div>
                                        <div>• UserActivationLog: audit log ενεργοποιήσεων</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-teal-50 rounded-lg">
                                    <h4 className="font-medium mb-2">Notification System</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Σύστημα ειδοποιήσεων και messages.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• Notification: ειδοποιήσεις για χρήστες</div>
                                        <div>• PushMessage: μηνύματα προς portal users</div>
                                        <div>• PushMessageAck: acknowledgments μηνυμάτων</div>
                                        <div>• NotificationPreference: ρυθμίσεις ειδοποιήσεων</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-cyan-50 rounded-lg">
                                    <h4 className="font-medium mb-2">Session Management</h4>
                                    <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                                        Διαχείριση sessions για όλους τους τύπους χρηστών.
                                    </p>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                                        <div>• AppSession: για Admin/Organotiki</div>
                                        <div>• PortalSession: για Chreosi/Kanali</div>
                                        <div>• session_token, expires_at, is_active</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* AUTH */}
                <TabsContent value="auth">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Lock className="h-5 w-5" />
                                    Σύστημα Ασφάλειας
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <h4 className="font-medium mb-2">Authentication Flow</h4>
                                    <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                        <li>Χρήστης εισάγει credentials (email/password ή username/password)</li>
                                        <li>Backend function ελέγχει credentials με SHA-256 hash</li>
                                        <li>Δημιουργείται session token και αποθηκεύεται στο DB</li>
                                        <li>Token αποθηκεύεται στο localStorage</li>
                                        <li>Κάθε request στέλνει το token για validation</li>
                                        <li>Session έχει expiration date</li>
                                    </ol>
                                </div>

                                <div>
                                    <h4 className="font-medium mb-2">Password Management</h4>
                                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Passwords αποθηκεύονται με SHA-256 hashing</li>
                                        <li>• Admin μπορεί να αλλάξει passwords άλλων χρηστών</li>
                                        <li>• Password changes δημιουργούν notification</li>
                                        <li>• Session_version increment για force logout</li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="font-medium mb-2">Role-Based Access Control (RBAC)</h4>
                                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Backend functions ελέγχουν role πριν επιτρέψουν ενέργεια</li>
                                        <li>• Layout components κρύβουν UI elements βάσει role</li>
                                        <li>• Portal users δεν έχουν πρόσβαση σε admin routes</li>
                                        <li>• Organotiki δεν μπορούν να διαγράψουν datasets</li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="font-medium mb-2">Session Management</h4>
                                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Validation σε κάθε page load</li>
                                        <li>• Auto-logout όταν session λήξει</li>
                                        <li>• Force logout με session_version increment</li>
                                        <li>• Ξεχωριστά sessions για admin/portal users</li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="font-medium mb-2">Data Security</h4>
                                    <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Optimistic locking με row_version για conflicts</li>
                                        <li>• Audit logs για critical actions</li>
                                        <li>• Chreosi βλέπουν μόνο δικά τους data (contact_person filter)</li>
                                        <li>• Kanali δεν βλέπουν προσωπικά δεδομένα</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* FEATURES */}
                <TabsContent value="features">
                    <div className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Κύριες Λειτουργίες</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <Database className="h-5 w-5 text-blue-600" />
                                        Data Grid με AG Grid
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Inline editing με auto-save</li>
                                        <li>• Keyboard navigation (arrows, enter, tab, escape)</li>
                                        <li>• Column resizing, reordering, hiding</li>
                                        <li>• Filters και sorting ανά column</li>
                                        <li>• User preferences που αποθηκεύονται</li>
                                        <li>• Optimistic locking για conflicts</li>
                                        <li>• Conflict resolution dialog</li>
                                        <li>• Live updates κάθε 8 seconds</li>
                                        <li>• Export σε CSV</li>
                                        <li>• Cell status indicators (saving, error, conflict)</li>
                                    </ul>
                                </div>

                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <FileText className="h-5 w-5 text-green-600" />
                                        Dataset Management
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Upload Excel/CSV files</li>
                                        <li>• AI-powered field mapping</li>
                                        <li>• Preview δεδομένων πριν import</li>
                                        <li>• Custom fields support</li>
                                        <li>• Dataset compare and merge</li>
                                        <li>• Bulk operations</li>
                                    </ul>
                                </div>

                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <Search className="h-5 w-5 text-purple-600" />
                                        Advanced Query Builder
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Visual query builder με πολλαπλά φίλτρα</li>
                                        <li>• Λογικοί operators (AND, OR, NOT)</li>
                                        <li>• Custom logical expressions</li>
                                        <li>• Save και reuse queries</li>
                                        <li>• Column selection</li>
                                        <li>• Export results</li>
                                    </ul>
                                </div>

                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <Vote className="h-5 w-5 text-orange-600" />
                                        Real-Time Voting Tracking
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Kanali submit IDs για instant marking</li>
                                        <li>• Auto-validation (already voted, not found)</li>
                                        <li>• Live counters στο dashboard</li>
                                        <li>• Submission history</li>
                                        <li>• Not found voters tracking</li>
                                    </ul>
                                </div>

                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <Bell className="h-5 w-5 text-red-600" />
                                        Notification System
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Push messages σε chreosi/kanali</li>
                                        <li>• Real-time notifications με badge counter</li>
                                        <li>• Acknowledgment tracking</li>
                                        <li>• Notification preferences per user</li>
                                        <li>• System notifications για admins</li>
                                    </ul>
                                </div>

                                <div className="p-4 border rounded-lg">
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                        <Users className="h-5 w-5 text-teal-600" />
                                        User Management
                                    </h4>
                                    <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                        <li>• Δημιουργία χρηστών με roles</li>
                                        <li>• Activate/deactivate users</li>
                                        <li>• Password management</li>
                                        <li>• Audit logs</li>
                                        <li>• Force logout με session invalidation</li>
                                    </ul>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* WORKFLOW */}
                <TabsContent value="workflow">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <GitBranch className="h-5 w-5" />
                                Τυπική Ροή Εργασίας
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <h4 className="font-medium mb-3">1. Προετοιμασία (Admin)</h4>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300 ml-4">
                                    <li>Δημιουργία Organotiki users αν χρειάζεται</li>
                                    <li>Upload dataset με δεδομένα ψηφοφόρων (Excel/CSV)</li>
                                    <li>Field mapping για σωστή αντιστοίχηση πεδίων</li>
                                    <li>Ενεργοποίηση dataset</li>
                                    <li>Δημιουργία Chreosi accounts (βάσει contact_person_1/2)</li>
                                    <li>Δημιουργία Kanali accounts (τύπος A/B)</li>
                                </ol>
                            </div>

                            <div>
                                <h4 className="font-medium mb-3">2. Προ-Εκλογική Περίοδος</h4>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300 ml-4">
                                    <li>Organotiki επεξεργάζονται/διορθώνουν δεδομένα μέσω Data Grid</li>
                                    <li>Δημιουργία saved queries για συγκεκριμένα segments</li>
                                    <li>Chreosi login και προβολή των δικών τους ψηφοφόρων</li>
                                    <li>Admin στέλνει push messages για οδηγίες</li>
                                    <li>Τελικός έλεγχος δεδομένων</li>
                                </ol>
                            </div>

                            <div>
                                <h4 className="font-medium mb-3">3. Ημέρα Εκλογών</h4>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300 ml-4">
                                    <li>Kanali users login και ξεκινούν καταγραφή</li>
                                    <li>Υποβολή person_id κάθε φορά που ψηφίζει κάποιος</li>
                                    <li>Σύστημα auto-validates και marks voted=true</li>
                                    <li>Chreosi παρακολουθούν τους δικούς τους με checkmarks</li>
                                    <li>Admin/Organotiki βλέπουν live stats στο dashboard</li>
                                    <li>Not found voters καταγράφονται για έλεγχο</li>
                                    <li>Push messages για updates/οδηγίες</li>
                                </ol>
                            </div>

                            <div>
                                <h4 className="font-medium mb-3">4. Μετά τις Εκλογές</h4>
                                <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300 ml-4">
                                    <li>Export τελικών δεδομένων από Data Grid</li>
                                    <li>Έλεγχος not found voters για διορθώσεις</li>
                                    <li>Στατιστική ανάλυση με saved queries</li>
                                    <li>Σύγκριση με προηγούμενα datasets</li>
                                    <li>Archive dataset αν χρειάζεται</li>
                                </ol>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}