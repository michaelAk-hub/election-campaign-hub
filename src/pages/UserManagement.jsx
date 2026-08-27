import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Search, CheckCircle, XCircle, Loader2, UserPlus, Eye, EyeOff, Trash2, Circle, RefreshCw, Lock, Unlock, Cloud } from 'lucide-react';
import { createPageUrl } from '../utils';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { el } from 'date-fns/locale';

export default function UserManagement() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [deleteUserId, setDeleteUserId] = useState(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        surname: '',
        phone: '',
        email: '',
        password: ''
    });

    const queryClient = useQueryClient();

    useEffect(() => {
        const loadUser = async () => {
            try {
                const sessionToken = localStorage.getItem('app_session_token');
                if (!sessionToken) {
                    window.location.href = createPageUrl('AdminLogin');
                    return;
                }

                const { data } = await base44.functions.invoke('validateAppSession', {
                    session_token: sessionToken
                });

                if (!data.valid) {
                    localStorage.removeItem('app_session_token');
                    window.location.href = createPageUrl('AdminLogin');
                    return;
                }

                setCurrentUser(data.user);
                setLoading(false);
            } catch (e) {
                console.error('Session validation error:', e);
                window.location.href = createPageUrl('AdminLogin');
            }
        };
        loadUser();
    }, []);

    // Fetch only ADMIN and ORGANOTIKI users
    const { data: allUsers = [], isLoading: usersLoading, error } = useQuery({
        queryKey: ['adminOrganotikiUsers'],
        queryFn: async () => {
            const appUsers = await base44.entities.AppUser.list();
            
            return appUsers.map(user => ({
                id: user.id,
                role: user.role,
                name: user.name || '-',
                surname: user.surname || '-',
                email: user.email || '-',
                phone: user.phone || '-',
                is_active: user.is_active !== false,
                created_date: user.created_date,
                mfa_method: user.mfa_method || 'sms',
                totp_enrolled: user.totp_enrolled === true,
            }));
        },
        enabled: !!currentUser
    });

    // Fetch online status every 20 seconds
    const { data: onlineStatus = { online_user_ids: [], last_seen: {} } } = useQuery({
        queryKey: ['onlineStatus'],
        queryFn: async () => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('getOnlineStatus', {
                session_token: sessionToken
            });
            return data;
        },
        enabled: !!currentUser,
        refetchInterval: 20000 // Refresh every 20 seconds
    });

    // Locked-out accounts (login rate-limiting). Refetch periodically; a 1s ticker
    // drives the live "time remaining" countdown between refetches.
    const { data: blocked = [] } = useQuery({
        queryKey: ['blockedAccounts'],
        queryFn: async () => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('loginThrottleAdmin', {
                session_token: sessionToken, action: 'list'
            });
            return data?.blocked ?? [];
        },
        enabled: !!currentUser,
        refetchInterval: 15000
    });

    const [nowTs, setNowTs] = useState(Date.now());
    useEffect(() => {
        const t = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);

    const unlockMutation = useMutation({
        mutationFn: async (throttleKey) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('loginThrottleAdmin', {
                session_token: sessionToken, action: 'unlock', throttle_key: throttleKey
            });
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['blockedAccounts'] });
            toast.success('Ο λογαριασμός ξεκλειδώθηκε');
        },
        onError: (e) => toast.error(e.message || 'Σφάλμα ξεκλειδώματος')
    });

    const createOrganotikiMutation = useMutation({
        mutationFn: async (userData) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('createOrganotiki', {
                session_token: sessionToken,
                ...userData
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminOrganotikiUsers'] });
            setShowCreateDialog(false);
            setFormData({ name: '', surname: '', phone: '', email: '', password: '' });
            toast.success('Ο χρήστης Organotiki δημιουργήθηκε επιτυχώς');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Σφάλμα δημιουργίας χρήστη');
        }
    });

    const activateDeactivateMutation = useMutation({
        mutationFn: async ({ userId, role, newStatus }) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('toggleUserActivation', {
                session_token: sessionToken,
                target_user_id: userId,
                target_role: role,
                new_status: newStatus
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminOrganotikiUsers'] });
            toast.success('Η κατάσταση του χρήστη άλλαξε επιτυχώς');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Σφάλμα αλλαγής κατάστασης');
        }
    });

    const mfaMethodMutation = useMutation({
        mutationFn: async ({ userId, method }) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('mfaAdminSetMethod', {
                session_token: sessionToken,
                target_user_id: userId,
                method,
            });
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (_d, vars) => {
            queryClient.invalidateQueries({ queryKey: ['adminOrganotikiUsers'] });
            toast.success(vars.method === 'totp'
                ? 'Ορίστηκε Authenticator — ο χρήστης θα σαρώσει QR στην επόμενη σύνδεση'
                : 'Ορίστηκε SMS');
        },
        onError: (error) => {
            toast.error(error.message || 'Σφάλμα αλλαγής μεθόδου 2FA');
        }
    });

    const backupMutation = useMutation({
        mutationFn: async () => {
            const { data } = await base44.functions.invoke('backupToDrive', {
                session_token: localStorage.getItem('app_session_token'),
            });
            if (data?.error) throw new Error(data.error);
            return data;
        },
        onSuccess: (data) => {
            if (data.failed) toast.warning(`Αντίγραφο: ${data.uploaded}/${data.tables} πίνακες (${data.failed} απέτυχαν) → ${data.path}`);
            else toast.success(`Αντίγραφο ασφαλείας ολοκληρώθηκε: ${data.uploaded} πίνακες → ${data.path}`);
        },
        onError: (e) => toast.error('Αποτυχία backup: ' + (e.message || '')),
    });

    const deleteOrganotikiMutation = useMutation({
        mutationFn: async (userId) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('deleteOrganotiki', {
                session_token: sessionToken,
                target_user_id: userId
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminOrganotikiUsers'] });
            setShowDeleteDialog(false);
            setDeleteUserId(null);
            toast.success('Ο χρήστης διαγράφηκε επιτυχώς');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Σφάλμα διαγραφής χρήστη');
        }
    });

    const handleCreateSubmit = (e) => {
        e.preventDefault();
        if (!formData.name || !formData.surname || !formData.phone || !formData.email || !formData.password) {
            toast.error('Όλα τα πεδία είναι υποχρεωτικά');
            return;
        }
        createOrganotikiMutation.mutate(formData);
    };

    // Check if current user can activate/deactivate target user
    const canToggleStatus = (targetRole) => {
        if (!currentUser) return false;
        
        // ADMIN users cannot be deactivated
        if (targetRole === 'ADMIN') return false;
        
        if (currentUser.role === 'ADMIN') {
            // ADMIN can activate/deactivate ORGANOTIKI
            return targetRole === 'ORGANOTIKI';
        } else if (currentUser.role === 'ORGANOTIKI') {
            // ORGANOTIKI can only activate/deactivate other ORGANOTIKI
            return targetRole === 'ORGANOTIKI';
        }
        return false;
    };

    // Filter users
    const filteredUsers = allUsers.filter(user => {
        const matchesSearch = 
            searchQuery === '' ||
            user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.surname.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        const matchesStatus = 
            statusFilter === 'all' ||
            (statusFilter === 'active' && user.is_active) ||
            (statusFilter === 'inactive' && !user.is_active);

        return matchesSearch && matchesRole && matchesStatus;
    });

    if (loading || usersLoading) {
        return <LoadingSpinner text="Φόρτωση χρηστών..." />;
    }

    if (error) {
        return (
            <div className="p-6">
                <Alert variant="destructive">
                    <AlertDescription>Σφάλμα φόρτωσης χρηστών: {error.message}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const roleColors = {
        ADMIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
        ORGANOTIKI: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
    };

    const isAdmin = currentUser?.role === 'ADMIN';

    // Live "time remaining" from an ISO lock expiry (Greek short units).
    const formatRemaining = (lockedUntil) => {
        const ms = new Date(lockedUntil).getTime() - nowTs;
        if (ms <= 0) return 'λήγει…';
        const total = Math.ceil(ms / 1000);
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        if (h > 0) return `${h}ω ${m}λ`;
        if (m > 0) return `${m}λ ${s}δ`;
        return `${s}δ`;
    };
    const accountTypeLabel = (t) => ({
        admin: 'Διαχειριστής', organotiki: 'Οργανωτικός', chreosi: 'Χρεωστικό', kanali: 'Κανάλι'
    }[t] || 'Portal');
    // Lock info for the admin/organotiki rows, keyed by email (admin:<email>).
    const blockedByEmail = new Map(
        blocked.filter(b => (b.throttle_key || '').startsWith('admin:'))
               .map(b => [b.throttle_key.slice(6), b])
    );

    return (
        <div className="space-y-6">
            {/* Locked-out accounts (brute-force protection) */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Lock className={`h-5 w-5 ${blocked.length > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                        <div>
                            <CardTitle>Κλειδωμένοι Λογαριασμοί</CardTitle>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                {blocked.length} λογαριασμοί προσωρινά κλειδωμένοι λόγω αποτυχημένων προσπαθειών σύνδεσης
                            </p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {blocked.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 py-1">
                            Κανένας κλειδωμένος λογαριασμός αυτή τη στιγμή.
                        </p>
                    ) : (
                        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΧΡΗΣΤΗΣ</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΤΥΠΟΣ</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΥΠΟΛΟΙΠΟΣ ΧΡΟΝΟΣ</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΕΠΙΠΕΔΟ</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΕΝΕΡΓΕΙΑ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-slate-700">
                                        {blocked.map((b) => (
                                            <tr key={b.throttle_key} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                                <td className="px-4 py-3 text-sm font-medium">{b.username}</td>
                                                <td className="px-4 py-3">
                                                    <Badge variant="secondary">{accountTypeLabel(b.account_type)}</Badge>
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                                                        <Lock className="h-3 w-3 mr-1" />
                                                        {formatRemaining(b.locked_until)}
                                                    </Badge>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">#{b.lock_level}</td>
                                                <td className="px-4 py-3">
                                                    {isAdmin ? (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => unlockMutation.mutate(b.throttle_key)}
                                                            disabled={unlockMutation.isPending}
                                                        >
                                                            <Unlock className="h-3 w-3 mr-1" />
                                                            Ξεκλείδωμα
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 dark:text-slate-500">Μόνο διαχειριστής</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users className="h-6 w-6 text-blue-600" />
                            <div>
                                <CardTitle>Διαχείριση Χρηστών - ADMIN & ORGANOTIKI</CardTitle>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    {filteredUsers.length} από {allUsers.length} χρήστες
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['onlineStatus'] })}
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Ανανέωση
                            </Button>
                            {isAdmin && (
                                <Button
                                    variant="outline"
                                    onClick={() => backupMutation.mutate()}
                                    disabled={backupMutation.isPending}
                                    title="Αντίγραφο ασφαλείας όλων των πινάκων στο Google Drive"
                                >
                                    {backupMutation.isPending
                                        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        : <Cloud className="h-4 w-4 mr-2" />}
                                    Backup
                                </Button>
                            )}
                            {isAdmin && (
                                <Button
                                    onClick={() => setShowCreateDialog(true)}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Νέος Οργανωτικός
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Αναζήτηση (όνομα, επώνυμο, email)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="Ρόλος" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Όλοι οι ρόλοι</SelectItem>
                                <SelectItem value="ADMIN">ADMIN</SelectItem>
                                <SelectItem value="ORGANOTIKI">ORGANOTIKI</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="Κατάσταση" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Όλες οι καταστάσεις</SelectItem>
                                <SelectItem value="active">Ενεργοί</SelectItem>
                                <SelectItem value="inactive">Ανενεργοί</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Users Table */}
                    <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΡΟΛΟΣ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΟΝΟΜΑ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΕΠΩΝΥΜΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΤΗΛΕΦΩΝΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">EMAIL</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΚΩΔΙΚΟΣ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ONLINE</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΚΑΤΑΣΤΑΣΗ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-400">ΕΝΕΡΓΕΙΕΣ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y dark:divide-slate-700">
                                    {filteredUsers.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                            <td className="px-4 py-3">
                                                <Badge className={roleColors[user.role]}>
                                                    {user.role}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm">{user.name}</td>
                                            <td className="px-4 py-3 text-sm">{user.surname}</td>
                                            <td className="px-4 py-3 text-sm">{user.phone}</td>
                                            <td className="px-4 py-3 text-sm">{user.email}</td>
                                            <td className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500">••••••••</td>
                                            <td className="px-4 py-3">
                                                {onlineStatus.online_user_ids.includes(user.id) ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="bg-green-100 text-green-800">
                                                            <Circle className="h-2 w-2 mr-1 fill-green-600" />
                                                            Online
                                                        </Badge>
                                                        {onlineStatus.last_seen[user.id] && (
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                {formatDistanceToNow(new Date(onlineStatus.last_seen[user.id]), { 
                                                                    addSuffix: true,
                                                                    locale: el 
                                                                })}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                        <Circle className="h-2 w-2 mr-1" />
                                                        Offline
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col items-start gap-1">
                                                    {user.is_active ? (
                                                        <Badge className="bg-green-100 text-green-800">
                                                            <CheckCircle className="h-3 w-3 mr-1" />
                                                            Ενεργός
                                                        </Badge>
                                                    ) : (
                                                        <Badge className="bg-red-100 text-red-800">
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Ανενεργός
                                                        </Badge>
                                                    )}
                                                    {blockedByEmail.get((user.email || '').toLowerCase()) && (
                                                        <div className="flex items-center gap-1">
                                                            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300">
                                                                <Lock className="h-3 w-3 mr-1" />
                                                                Κλειδωμένος {formatRemaining(blockedByEmail.get((user.email || '').toLowerCase()).locked_until)}
                                                            </Badge>
                                                            {isAdmin && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-6 px-1"
                                                                    title="Ξεκλείδωμα"
                                                                    onClick={() => unlockMutation.mutate(blockedByEmail.get((user.email || '').toLowerCase()).throttle_key)}
                                                                    disabled={unlockMutation.isPending}
                                                                >
                                                                    <Unlock className="h-3 w-3" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <Badge variant="outline" className="text-xs font-normal">
                                                            2FA: {user.mfa_method === 'totp'
                                                                ? (user.totp_enrolled ? 'Authenticator' : 'Authenticator (εκκρεμεί)')
                                                                : 'SMS'}
                                                        </Badge>
                                                        {isAdmin && (
                                                            <Select
                                                                value={user.mfa_method}
                                                                onValueChange={(v) => mfaMethodMutation.mutate({ userId: user.id, method: v })}
                                                            >
                                                                <SelectTrigger className="h-6 w-[132px] text-xs"><SelectValue /></SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="sms">SMS</SelectItem>
                                                                    <SelectItem value="totp">Authenticator</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                        {isAdmin && user.mfa_method === 'totp' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-6 px-1.5 text-xs"
                                                                title="Επαναφορά — νέο QR στην επόμενη σύνδεση"
                                                                onClick={() => mfaMethodMutation.mutate({ userId: user.id, method: 'totp' })}
                                                                disabled={mfaMethodMutation.isPending}
                                                            >
                                                                Επαναφορά
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {canToggleStatus(user.role) ? (
                                                        <Button
                                                            size="sm"
                                                            variant={user.is_active ? "outline" : "default"}
                                                            onClick={() => {
                                                                activateDeactivateMutation.mutate({
                                                                    userId: user.id,
                                                                    role: user.role,
                                                                    newStatus: !user.is_active
                                                                });
                                                            }}
                                                            disabled={activateDeactivateMutation.isPending}
                                                        >
                                                            {activateDeactivateMutation.isPending ? (
                                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                            ) : user.is_active ? (
                                                                <XCircle className="h-3 w-3 mr-1" />
                                                            ) : (
                                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                            )}
                                                            {user.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs text-slate-400 dark:text-slate-500">
                                                            {user.role === 'ADMIN' ? 'Πάντα ενεργός' : 'Μη διαθέσιμο'}
                                                        </span>
                                                    )}
                                                    {isAdmin && user.role === 'ORGANOTIKI' && (
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => {
                                                                setDeleteUserId(user.id);
                                                                setShowDeleteDialog(true);
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredUsers.length === 0 && (
                            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                                Δεν βρέθηκαν χρήστες
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Επιβεβαίωση Διαγραφής</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Είστε σίγουροι ότι θέλετε να διαγράψετε αυτόν τον χρήστη Organotiki; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
                    </p>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteDialog(false);
                                setDeleteUserId(null);
                            }}
                            disabled={deleteOrganotikiMutation.isPending}
                        >
                            Ακύρωση
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteOrganotikiMutation.mutate(deleteUserId)}
                            disabled={deleteOrganotikiMutation.isPending}
                        >
                            {deleteOrganotikiMutation.isPending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Διαγραφή...
                                </>
                            ) : (
                                'Διαγραφή'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create ORGANOTIKI Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Δημιουργία Νέου Οργανωτικού</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Όνομα *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="surname">Επώνυμο *</Label>
                            <Input
                                id="surname"
                                value={formData.surname}
                                onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Τηλέφωνο *</Label>
                            <Input
                                id="phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Κωδικός *</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={formData.password}
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    required
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowCreateDialog(false)}
                                disabled={createOrganotikiMutation.isPending}
                            >
                                Άκυρο
                            </Button>
                            <Button
                                type="submit"
                                className="bg-blue-600 hover:bg-blue-700"
                                disabled={createOrganotikiMutation.isPending}
                            >
                                {createOrganotikiMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Δημιουργία...
                                    </>
                                ) : (
                                    'Δημιουργία'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}