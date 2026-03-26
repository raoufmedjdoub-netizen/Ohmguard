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
import api, { authAPI, channelSettingsAPI } from '@/lib/api';
import {
  Sun, Moon, Globe, User, Mail, Send, Loader2, CheckCircle2, Server,
  Users, UserPlus, Search, Shield, MapPin, Eye, Check, X, Trash2,
  RefreshCw, Key, Phone, Briefcase, Building2, FileText, ChevronRight, Bell, BellOff,
  Smartphone, MessageCircle, Radio
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
          {isAdmin && (
            <TabsTrigger value="channels" data-testid="tab-channels">
              <MessageCircle className="h-4 w-4 mr-1.5" />
              Canaux
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
        {isAdmin && (
          <TabsContent value="channels">
            <ChannelSettingsTab />
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

  // Profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || '',
        phone: user.phone || '',
        job_title: user.job_title || '',
        department: user.department || '',
      });
    }
  }, [user]);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      await authAPI.updateProfile(profileForm);
      toast.success('Profil mis à jour');
      setEditingProfile(false);
      window.location.reload();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur lors de la mise à jour');
    } finally {
      setProfileSaving(false);
    }
  };

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
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t('settings.profile')}
            </CardTitle>
            {!editingProfile ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingProfile(true)}>Modifier</Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingProfile(false)}>Annuler</Button>
                <Button size="sm" onClick={handleProfileSave} disabled={profileSaving}>
                  {profileSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enregistrer'}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {getInitials(user?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                {editingProfile ? (
                  <Input
                    value={profileForm.full_name}
                    onChange={(e) => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
                    className="font-medium text-lg h-9"
                    placeholder="Nom complet"
                  />
                ) : (
                  <h3 className="font-medium text-lg">{user?.full_name}</h3>
                )}
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <Badge className="mt-1">{user?.role}</Badge>
              </div>
            </div>
            {editingProfile && (
              <div className="grid grid-cols-1 gap-3 pt-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Téléphone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                      className="pl-9 h-8 text-sm"
                      placeholder="+33 6 12 34 56 78"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fonction</Label>
                    <Input
                      value={profileForm.job_title}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, job_title: e.target.value }))}
                      className="h-8 text-sm"
                      placeholder="Infirmière"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Service</Label>
                    <Input
                      value={profileForm.department}
                      onChange={(e) => setProfileForm(prev => ({ ...prev, department: e.target.value }))}
                      className="h-8 text-sm"
                      placeholder="Soins"
                    />
                  </div>
                </div>
              </div>
            )}
            {!editingProfile && (user?.phone || user?.job_title || user?.department) && (
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground pt-1">
                {user?.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{user.phone}</span>}
                {user?.job_title && <span className="flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{user.job_title}</span>}
                {user?.department && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{user.department}</span>}
              </div>
            )}
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
  const { user: currentUser } = useAuth();
  const canManageUsers = currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'TENANT_ADMIN';
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
          {canManageUsers && (
            <Button size="sm" onClick={() => setShowCreateDialog(true)} data-testid="create-user-btn">
              <UserPlus className="h-4 w-4 mr-2" />
              Nouvel utilisateur
            </Button>
          )}
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
                        disabled={!canManageUsers}
                        data-testid={`user-status-${u.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canManageUsers && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Renvoyer l'email de bienvenue" onClick={() => handleResendWelcome(u.id, u.user_email)}>
                            <Send className="h-4 w-4 text-blue-500" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(u); setShowUserSheet(true); }}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canManageUsers && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedUser(u); setShowDeleteDialog(true); }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
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
          readOnly={!canManageUsers}
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

function UserContactSheet({ user, open, onOpenChange, clientId, onUpdate, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [activeSection, setActiveSection] = useState('contact'); // contact | permissions | scopes

  // Permissions state
  const [permissions, setPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);

  // Scopes state
  const [scopes, setScopes] = useState([]);
  const [scopesLoading, setScopesLoading] = useState(false);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState({});

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
      setActiveSection('contact');
    }
  }, [user]);

  // Load permissions when tab is activated
  useEffect(() => {
    if (activeSection === 'permissions' && user) {
      loadPermissions();
    }
  }, [activeSection, user]);

  // Load scopes when tab is activated
  useEffect(() => {
    if (activeSection === 'scopes' && user) {
      loadScopes();
      loadBuildings();
    }
  }, [activeSection, user]);

  const loadPermissions = async () => {
    setPermissionsLoading(true);
    try {
      const res = await api.get(`/client-users/${user.id}/permissions`);
      setPermissions(res.data);
    } catch (e) {
      toast.error('Erreur chargement permissions');
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadScopes = async () => {
    setScopesLoading(true);
    try {
      const res = await api.get(`/client-users/${user.id}/scopes`);
      setScopes(res.data);
    } catch (e) {
      toast.error('Erreur chargement périmètres');
    } finally {
      setScopesLoading(false);
    }
  };

  const loadBuildings = async () => {
    try {
      const res = await api.get(`/clients/${clientId}/buildings`);
      setBuildings(res.data || []);
      // Load floors for each building
      const floorsMap = {};
      for (const b of (res.data || [])) {
        try {
          const fRes = await api.get(`/buildings/${b.id}/floors`);
          floorsMap[b.id] = fRes.data || [];
        } catch { floorsMap[b.id] = []; }
      }
      setFloors(floorsMap);
    } catch { setBuildings([]); }
  };

  const togglePermission = async (permKey, currentEffect) => {
    setPermSaving(true);
    try {
      // Build overrides: toggle the permission
      const currentOverrides = permissions
        .filter(p => p.override !== null && p.override !== undefined)
        .map(p => ({ client_user_id: user.id, permission_key: p.key, effect: p.override }));

      let newOverrides;
      if (currentEffect === null || currentEffect === undefined) {
        // No override — check if role_default is true or false
        const perm = permissions.find(p => p.key === permKey);
        const newEffect = perm?.role_default ? 'DENY' : 'ALLOW';
        newOverrides = [...currentOverrides.filter(o => o.permission_key !== permKey), { client_user_id: user.id, permission_key: permKey, effect: newEffect }];
      } else {
        // Has override — remove it (revert to role default)
        newOverrides = currentOverrides.filter(o => o.permission_key !== permKey);
      }

      await api.put(`/client-users/${user.id}/permissions`, { overrides: newOverrides });
      await loadPermissions();
      onUpdate();
    } catch (e) {
      toast.error('Erreur modification permission');
    } finally {
      setPermSaving(false);
    }
  };

  const addScope = async (scopeType, locationId) => {
    try {
      const scopeData = { scope_type: scopeType, access_level: 'VIEW' };
      if (scopeType === 'BUILDING') scopeData.building_id = locationId;
      else if (scopeType === 'FLOOR') scopeData.floor_id = locationId;
      await api.post(`/client-users/${user.id}/scopes`, scopeData);
      toast.success('Périmètre ajouté');
      await loadScopes();
      onUpdate();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur ajout périmètre');
    }
  };

  const removeScope = async (scopeId) => {
    try {
      await api.delete(`/scopes/${scopeId}`);
      toast.success('Périmètre retiré');
      await loadScopes();
      onUpdate();
    } catch (e) {
      toast.error('Erreur suppression périmètre');
    }
  };

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

  const ContactField = ({ icon: Icon, label, value, field, editable = true }) => (
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

  // Group permissions by group
  const permissionsByGroup = useMemo(() => {
    const groups = {};
    for (const p of permissions) {
      if (!groups[p.group]) groups[p.group] = [];
      groups[p.group].push(p);
    }
    return groups;
  }, [permissions]);

  const GROUP_ICONS = { Pages: Globe, Events: Bell, Devices: Smartphone, Admin: Shield, System: Server };
  const GROUP_LABELS = { Pages: 'Pages', Events: 'Événements', Devices: 'Capteurs', Admin: 'Administration', System: 'Système' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(user.user_full_name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span>{user.user_full_name || 'Utilisateur'}</span>
              <p className="text-sm font-normal text-muted-foreground">{user.user_email}</p>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">Détails de l'utilisateur</DialogDescription>
        </DialogHeader>

        {/* Section tabs */}
        <div className="flex gap-1 mt-4 border-b">
          {[
            { key: 'contact', label: 'Profil', icon: User },
            { key: 'permissions', label: 'Permissions', icon: Shield },
            { key: 'scopes', label: 'Périmètres', icon: MapPin },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeSection === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-4">
          {/* ==================== CONTACT / PROFILE ==================== */}
          {activeSection === 'contact' && (
            <>
              <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="py-3 px-4 flex-row items-center justify-between">
                  <CardTitle className="text-sm">Fiche de contact</CardTitle>
                  {!editing ? (
                    !readOnly && <Button variant="ghost" size="sm" onClick={() => setEditing(true)} data-testid="edit-user-btn">
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
                  <ContactField icon={User} label="Nom complet" value={user.user_full_name} field="full_name" />
                  <ContactField icon={Mail} label="Email" value={user.user_email} field="email" editable={false} />
                  <ContactField icon={Phone} label="Téléphone" value={user.phone} field="phone" />
                  <ContactField icon={Briefcase} label="Fonction" value={user.job_title} field="job_title" />
                  <ContactField icon={Building2} label="Service" value={user.department} field="department" />
                  <ContactField icon={FileText} label="Observations" value={user.notes} field="notes" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Rôle & Accès</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Rôle</span>
                    <Select
                      value={form.role || user.role}
                      disabled={readOnly}
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
                      disabled={readOnly}
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
                </CardContent>
              </Card>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {!readOnly && (
                  <Button variant="outline" onClick={() => setShowResetPw(true)} data-testid="reset-password-btn">
                    <Key className="h-4 w-4 mr-2" />
                    Réinitialiser le mot de passe
                  </Button>
                )}
                {user.created_at && (
                  <p className="text-xs text-muted-foreground">
                    Créé le {new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ==================== PERMISSIONS ==================== */}
          {activeSection === 'permissions' && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <Shield className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                Les permissions par défaut dépendent du rôle (<strong>{ROLE_LABELS[form.role || user.role]?.label}</strong>).
                Vous pouvez personnaliser en activant/désactivant individuellement.
              </div>

              {permissionsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid md:grid-cols-2 gap-4">
                {Object.entries(permissionsByGroup).map(([group, perms]) => {
                  const GroupIcon = GROUP_ICONS[group] || Shield;
                  return (
                    <Card key={group}>
                      <CardHeader className="py-2.5 px-4">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                          <GroupIcon className="h-3.5 w-3.5" />
                          {GROUP_LABELS[group] || group}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-0 divide-y divide-border">
                        {perms.map(p => {
                          const isOverridden = p.override !== null && p.override !== undefined;
                          const effective = p.effective;
                          return (
                            <div key={p.key} className="flex items-center justify-between py-2">
                              <div className="flex-1 min-w-0 pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm">{p.label}</span>
                                  {isOverridden && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 text-amber-700 bg-amber-50">
                                      personnalisé
                                    </Badge>
                                  )}
                                </div>
                                {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                              </div>
                              <Switch
                                checked={effective}
                                disabled={permSaving || readOnly}
                                onCheckedChange={() => togglePermission(p.key, p.override)}
                              />
                            </div>
                          );
                        })}
                      </CardContent>
                    </Card>
                  );
                })}
                </div>
              )}
            </>
          )}

          {/* ==================== SCOPES ==================== */}
          {activeSection === 'scopes' && (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <MapPin className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                Définissez les bâtiments et étages auxquels cet utilisateur a accès.
                Sans périmètre, l'utilisateur voit tout.
              </div>

              <div className="grid md:grid-cols-2 gap-4">
              {/* Current scopes */}
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Périmètres actifs ({scopes.length})</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {scopesLoading ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : scopes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucun périmètre — accès complet à l'organisation
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {scopes.map(s => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{s.display_path || s.building_name || s.floor_name || s.scope_type}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.scope_type === 'BUILDING' ? 'Bâtiment' : s.scope_type === 'FLOOR' ? 'Étage' : s.scope_type === 'ROOM' ? 'Chambre' : s.scope_type}
                                {' — '}{s.access_level === 'MANAGE' ? 'Gestion' : 'Lecture'}
                              </p>
                            </div>
                          </div>
                          {!readOnly && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeScope(s.id)}>
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Add scopes */}
              {!readOnly && <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Ajouter un périmètre</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {buildings.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">Aucun bâtiment disponible</p>
                  ) : (
                    buildings.map(b => {
                      const bScoped = scopes.some(s => s.scope_type === 'BUILDING' && s.building_id === b.id);
                      const bFloors = floors[b.id] || [];
                      return (
                        <div key={b.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{b.name}</span>
                            {!bScoped && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addScope('BUILDING', b.id)}>
                                + Bâtiment entier
                              </Button>
                            )}
                            {bScoped && (
                              <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                                <Check className="h-3 w-3 mr-1" /> Ajouté
                              </Badge>
                            )}
                          </div>
                          {!bScoped && bFloors.length > 0 && (
                            <div className="ml-4 space-y-1">
                              {bFloors.map(f => {
                                const fScoped = scopes.some(s => s.scope_type === 'FLOOR' && s.floor_id === f.id);
                                return (
                                  <div key={f.id} className="flex items-center justify-between py-0.5">
                                    <span className="text-xs text-muted-foreground">{f.name}</span>
                                    {!fScoped ? (
                                      <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => addScope('FLOOR', f.id)}>
                                        + Étage
                                      </Button>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">
                                        <Check className="h-2.5 w-2.5 mr-0.5" /> Ajouté
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>}
              </div>
            </>
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
      </DialogContent>
    </Dialog>
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
// CHANNEL SETTINGS TAB (Twilio SMS/WhatsApp + Telegram)
// ============================================================================

function ChannelSettingsTab() {
  const [twilio, setTwilio] = useState({
    account_sid: '', auth_token: '', from_number: '', whatsapp_from_number: '', enabled: false
  });
  const [telegram, setTelegram] = useState({ bot_token: '', enabled: false });
  const [twilioLoading, setTwilioLoading] = useState(false);
  const [telegramLoading, setTelegramLoading] = useState(false);

  useEffect(() => {
    channelSettingsAPI.getTwilio().then(r => setTwilio(r.data)).catch(() => {});
    channelSettingsAPI.getTelegram().then(r => setTelegram(r.data)).catch(() => {});
  }, []);

  const saveTwilio = async () => {
    setTwilioLoading(true);
    try {
      await channelSettingsAPI.updateTwilio(twilio);
      toast.success('Configuration Twilio enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setTwilioLoading(false);
    }
  };

  const saveTelegram = async () => {
    setTelegramLoading(true);
    try {
      await channelSettingsAPI.updateTelegram(telegram);
      toast.success('Configuration Telegram enregistrée');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setTelegramLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
        <MessageCircle className="inline h-4 w-4 mr-1.5 -mt-0.5" />
        Configurez les canaux de notification pour les alertes cascadées aux contacts d'urgence des chambres.
        Les canaux activés seront disponibles lors de la création de contacts.
      </div>

      {/* Twilio (SMS + WhatsApp) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone className="h-5 w-5 text-green-600" />
            Twilio — SMS & WhatsApp
          </CardTitle>
          <CardDescription>
            Envoi de SMS et messages WhatsApp via l'API Twilio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={twilio.enabled}
              onCheckedChange={(v) => setTwilio(s => ({ ...s, enabled: v }))}
            />
            <Label>{twilio.enabled ? 'Activé' : 'Désactivé'}</Label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Account SID</Label>
              <Input
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={twilio.account_sid}
                onChange={e => setTwilio(s => ({ ...s, account_sid: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Auth Token</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={twilio.auth_token}
                onChange={e => setTwilio(s => ({ ...s, auth_token: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Numéro SMS (From)</Label>
              <Input
                placeholder="+33 1 23 45 67 89"
                value={twilio.from_number}
                onChange={e => setTwilio(s => ({ ...s, from_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Numéro WhatsApp (From)</Label>
              <Input
                placeholder="+33 1 23 45 67 89"
                value={twilio.whatsapp_from_number}
                onChange={e => setTwilio(s => ({ ...s, whatsapp_from_number: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <Button onClick={saveTwilio} disabled={twilioLoading}>
              {twilioLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-blue-500" />
            Telegram Bot
          </CardTitle>
          <CardDescription>
            Envoi de messages Telegram via un Bot API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={telegram.enabled}
              onCheckedChange={(v) => setTelegram(s => ({ ...s, enabled: v }))}
            />
            <Label>{telegram.enabled ? 'Activé' : 'Désactivé'}</Label>
          </div>

          <div className="space-y-2">
            <Label>Bot Token</Label>
            <Input
              type="password"
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              value={telegram.bot_token}
              onChange={e => setTelegram(s => ({ ...s, bot_token: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Créez un bot via @BotFather sur Telegram pour obtenir un token
            </p>
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <Button onClick={saveTelegram} disabled={telegramLoading}>
              {telegramLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Enregistrer
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
