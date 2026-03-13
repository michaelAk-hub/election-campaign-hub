import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, AlertCircle, CheckCircle2, Users, User } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export default function SendMessage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState('groups'); // 'groups' or 'specific'
  
  // Group recipients
  const [selectedGroups, setSelectedGroups] = useState([]);
  
  // Specific recipients
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Fetch all users
  const { data: allAppUsers = [], isLoading: loadingAppUsers } = useQuery({
    queryKey: ['appUsers'],
    queryFn: () => base44.entities.AppUser.list()
  });

  // Admins: all; Organotikos: active only
  const appUsers = allAppUsers.filter(u => u.role === 'ADMIN' || (u.role === 'ORGANOTIKI' && u.is_active));

  const { data: chreosiAccounts = [], isLoading: loadingChreosi } = useQuery({
    queryKey: ['chreosiAccounts'],
    queryFn: () => base44.entities.ChreosiAccount.filter({ is_active: true })
  });

  const { data: kanaliAccounts = [], isLoading: loadingKanali } = useQuery({
    queryKey: ['kanaliAccounts'],
    queryFn: () => base44.entities.KanaliAccount.filter({ is_active: true })
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('notificationsSend', {
        session_token: sessionToken,
        title,
        message,
        selectedGroups: recipientMode === 'groups' ? selectedGroups : [],
        selectedUsers: recipientMode === 'specific' ? selectedUsers : [],
      });
      return data;
    },
    onSuccess: (data) => {
      const notifCount = data.notifications_created || 0;
      const pushCount = data.push_messages_created || 0;
      const parts = [];
      if (notifCount > 0) parts.push(`${notifCount} admin/οργανωτικοί`);
      if (pushCount > 0) parts.push(`portal χρήστες`);
      toast.success(`Το μήνυμα στάλθηκε επιτυχώς${parts.length ? ` σε: ${parts.join(', ')}` : ''}!`);
      setTitle('');
      setMessage('');
      setSelectedGroups([]);
      setSelectedUsers([]);
      queryClient.invalidateQueries(['notifications']);
    },
    onError: (error) => {
      toast.error('Σφάλμα κατά την αποστολή του μηνύματος');
      console.error(error);
    }
  });

  const handleGroupToggle = (group) => {
    setSelectedGroups(prev => 
      prev.includes(group) 
        ? prev.filter(g => g !== group)
        : [...prev, group]
    );
  };

  const handleUserToggle = (user) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.username === user.username && u.type === user.type);
      if (exists) {
        return prev.filter(u => !(u.username === user.username && u.type === user.type));
      } else {
        return [...prev, user];
      }
    });
  };

  const isFormValid = title.trim() && message.trim() && (
    (recipientMode === 'groups' && selectedGroups.length > 0) ||
    (recipientMode === 'specific' && selectedUsers.length > 0)
  );

  const recipientGroups = [
    { value: 'admin', label: 'Διαχειριστές', icon: Users },
    { value: 'organotikos', label: 'Οργανωτικοί', icon: Users },
    { value: 'chreosi', label: 'Χρεωστικά', icon: Users },
    { value: 'kanali', label: 'Κανάλι', icon: Users },
    { value: 'all', label: 'Όλοι οι χρήστες', icon: Users }
  ];



  if (loadingAppUsers || loadingChreosi || loadingKanali) {
    return <LoadingSpinner text="Φόρτωση χρηστών..." />;
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Στείλε Μήνυμα"
        subtitle="Αποστολή ειδοποιήσεων σε χρήστες"
        icon={Send}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Σύνθεση Μηνύματος</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Τίτλος</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Εισάγετε τον τίτλο του μηνύματος..."
                  maxLength={100}
                />
                <p className="text-xs text-slate-500 mt-1">{title.length}/100</p>
              </div>

              <div>
                <Label htmlFor="message">Μήνυμα</Label>
                <Textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Εισάγετε το περιεχόμενο του μηνύματος..."
                  rows={6}
                  maxLength={500}
                />
                <p className="text-xs text-slate-500 mt-1">{message.length}/500</p>
              </div>


            </CardContent>
          </Card>
        </div>

        {/* Recipients Selection */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Παραλήπτες</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={recipientMode} onValueChange={setRecipientMode}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="groups">
                    <Users className="h-4 w-4 mr-2" />
                    Ομάδες
                  </TabsTrigger>
                  <TabsTrigger value="specific">
                    <User className="h-4 w-4 mr-2" />
                    Συγκεκριμένοι
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="groups" className="space-y-3 mt-4">
                  {recipientGroups.map((group) => (
                    <div key={group.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={group.value}
                        checked={selectedGroups.includes(group.value)}
                        onCheckedChange={() => handleGroupToggle(group.value)}
                      />
                      <Label
                        htmlFor={group.value}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <group.icon className="h-4 w-4" />
                        {group.label}
                      </Label>
                    </div>
                  ))}
                  {selectedGroups.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-slate-600">
                        Επιλεγμένες: {selectedGroups.length} ομάδες
                      </p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="specific" className="mt-4">
                  <ScrollArea className="h-80">
                    <div className="space-y-4 pr-4">
                      {/* App Users (Admin & Organotiki) */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Διαχειριστές & Οργανωτικοί</h4>
                        <div className="space-y-2">
                          {appUsers.map((user) => (
                            <div key={user.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`app-${user.id}`}
                                checked={selectedUsers.some(u => u.username === user.email && u.type === (user.role === 'ADMIN' ? 'admin' : 'organotikos'))}
                                onCheckedChange={() => handleUserToggle({
                                  username: user.email,
                                  type: user.role === 'ADMIN' ? 'admin' : 'organotikos',
                                  displayName: `${user.name} ${user.surname}`
                                })}
                              />
                              <Label htmlFor={`app-${user.id}`} className="cursor-pointer text-sm">
                                {user.name} {user.surname}
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {user.role === 'ADMIN' ? 'Admin' : 'Org'}
                                </Badge>
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Chreosi Accounts */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Χρεωστικά</h4>
                        <div className="space-y-2">
                          {chreosiAccounts.map((user) => (
                            <div key={user.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`chreosi-${user.id}`}
                                checked={selectedUsers.some(u => u.username === user.username && u.type === 'chreosi')}
                                onCheckedChange={() => handleUserToggle({
                                  username: user.username,
                                  type: 'chreosi',
                                  displayName: user.display_name || user.username
                                })}
                              />
                              <Label htmlFor={`chreosi-${user.id}`} className="cursor-pointer text-sm">
                                {user.display_name || user.username}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Kanali Accounts */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2">Κανάλι</h4>
                        <div className="space-y-2">
                          {kanaliAccounts.map((user) => (
                            <div key={user.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`kanali-${user.id}`}
                                checked={selectedUsers.some(u => u.username === user.username && u.type === 'kanali')}
                                onCheckedChange={() => handleUserToggle({
                                  username: user.username,
                                  type: 'kanali',
                                  displayName: user.username
                                })}
                              />
                              <Label htmlFor={`kanali-${user.id}`} className="cursor-pointer text-sm">
                                {user.username}
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {user.user_type}
                                </Badge>
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                  {selectedUsers.length > 0 && (
                    <div className="pt-2 border-t mt-2">
                      <p className="text-sm text-slate-600">
                        Επιλεγμένοι: {selectedUsers.length} χρήστες
                      </p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Button */}
      <div className="mt-6 flex justify-end">
        <Button
          size="lg"
          disabled={!isFormValid || sendNotificationMutation.isPending}
          onClick={() => sendNotificationMutation.mutate()}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {sendNotificationMutation.isPending ? (
            <>Αποστολή...</>
          ) : (
            <>
              <Send className="h-5 w-5 mr-2" />
              Αποστολή Μηνύματος
            </>
          )}
        </Button>
      </div>

      {/* Preview */}
      {(title || message) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm">Προεπισκόπηση</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-900">
                    {title || 'Τίτλος μηνύματος'}
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    {message || 'Περιεχόμενο μηνύματος'}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}