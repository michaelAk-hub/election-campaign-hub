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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Search, UserPlus, CheckCircle, XCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { createPageUrl } from '../utils';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { toast } from 'sonner';

export default function UserManagement() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    
    // Form state for creating new ORGANOTIKI user
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

                // Only ADMIN and ORGANOTIKI can access this page
                if (data.user.role !== 'ADMIN' && data.user.role !== 'ORGANOTIKI') {
                    window.location.href = createPageUrl('Portal');
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

    // Fetch ONLY ADMIN and ORGANOTIKI users
    const { data: users = [], isLoading: usersLoading, error } = useQuery({
        queryKey: ['adminOrganotikiUsers'],
        queryFn: async () => {
            const appUsers = await base44.entities.AppUser.list();
            // Filter to show only ADMIN and ORGANOTIKI
            return appUsers.filter(user => user.role === 'ADMIN' || user.role === 'ORGANOTIKI');
        },
        enabled: !!currentUser
    });

    // Create ORGANOTIKI mutation
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
            setCreateDialogOpen(false);
            setFormData({ name: '', surname: '', phone: '', email: '', password: '' });
            toast.success('Ο χρήστης ORGANOTIKI δημιουργήθηκε επιτυχώς');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Σφάλμα δημιουργίας χρήστη');
        }
    });

    // Toggle activation mutation
    const toggleActivationMutation = useMutation({
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
            toast.success('Η κατάσταση του χρήστη ενημερώθηκε');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Σφάλμα ενημέρωσης κατάστασης');
        }
    });

    const handleCreateSubmit = (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.name || !formData.surname || !formData.phone || !formData.email || !formData.password) {
            toast.error('Όλα τα πεδία είναι υποχρεωτικά');
            return;
        }

        if (formData.password.length < 6) {
            toast.error('Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες');
            return;
        }

        createOrganotikiMutation.mutate(formData);
    };

    // Check if current user can toggle target user
    const canToggleStatus = (targetRole) => {
        if (!currentUser) return false;
        
        if (targetRole === 'ADMIN') {
            return false; // ADMIN cannot be deactivated
        }
        
        if (currentUser.role === 'ADMIN') {
            return targetRole === 'ORGANOTIKI';
        } else if (currentUser.role === 'ORGANOTIKI') {
            return targetRole === 'ORGANOTIKI';
        }
        return false;
    };

    // Filter users
    const filteredUsers = users.filter(user => {
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
        ADMIN: 'bg-purple-100 text-purple-800',
        ORGANOTIKI: 'bg-blue-100 text-blue-800'
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
                                    Διαχειριστές και Οργανωτικοί ({filteredUsers.length} από {users.length})
                                </p>
                            </div>
                        </div>
                        
                        {/* Create New ORGANOTIKI button - ADMIN only */}
                        {currentUser?.role === 'ADMIN' && (
                            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button className="bg-blue-600 hover:bg-blue-700">
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Νέος Οργανωτικός
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-md">
                                    <DialogHeader>
                                        <DialogTitle>Δημιουργία Νέου Οργανωτικού Χρήστη</DialogTitle>
                                    </DialogHeader>
                                    <form onSubmit={handleCreateSubmit} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Όνομα *</Label>
                                            <Input
                                                id="name"
                                                value={formData.name}
                                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="surname">Επώνυμο *</Label>
                                            <Input
                                                id="surname"
                                                value={formData.surname}
                                                onChange={(e) => setFormData({...formData, surname: e.target.value})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="phone">Τηλέφωνο *</Label>
                                            <Input
                                                id="phone"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email *</Label>
                                            <Input
                                                id="email"
                                                type="email"
                                                value={formData.email}
                                                onChange={(e) => setFormData({...formData, email: e.target.value})}
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
                                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                                    required
                                                    minLength={6}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-500">Τουλάχιστον 6 χαρακτήρες</p>
                                        </div>
                                        <div className="flex justify-end gap-3 pt-4">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setCreateDialogOpen(false)}
                                            >
                                                Ακύρωση
                                            </Button>
                                            <Button
                                                type="submit"
                                                disabled={createOrganotikiMutation.isPending}
                                                className="bg-blue-600 hover:bg-blue-700"
                                            >
                                                {createOrganotikiMutation.isPending ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Δημιουργία...
                                                    </>
                                                ) : (
                                                    'Δημιουργία'
                                                )}
                                            </Button>
                                        </div>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        )}
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
                    <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΡΟΛΟΣ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΟΝΟΜΑ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΕΠΩΝΥΜΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΤΗΛΕΦΩΝΟ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">EMAIL</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΚΩΔΙΚΟΣ</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600">ΚΑΤΑΣΤΑΣΗ</th>
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
                                            <td className="px-4 py-3 text-sm">{user.phone}</td>
                                            <td className="px-4 py-3 text-sm">{user.email}</td>
                                            <td className="px-4 py-3 text-sm text-slate-400">••••••••</td>
                                            <td className="px-4 py-3">
                                                {canToggleStatus(user.role) ? (
                                                    <Button
                                                        size="sm"
                                                        variant={user.is_active ? "outline" : "default"}
                                                        onClick={() => {
                                                            toggleActivationMutation.mutate({
                                                                userId: user.id,
                                                                role: user.role,
                                                                newStatus: !user.is_active
                                                            });
                                                        }}
                                                        disabled={toggleActivationMutation.isPending}
                                                    >
                                                        {toggleActivationMutation.isPending ? (
                                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                        ) : user.is_active ? (
                                                            <>
                                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                                Ενεργός
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle className="h-3 w-3 mr-1" />
                                                                Ανενεργός
                                                            </>
                                                        )}
                                                    </Button>
                                                ) : (
                                                    <Badge className={user.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                                                        {user.is_active ? (
                                                            <>
                                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                                Ενεργός
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle className="h-3 w-3 mr-1" />
                                                                Ανενεργός
                                                            </>
                                                        )}
                                                    </Badge>
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