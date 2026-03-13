import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, AlertCircle, Users, User, Clock } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/common/PageHeader';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import SentMessagesTable from '@/components/messages/SentMessagesTable';

export default function SendMessage() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [recipientMode, setRecipientMode] = useState('groups'); // 'groups' or 'specific'

  // Group recipients
  const [selectedGroups, setSelectedGroups] = useState([]);

  // Specific recipients
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Expiry
  const [expiryEnabled, setExpiryEnabled] = useState(false);
  const [expiryValue, setExpiryValue] = useState('');
  const [expiryUnit, setExpiryUnit] = useState('hours');

  // Fetch all users
  const { data: allAppUsers = [], isLoading: loadingAppUsers } = useQuery({
    queryKey: ['appUsers'],
    queryFn: () => base44.entities.AppUser.list()
  });

  const appUsers = allAppUsers.filter(u => u.role === 'ADMIN' || (u.role === 'ORGANOTIKI' && u.is_active));

  const { data: chreosiAccounts = [], isLoading: loadingChreosi } = useQuery({
    queryKey: ['chreosiAccounts'],
    queryFn: () => base44.entities.ChreosiAccount.filter({ is_active: true })
  });

  const { data: kanaliAccounts = [], isLoading: loadingKanali } = useQuery({
    queryKey: ['kanaliAccounts'],
    queryFn: () => base44.entities.KanaliAccount.filter({ is_active: true })
  });

  // Expiry validation
  const expiryValueNum = parseInt(expiryValue, 10);
  const expiryValid = !expiryEnabled || (
    !isNaN(expiryValueNum) && expiryValueNum > 0 && Number.isInteger(expiryValueNum)
  );

  const sendNotificationMutation = useMutation({
    mutationFn: async () => {
      const sessionToken = localStorage.getItem('app_session_token');
      const { data } = await base44.functions.invoke('notificationsSend', {
        session_token: sessionToken,
        title,
        message,
        selectedGroups: recipientMode === 'groups' ? selectedGroups : [],
        selectedUsers: recipientMode === 'specific' ? selectedUsers : [],
        expiry_enabled: expiryEnabled,
        expiry_value: expiryEnabled ? expiryValueNum : null,
        expiry_unit: expiryEnabled ? expiryUnit : null,
      });
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const summary = data.summary || {};
      const parts = [];
      if ((summary.admins || 0) > 0) parts.push(`${summary.admins} διαχειριστές`);
      if ((summary.organotikoi || 0) > 0) parts.push(`${summary.organotikoi} οργανωτικοί`);
      if ((summary.chreosi || 0) > 0) parts.push(`${summary.chreosi} χρεωστικά`);
      if ((summary.kanali || 0) > 0) parts.push(`${summary.kanali} κανάλι`);
      const total = (data.admin_org_recipient_count || 0) + (data.portal_recipient_count || 0);
      const expiryMsg = data.expiry_enabled && data.expires_at
        ? ` (λήξη: ${new Date(data.expires_at).toLocaleString('el-GR')})`
        : '';
      toast.success(`Το μήνυμα στάλθηκε σε ${total} παραλήπτες${parts.length ? `: ${parts.join(', ')}` : ''}${expiryMsg}`);
      setTitle('');
      setMessage('');
      setSelectedGroups([]);
      setSelectedUsers([]);
      setExpiryEnabled(false);
      setExpiryValue('');
      setExpiryUnit('hours');
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['adminMessagesList']);
    },
    onError: (error) => {
      toast.error(error?.message || 'Σφάλμα κατά την αποστολή του μηνύματος');
    }
  });

  const handleGroupToggle = (group) => {
    setSelectedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const handleUserToggle = (user) => {
    setSelectedUsers(prev => {
      const exists = prev.find(u => u.username === user.username && u.type === user.type);
      if (exists) return prev.filter(u => !(u.username === user.username && u.type === user.type));
      return [...prev, user];
    });
  };

  const hasRecipients =
    (recipientMode === 'groups' && selectedGroups.length > 0) ||
    (recipientMode === 'specific' && selectedUsers.length > 0);

  const isFormValid = title.trim() && message.trim() && hasRecipients && expiryValid;

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
    <div className="max-w-5xl mx-auto space-y-8">
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
                  rows={5}
                  maxLength={500}
                />
                <p className="text-xs text-slate-500 mt-1">{message.length}/500</p>
              </div>

              {/* Expiry section */}
              <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-800/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <Label htmlFor="expiry-switch" className="cursor-pointer font-medium">
                      Το μήνυμα λήγει
                    </Label>
                  </div>
                  <Switch
                    id="expiry-switch"
                    checked={expiryEnabled}
                    onCheckedChange={setExpiryEnabled}
                  />
                </div>

                {expiryEnabled && (
                  <div className="space-y-2 pt-1">
                    <Label className="text-sm text-slate-600">Λήξη μετά από</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="π.χ. 2"
                        value={expiryValue}
                        onChange={(e) => setExpiryValue(e.target.value)}
                        className="w-28"
                      />
                      <Select value={expiryUnit} onValueChange={setExpiryUnit}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">λεπτά</SelectItem>
                          <SelectItem value="hours">ώρες</SelectItem>
                          <SelectItem value="days">ημέρες</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {expiryEnabled && expiryValue && !expiryValid && (
                      <p className="text-xs text-red-500">
                        Η τιμή λήξης πρέπει να είναι θετικός ακέραιος αριθμός
                      </p>
                    )}
                    {expiryEnabled && !expiryValue && (
                      <p className="text-xs text-amber-600">
                        Εισάγετε τιμή λήξης για να στείλετε
                      </p>
                    )}
                    {expiryValid && expiryValue && (
                      <p className="text-xs text-green-600">
                        Το μήνυμα θα λήξει μετά από {expiryValue} {
                          expiryUnit === 'minutes' ? 'λεπτά' :
                          expiryUnit === 'hours' ? 'ώρες' : 'ημέρες'
                        }
                      </p>
                    )}
                  </div>
                )}
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
                      <Label htmlFor={group.value} className="flex items-center gap-2 cursor-pointer">
                        <group.icon className="h-4 w-4" />
                        {group.label}
                      </Label>
                    </div>
                  ))}
                  {selectedGroups.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-slate-600">Επιλεγμένες: {selectedGroups.length} ομάδες</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="specific" className="mt-4">
                  <ScrollArea className="h-80">
                    <div className="space-y-4 pr-4">
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
                                <Badge variant="secondary" className="ml-2 text-xs">{user.user_type}</Badge>
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                  {selectedUsers.length > 0 && (
                    <div className="pt-2 border-t mt-2">
                      <p className="text-sm text-slate-600">Επιλεγμένοι: {selectedUsers.length} χρήστες</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Send Button */}
      <div className="flex justify-end">
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Προεπισκόπηση</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-sm text-slate-900">
                    {title || 'Τίτλος μηνύματος'}
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    {message || 'Περιεχόμενο μηνύματος'}
                  </p>
                  {expiryEnabled && expiryValid && expiryValue && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                      <Clock className="h-3 w-3" />
                      Λήξη μετά από {expiryValue} {
                        expiryUnit === 'minutes' ? 'λεπτά' :
                        expiryUnit === 'hours' ? 'ώρες' : 'ημέρες'
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Management table */}
      <SentMessagesTable />
    </div>
  );
}