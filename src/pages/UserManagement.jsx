import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { UserPlus, Pencil, Key, Loader2, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    surname: '',
    phone: '',
    email: '',
    password: '',
  });

  const [newPassword, setNewPassword] = useState('');

  const sessionToken = localStorage.getItem('app_session_token');

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['appUsers'],
    queryFn: async () => {
      const allUsers = await base44.asServiceRole.entities.AppUser.filter({});
      return allUsers.filter(u => u.role === 'ORGANOTIKI');
    },
  });

  // Create user mutation
  const createMutation = useMutation({
    mutationFn: async (userData) => {
      const { data } = await base44.functions.invoke('createOrganotiki', {
        session_token: sessionToken,
        ...userData
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['appUsers']);
      setCreateDialogOpen(false);
      setFormData({ name: '', surname: '', phone: '', email: '', password: '' });
      toast.success('Ο χρήστης δημιουργήθηκε επιτυχώς');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Σφάλμα κατά τη δημιουργία');
    }
  });

  // Update user mutation
  const updateMutation = useMutation({
    mutationFn: async ({ user_id, updates }) => {
      const { data } = await base44.functions.invoke('updateOrganotiki', {
        session_token: sessionToken,
        user_id,
        updates
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['appUsers']);
      setEditDialogOpen(false);
      toast.success('Ο χρήστης ενημερώθηκε επιτυχώς');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Σφάλμα κατά την ενημέρωση');
    }
  });

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async ({ user_id, new_password }) => {
      const { data } = await base44.functions.invoke('changeOrganotikiPassword', {
        session_token: sessionToken,
        user_id,
        new_password
      });
      return data;
    },
    onSuccess: () => {
      setPasswordDialogOpen(false);
      setNewPassword('');
      toast.success('Ο κωδικός άλλαξε - όλες οι συνεδρίες ακυρώθηκαν');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Σφάλμα κατά την αλλαγή κωδικού');
    }
  });

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleToggleActive = (user) => {
    updateMutation.mutate({
      user_id: user.id,
      updates: { is_active: !user.is_active }
    });
  };

  const handleChangePassword = () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες');
      return;
    }
    changePasswordMutation.mutate({
      user_id: selectedUser.id,
      new_password: newPassword
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Διαχείριση Χρηστών Organotiki</h1>
          <p className="text-slate-600 mt-1">Δημιουργία και διαχείριση λογαριασμών οργανωτικού</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="h-4 w-4 mr-2" />
              Νέος Χρήστης
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Δημιουργία Νέου Organotiki Χρήστη</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Όνομα</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Όνομα"
                />
              </div>
              <div>
                <Label>Επώνυμο</Label>
                <Input
                  value={formData.surname}
                  onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  placeholder="Επώνυμο"
                />
              </div>
              <div>
                <Label>Τηλέφωνο</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Τηλέφωνο"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Κωδικός</Label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Κωδικός"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormData({ ...formData, password: generatePassword() })}
                  >
                    Αυτόματο
                  </Button>
                </div>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Ο χρήστης θα δημιουργηθεί ως ανενεργός. Ενεργοποιήστε τον για να μπορεί να συνδεθεί.
                </AlertDescription>
              </Alert>
              <Button
                onClick={handleCreate}
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Δημιουργία...
                  </>
                ) : (
                  'Δημιουργία Χρήστη'
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-lg font-semibold text-blue-600">
                        {user.name.charAt(0)}{user.surname.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        {user.name} {user.surname}
                      </h3>
                      <p className="text-sm text-slate-600">{user.email}</p>
                      <p className="text-sm text-slate-500">{user.phone}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">
                      {user.is_active ? 'Ενεργός' : 'Ανενεργός'}
                    </Label>
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={() => handleToggleActive(user)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedUser(user);
                      setNewPassword('');
                      setPasswordDialogOpen(true);
                    }}
                  >
                    <Key className="h-4 w-4 mr-2" />
                    Αλλαγή Κωδικού
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αλλαγή Κωδικού</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Η αλλαγή κωδικού θα αποσυνδέσει αυτόματα τον χρήστη από όλες τις συσκευές.
              </AlertDescription>
            </Alert>
            <div>
              <Label>Νέος Κωδικός</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Νέος κωδικός"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  Αυτόματο
                </Button>
              </div>
            </div>
            <Button
              onClick={handleChangePassword}
              className="w-full"
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Αλλαγή...
                </>
              ) : (
                'Αλλαγή Κωδικού'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}