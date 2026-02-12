import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Search, Shield, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { createPageUrl } from '../utils';
import LoadingSpinner from '../components/common/LoadingSpinner';

export default function UserManagement() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

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

    // Fetch all users from all entities
    const { data: allUsers = [], isLoading: usersLoading, error } = useQuery({
        queryKey: ['allUsers'],
        queryFn: async () => {
            const [appUsers, kanaliUsers, chreosiUsers] = await Promise.all([
                base44.entities.AppUser.list(),
                base44.entities.KanaliAccount.list(),
                base44.entities.ChreosiAccount.list()
            ]);

            const users = [];

            // AppUser (ADMIN and ORGANOTIKI)
            appUsers.forEach(user => {
                users.push({
                    id: user.id,
                    role: user.role,
                    name: user.name || '-',
                    surname: user.surname || '-',
                    email: user.email || '-',
                    phone: user.phone || '-',
                    is_active: user.is_active,
                    created_date: user.created_date,
                    entity: 'AppUser'
                });
            });

            // KanaliAccount
            kanaliUsers.forEach(user => {
                users.push({
                    id: user.id,
                    role: 'KANALI',
                    name: '-',
                    surname: '-',
                    email: '-',
                    phone: '-',
                    username: user.username,
                    is_active: user.is_active,
                    created_date: user.created_date,
                    entity: 'KanaliAccount'
                });
            });

            // ChreosiAccount
            chreosiUsers.forEach(user => {
                users.push({
                    id: user.id,
                    role: 'CHREOSI',
                    name: user.display_name || '-',
                    surname: '-',
                    email: '-',
                    phone: user.phone || '-',
                    username: user.username,
                    is_active: user.is_active,
                    created_date: user.created_date,
                    entity: 'ChreosiAccount'
                });
            });

            return users;
        },
        enabled: !!currentUser
    });

    const activateDeactivateMutation = useMutation({
        mutationFn: async ({ userId, role, newStatus }) => {
            const sessionToken = localStorage.getItem('app_session_token');
            const { data } = await base44.functions.invoke('activateDeactivateUser', {
                session_token: sessionToken,
                target_user_id: userId,
                target_role: role,
                new_status: newStatus
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['allUsers'] });
        }
    });

    // Check if current user can activate/deactivate target user
    const canToggleStatus = (targetRole) => {
        if (!currentUser) return false;
        
        if (currentUser.role === 'ADMIN') {
            return ['ORGANOTIKI', 'KANALI', 'CHREOSI'].includes(targetRole);
        } else if (currentUser.role === 'ORGANOTIKI') {
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
            user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (user.username && user.username.toLowerCase().includes(searchQuery.toLowerCase()));

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
        ADMIN: 'bg-purple-100 text-purple-800',
        ORGANOTIKI: 'bg-blue-100 text-blue-800',
        KANALI: 'bg-green-100 text-green-800',
        CHREOSI: 'bg-orange-100 text-orange-800'
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Users className="h-6 w-6 text-blue-600" />
                            <div>
                                <CardTitle>Διαχείριση Χρηστών</CardTitle>
                                <p className="text-sm text-slate-500 mt-1">
                                    Όλοι οι χρήστες του συστήματος ({filteredUsers.length} από {allUsers.length})
                                </p>
                            </div>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Αναζήτηση (όνομα, επώνυμο, email, username)..."
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
                                <SelectItem value="KANALI">KANALI</SelectItem>
                                <SelectItem value="CHREOSI">CHREOSI</SelectItem>
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
                    <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΡΟΛΟΣ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΟΝΟΜΑ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΕΠΩΝΥΜΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">EMAIL / USERNAME</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΤΗΛΕΦΩΝΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΚΑΤΑΣΤΑΣΗ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΕΝΕΡΓΕΙΕΣ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredUsers.map((user) => (
                                        <tr key={user.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <Badge className={roleColors[user.role]}>
                                                    {user.role}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm">{user.name}</td>
                                            <td className="px-4 py-3 text-sm">{user.surname}</td>
                                            <td className="px-4 py-3 text-sm">
                                                {user.email !== '-' ? user.email : user.username || '-'}
                                            </td>
                                            <td className="px-4 py-3 text-sm">{user.phone}</td>
                                            <td className="px-4 py-3">
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
                                            </td>
                                            <td className="px-4 py-3">
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
                                                    <span className="text-xs text-slate-400">Μη διαθέσιμο</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {filteredUsers.length === 0 && (
                            <div className="p-8 text-center text-slate-500">
                                Δεν βρέθηκαν χρήστες
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}