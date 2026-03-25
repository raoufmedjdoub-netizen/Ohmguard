import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import api, { authAPI } from '@/lib/api';
import {
  Sun, Moon, Globe, User, Mail, Send, Loader2, CheckCircle2, Server,
  Users, UserPlus, Search, Shield, MapPin, Eye, Check, X, Trash2,
  RefreshCw, Key, Phone, Briefcase, Building2, FileText, ChevronRight, Bell, BellOff,
  Smartphone
} from 'lucide-react';
import {
  Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet';

const ROLE_LABELS = {
  CLIENT_ADMIN: { label: 'Administrateur', color: 'bg-red-100 text-red-800 border-red-200' },
  SUPERVISOR: { label: 'Superviseur', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  OPERATOR: { label: 'Opérateur', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  VIEWER: { label: 'Lecteur', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  TENANT_ADMIN: { label: 'Admin Tenant', color: 'bg-red-100 text-red-800 border-red-200' },
};

// ============================================================================
// MAIN SETTINGS PAGE
// ============================================================================

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'TENANT_ADMIN';
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div data-testid="settings-page" className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="settings-tabs">
          <TabsTrigger value="general" data-testid="tab-general">Général</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-1.5" />
            Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            <Smartphone className="h-4 w-4 mr-1.5" />
            Sessions
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="smtp" data-testid="tab-smtp">
              <Server className="h-4 w-4 mr-1.5" />
              SMTP
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general">
          <GeneralSettingsTab />
        </TabsContent>

        <TabsContent value="users">
          <UsersSettingsTab />
        </TabsContent>

        <TabsContent value="sessions">
          <ActiveSessionsTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="smtp">
            <SmtpSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ============================================================================
// GENERAL SETTINGS TAB
// ============================================================================

function GeneralSettingsTab() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [emailNotif, setEmailNotif] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const [bannerLoading, setBannerLoading] = useState(false);

  // Push mobile
  const [pushDevices, setPushDevices] = useState([]);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushToggling, setPushToggling] = useState(false);

  const allPushEnabled = pushDevices.length > 0 && pushDevices.every(d => d.notifications_enabled !== false);

  const loadPushDevices = useCallback(() => {
    setPushLoading(true);
    api.get('/push-tokens').then(r => setPushDevices(r.data)).catch(() => {}).finally(() => setPushLoading(false));
  }, []);

  useEffect(() => {
    api.get('/users/me/notifications').then(r => {
      setEmailNotif(r.data.email_notifications || false);
      setBannerEnabled(r.data.alert_banner_enabled !== false);
    }).catch(() => {});
    loadPushDevices();
  }, [loadPushDevices]);

  const toggleAllPush = async (val) => {
    setPushToggling(true);
    try {
      await api.patch('/push-tokens/settings/all', { enabled: val });
      setPushDevices(prev => prev.map(d => ({ ...d, notifications_enabled: val })));
      toast.success(val ? 'Notifications push activées sur tous les appareils' : 'Notifications push désactivées sur tous les appareils');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setPushToggling(false);
    }
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  const toggleNotif = async (val) => {
    setNotifLoading(true);
    try {
      await api.put('/users/me/notifications', { email_notifications: val });
      setEmailNotif(val);
      toast.success(val ? 'Notifications email activées' : 'Notifications email désactivées');
    } catch (e) {
      toast.error('Erreur');
    } finally {
      setNotifLoading(false);
    }
  };

  const toggleBanner = async (val) => {
    setBannerLoading(true);
    try {
      await api.put('/users/me/notifications', { alert_banner_enabled: val });
      setBannerEnabled(val);
      toast.success(val ? 'Bandeau d\'alertes activé' : 'Bandeau d\'alertes désactivé');
      // Also update AlertContext if available
      window.dispatchEvent(new CustomEvent('banner-toggle', { detail: val }));
    } catch (e) {
      toast.error('Erreur');
    } finally {
      setBannerLoading(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('settings.profile')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {getInitials(user?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-medium text-lg">{user?.full_name}</h3>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <Badge className="mt-1">{user?.role}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5" />
              {t('settings.appearance')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <Label>{t('settings.theme')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {theme === 'dark' ? t('settings.theme_dark') : t('settings.theme_light')}
                  </p>
                </div>
              </div>
              <Switch
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                data-testid="theme-switch"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="h-5 w-5" />
                <div>
                  <Label>{t('settings.language')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {i18n.language === 'fr' ? 'Français' : 'English'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleLanguage} data-testid="language-btn">
                {i18n.language === 'fr' ? 'EN' : 'FR'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Notifications Email
          </CardTitle>
          <CardDescription>Recevez un email lors de la détection d'une chute</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Recevoir les alertes de chute par email</Label>
              <p className="text-sm text-muted-foreground">
                Un email sera envoyé à <span className="font-medium">{user?.email}</span>
              </p>
            </div>
            <Switch
              checked={emailNotif}
              onCheckedChange={toggleNotif}
              disabled={notifLoading}
              data-testid="email-notif-switch"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {bannerEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
            Bandeau d'alertes
          </CardTitle>
          <CardDescription>Afficher le bandeau d'alertes en haut de toutes les pages</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Activer le bandeau d'alertes global</Label>
              <p className="text-sm text-muted-foreground">
                Affiche les alertes critiques (chutes radar, alertes IA) en temps réel
              </p>
            </div>
            <Switch
              checked={bannerEnabled}
              onCheckedChange={toggleBanner}
              disabled={bannerLoading}
              data-testid="banner-toggle-switch"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Notifications Push Mobile
          </CardTitle>
          <CardDescription>Gérer les alertes envoyées vers l'application mobile OhmGuard</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle global */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Activer les notifications sur tous les appareils</Label>
              <p className="text-sm text-muted-foreground">
                {pushDevices.length === 0
                  ? 'Aucun appareil enregistré — connectez-vous sur l\'appli mobile'
                  : `${pushDevices.length} appareil${pushDevices.length > 1 ? 's' : ''} enregistré${pushDevices.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <Switch
              checked={allPushEnabled}
              onCheckedChange={toggleAllPush}
              disabled={pushToggling || pushDevices.length === 0}
              data-testid="push-notif-switch"
            />
          </div>

          {/* Liste des appareils */}
          {pushLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des appareils…
            </div>
          ) : pushDevices.length > 0 ? (
            <div className="space-y-2 border-t pt-3">
              {pushDevices.map((device, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-xs text-muted-foreground">…{device.token_preview}</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {device.device_type === 'ios' ? 'iOS' : device.device_type === 'android' ? 'Android' : device.device_type}
                    </Badge>
                  </div>
                  <Badge variant={device.notifications_enabled !== false ? 'default' : 'secondary'}>
                    {device.notifications_enabled !== false ? 'Actif' : 'Désactivé'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}

          {/* Bouton test */}
          {pushDevices.some(d => d.notifications_enabled !== false) && (
            <div className="border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await api.post('/test-notification');
                    toast.success('Notification test envoyée sur vos appareils mobiles');
                  } catch {
                    toast.error('Erreur lors de l\'envoi du test');
                  }
                }}
              >
                <Send className="h-4 w-4 mr-2" />
                Envoyer une notification test
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// USERS SETTINGS TAB
// ============================================================================

function UsersSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserSheet, setShowUserSheet] = useState(false);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (selectedClient) loadUsers(); }, [selectedClient]);

  const loadClients = async () => {
    try {
      const response = await api.get('/clients');
      setClients(response.data);
      if (response.data.length > 0 && !selectedClient) {
        setSelectedClient(response.data[0].id);
      }
    } catch (error) {
      toast.error('Erreur lors du chargement des clients');
    }
  };

  const loadUsers = async () => {
    if (!selectedClient) return;
    setLoading(true);
    try {
      const response = await api.get(`/clients/${selectedClient}/users`);
      setUsers(response.data);
    } catch (error) {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await api.delete(`/client-users/${selectedUser.id}`);
      toast.success('Utilisateur supprimé');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleResendWelcome = async (clientUserId, userEmail) => {
    try {
      await api.post(`/client-users/${clientUserId}/resend-welcome`);
      toast.success(`Email de bienvenue renvoyé à ${userEmail}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erreur lors de l'envoi de l'email");
    }
  };

  const handleStatusChange = async (clientUserId, isActive) => {
    try {
      await api.patch(`/client-users/${clientUserId}`, { is_active: isActive });
      toast.success(isActive ? 'Utilisateur activé' : 'Utilisateur désactivé');
      loadUsers();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      user.user_email?.toLowerCase().includes(q) ||
      user.user_full_name?.toLowerCase().includes(q) ||
      user.phone?.toLowerCase().includes(q) ||
      user.job_title?.toLowerCase().includes(q) ||
      user.department?.toLowerCase().includes(q)
    );
  });

  const selectedClientName = clients.find(c => c.id === selectedClient)?.name || '';

  return (
    <div className="space-y-4 mt-4">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-52" data-testid="user-client-select">
              <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map(client => (
                <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
              data-testid="user-search-input"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadUsers} data-testid="user-refresh-btn">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="create-user-btn">
            <UserPlus className="h-4 w-4 mr-2" />
            Nouvel utilisateur
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="py-3 px-4">
          <div className="text-xl font-bold">{users.length}</div>
          <p className="text-xs text-muted-foreground">Total</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <div className="text-xl font-bold text-green-600">{users.filter(u => u.is_active !== false).length}</div>
          <p className="text-xs text-muted-foreground">Actifs</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <div className="text-xl font-bold text-red-600">{users.filter(u => u.role === 'CLIENT_ADMIN').length}</div>
          <p className="text-xs text-muted-foreground">Admins</p>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4">
          <div className="text-xl font-bold text-blue-600">{users.filter(u => (u.scopes_count || 0) > 0).length}</div>
          <p className="text-xs text-muted-foreground">Avec périmètres</p>
        </CardContent></Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>Aucun utilisateur trouvé</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(u => (
                  <TableRow
                    key={u.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setSelectedUser(u); setShowUserSheet(true); }}
                    data-testid={`user-row-${u.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(u.user_full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{u.user_full_name || 'N/A'}</div>
                          <div className="text-xs text-muted-foreground">{u.user_email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{u.job_title || '-'}</div>
                      {u.department && <div className="text-xs text-muted-foreground">{u.department}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_LABELS[u.role]?.color || ''}>
                        {ROLE_LABELS[u.role]?.label || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={u.is_active !== false}
                        onCheckedChange={(val) => { handleStatusChange(u.id, val); }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`user-status-${u.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Renvoyer l'email de bienvenue" onClick={() => handleResendWelcome(u.id, u.user_email)}>
                          <Send className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(u); setShowUserSheet(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(u); setShowDeleteDialog(true); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog - Contact Card Form */}
      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        clientId={selectedClient}
        clientName={selectedClientName}
        onSuccess={loadUsers}
      />

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action retirera {selectedUser?.user_full_name || selectedUser?.user_email} de {selectedClientName}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Detail Sheet */}
      {selectedUser && (
        <UserContactSheet
          user={selectedUser}
          open={showUserSheet}
          onOpenChange={setShowUserSheet}
          clientId={selectedClient}
          onUpdate={loadUsers}
        />
      )}
    </div>
  );
}

// ============================================================================
// CREATE USER DIALOG - Contact Card Form
// ============================================================================

function CreateUserDialog({ open, onOpenChange, clientId, clientName, onSuccess }) {
  const [form, setForm] = useState({
    full_name: '', email: '', role: 'VIEWER',
    phone: '', job_title: '', department: '', notes: ''
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validate = () => {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = 'Nom requis';
    if (!form.email.trim()) errs.email = 'Email requis';
    else if (!validateEmail(form.email)) errs.email = 'Email invalide';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await api.post(`/clients/${clientId}/users`, form);
      const data = res.data;
      if (data.email_sent) {
        toast.success('Utilisateur créé — un email avec le mot de passe temporaire a été envoyé');
      } else {
        toast.warning(`Utilisateur créé mais l'email n'a pas pu être envoyé${data.email_error ? ' : ' + data.email_error : ''}`);
      }
      onOpenChange(false);
      setForm({ full_name: '', email: '', role: 'VIEWER', phone: '', job_title: '', department: '', notes: '' });
      setErrors({});
      onSuccess();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Nouvelle fiche utilisateur
          </DialogTitle>
          <DialogDescription>
            Créer un utilisateur pour {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Identity Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identité</h4>
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1">
                <Label htmlFor="full_name">Nom complet *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="full_name"
                    placeholder="Jean Dupont"
                    value={form.full_name}
                    onChange={(e) => updateField('full_name', e.target.value)}
                    className={`pl-9 ${errors.full_name ? 'border-red-500' : ''}`}
                    data-testid="create-user-fullname"
                  />
                </div>
                {errors.full_name && <p className="text-xs text-red-500">{errors.full_name}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="jean.dupont@example.com"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className={`pl-9 ${errors.email ? 'border-red-500' : ''}`}
                    data-testid="create-user-email"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone">Téléphone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+33 6 12 34 56 78"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="pl-9"
                    data-testid="create-user-phone"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Professional Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Professionnel</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="job_title">Fonction</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="job_title"
                    placeholder="Infirmière"
                    value={form.job_title}
                    onChange={(e) => updateField('job_title', e.target.value)}
                    className="pl-9"
                    data-testid="create-user-jobtitle"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="department">Service</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="department"
                    placeholder="Soins"
                    value={form.department}
                    onChange={(e) => updateField('department', e.target.value)}
                    className="pl-9"
                    data-testid="create-user-department"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="role">Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => updateField('role', v)}>
                <SelectTrigger data-testid="create-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_ADMIN">Administrateur</SelectItem>
                  <SelectItem value="SUPERVISOR">Superviseur</SelectItem>
                  <SelectItem value="OPERATOR">Opérateur</SelectItem>
                  <SelectItem value="VIEWER">Lecteur</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Access Info */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-sm text-blue-800">
              <Mail className="inline h-4 w-4 mr-1.5 -mt-0.5" />
              Un mot de passe temporaire sera généré et envoyé par email à l'utilisateur. Il devra le changer lors de sa première connexion.
            </p>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes">Observations</Label>
            <Textarea
              id="notes"
              placeholder="Notes ou observations..."
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              rows={2}
              data-testid="create-user-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={saving} data-testid="create-user-submit">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Créer l'utilisateur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// USER CONTACT SHEET (View/Edit)
// ============================================================================

function UserContactSheet({ user, open, onOpenChange, clientId, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.user_full_name || '',
        phone: user.phone || '',
        job_title: user.job_title || '',
        department: user.department || '',
        notes: user.notes || '',
        role: user.role
      });
      setEditing(false);
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/client-users/${user.id}`, form);
      toast.success('Fiche mise à jour');
      setEditing(false);
      onUpdate();
    } catch (e) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPw || newPw.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setResettingPw(true);
    try {
      await api.post(`/client-users/${user.id}/reset-password`, { new_password: newPw });
      toast.success('Mot de passe réinitialisé');
      setShowResetPw(false);
      setNewPw('');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setResettingPw(false);
    }
  };

  const Field = ({ icon: Icon, label, value, field, editable = true }) => (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-1 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {editing && editable ? (
          <Input
            value={form[field] || ''}
            onChange={(e) => setForm(prev => ({ ...prev, [field]: e.target.value }))}
            className="mt-1 h-8 text-sm"
          />
        ) : (
          <p className="text-sm font-medium">{value || '-'}</p>
        )}
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(user.user_full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>{user.user_full_name || 'Utilisateur'}</span>
              <p className="text-sm font-normal text-muted-foreground">{user.user_email}</p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Contact Card */}
          <Card>
            <CardHeader className="py-3 px-4 flex-row items-center justify-between">
              <CardTitle className="text-sm">Fiche de contact</CardTitle>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-user-btn">
                  Modifier
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Annuler</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} data-testid="save-user-btn">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enregistrer'}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 divide-y divide-border">
              <Field icon={User} label="Nom complet" value={user.user_full_name} field="full_name" />
              <Field icon={Mail} label="Email" value={user.user_email} field="email" editable={false} />
              <Field icon={Phone} label="Téléphone" value={user.phone} field="phone" />
              <Field icon={Briefcase} label="Fonction" value={user.job_title} field="job_title" />
              <Field icon={Building2} label="Service" value={user.department} field="department" />
              <Field icon={FileText} label="Observations" value={user.notes} field="notes" />
            </CardContent>
          </Card>

          {/* Role */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Rôle & Accès</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Rôle</span>
                <Select
                  value={form.role || user.role}
                  onValueChange={async (val) => {
                    try {
                      await api.patch(`/client-users/${user.id}`, { role: val });
                      toast.success('Rôle mis à jour');
                      setForm(prev => ({ ...prev, role: val }));
                      onUpdate();
                    } catch (e) { toast.error('Erreur'); }
                  }}
                >
                  <SelectTrigger className="w-44" data-testid="user-role-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CLIENT_ADMIN">Administrateur</SelectItem>
                    <SelectItem value="SUPERVISOR">Superviseur</SelectItem>
                    <SelectItem value="OPERATOR">Opérateur</SelectItem>
                    <SelectItem value="VIEWER">Lecteur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm">Compte actif</span>
                <Switch
                  checked={user.is_active !== false}
                  onCheckedChange={async (val) => {
                    try {
                      await api.patch(`/client-users/${user.id}`, { is_active: val });
                      toast.success(val ? 'Activé' : 'Désactivé');
                      onUpdate();
                    } catch (e) { toast.error('Erreur'); }
                  }}
                  data-testid="user-active-switch"
                />
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Périmètres</span>
                <span>{user.scopes_count || 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Modifications permissions</span>
                <span>{user.permissions_count || 0}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Button variant="outline" className="w-full" onClick={() => setShowResetPw(true)} data-testid="reset-password-btn">
            <Key className="h-4 w-4 mr-2" />
            Réinitialiser le mot de passe
          </Button>

          {user.created_at && (
            <p className="text-xs text-center text-muted-foreground">
              Créé le {new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Reset Password Dialog */}
        <Dialog open={showResetPw} onOpenChange={setShowResetPw}>
          <DialogContent aria-describedby="reset-pw-desc">
            <DialogHeader>
              <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
              <DialogDescription id="reset-pw-desc">
                Nouveau mot de passe pour {user.user_full_name || user.user_email}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                type="password"
                placeholder="Minimum 6 caractères"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                data-testid="new-password-input"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowResetPw(false); setNewPw(''); }}>Annuler</Button>
              <Button onClick={handleResetPassword} disabled={resettingPw || !newPw} data-testid="confirm-reset-password-btn">
                {resettingPw ? 'Réinitialisation...' : 'Réinitialiser'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// SMTP SETTINGS TAB
// ============================================================================

function SmtpSettingsTab() {
  const [smtp, setSmtp] = useState({
    host: '', port: 587, username: '', password: '',
    from_email: '', from_name: 'OhmGuard Alerts', use_tls: true, enabled: false
  });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    api.get('/settings/smtp').then(r => setSmtp(r.data)).catch(() => {});
  }, []);

  const saveSmtp = async () => {
    setSmtpLoading(true);
    try {
      await api.put('/settings/smtp', smtp);
      toast.success('Configuration SMTP enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setSmtpLoading(false);
    }
  };

  const testSmtp = async () => {
    setTestLoading(true);
    try {
      await api.post('/settings/smtp/test', smtp);
      toast.success('Email de test envoyé avec succès');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec du test SMTP');
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div className="mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Configuration SMTP
          </CardTitle>
          <CardDescription>Paramétrez le serveur d'envoi d'emails pour les alertes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <Label className="text-base">Activer l'envoi d'emails</Label>
              <p className="text-sm text-muted-foreground">Les emails d'alerte seront envoyés uniquement si activé</p>
            </div>
            <Switch
              checked={smtp.enabled}
              onCheckedChange={(v) => setSmtp(s => ({ ...s, enabled: v }))}
              data-testid="smtp-enabled-switch"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Serveur SMTP</Label>
              <Input placeholder="smtp.example.com" value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} data-testid="smtp-host" />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input type="number" placeholder="587" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: parseInt(e.target.value) || 587 }))} data-testid="smtp-port" />
            </div>
            <div className="space-y-2">
              <Label>Identifiant</Label>
              <Input placeholder="user@example.com" value={smtp.username} onChange={e => setSmtp(s => ({ ...s, username: e.target.value }))} data-testid="smtp-username" />
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input type="password" placeholder="••••••••" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} data-testid="smtp-password" />
            </div>
            <div className="space-y-2">
              <Label>Email expéditeur</Label>
              <Input placeholder="alerts@ohmguard.fr" value={smtp.from_email} onChange={e => setSmtp(s => ({ ...s, from_email: e.target.value }))} data-testid="smtp-from-email" />
            </div>
            <div className="space-y-2">
              <Label>Nom de l'expéditeur</Label>
              <Input placeholder="OhmGuard Alerts" value={smtp.from_name} onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))} data-testid="smtp-from-name" />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Switch checked={smtp.use_tls} onCheckedChange={(v) => setSmtp(s => ({ ...s, use_tls: v }))} data-testid="smtp-tls-switch" />
            <Label>TLS/STARTTLS</Label>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button onClick={saveSmtp} disabled={smtpLoading} data-testid="smtp-save-btn">
              {smtpLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Enregistrer
            </Button>
            <Button variant="outline" onClick={testSmtp} disabled={testLoading || !smtp.host} data-testid="smtp-test-btn">
              {testLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Envoyer un test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// ACTIVE SESSIONS TAB
// ============================================================================

function parseUserAgent(ua) {
  if (!ua) return { browser: 'Inconnu', os: 'Inconnu' };
  let browser = 'Inconnu';
  let os = 'Inconnu';

  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
    if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else os = 'Mobile';
  } else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  return { browser, os };
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `Il y a ${diffD}j`;
}

function ActiveSessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authAPI.sessions();
      setSessions(res.data || []);
    } catch (err) {
      toast.error('Impossible de charger les sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (sessionId) => {
    setRevoking(sessionId);
    try {
      await authAPI.revokeSession(sessionId);
      toast.success('Session révoquée');
      fetchSessions();
    } catch (err) {
      toast.error('Erreur lors de la révocation');
    } finally {
      setRevoking(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      const res = await authAPI.logoutAll();
      toast.success(res.data?.detail || 'Autres sessions déconnectées');
      fetchSessions();
    } catch (err) {
      toast.error('Erreur lors de la déconnexion');
    } finally {
      setRevokingAll(false);
    }
  };

  const otherSessions = sessions.filter(s => !s.is_current);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Sessions actives
            </CardTitle>
            <CardDescription>
              Gérez vos sessions de connexion sur tous vos appareils
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchSessions} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>
            {otherSessions.length > 0 && (
              <Button variant="destructive" size="sm" onClick={handleRevokeAll} disabled={revokingAll}>
                {revokingAll ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <X className="h-4 w-4 mr-1.5" />}
                Déconnecter les autres
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucune session active</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Appareil</TableHead>
                  <TableHead>Adresse IP</TableHead>
                  <TableHead>Dernière activité</TableHead>
                  <TableHead>Connecté depuis</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const { browser, os } = parseUserAgent(session.device_info?.user_agent);
                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{browser} — {os}</div>
                            {session.is_current && (
                              <Badge variant="outline" className="text-xs mt-0.5 border-green-300 text-green-700 bg-green-50">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Session actuelle
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {session.device_info?.ip_address || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {timeAgo(session.last_activity)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {timeAgo(session.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        {!session.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(session.id)}
                            disabled={revoking === session.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {revoking === session.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsPage;
