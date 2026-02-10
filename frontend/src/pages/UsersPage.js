/**
 * UsersPage - User Management with RBAC
 * =====================================
 * 
 * Features:
 * - List users with roles and status
 * - Create/edit users
 * - Manage permissions (with override support)
 * - Manage location scopes
 * - View effective access summary
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, Plus, Search, Shield, MapPin, Eye, 
  Check, X, UserPlus, Trash2, RefreshCw, Key
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { usePageActions } from '../contexts/PageActionsContext';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

import api from '../lib/api';

// Role labels
const ROLE_LABELS = {
  CLIENT_ADMIN: { label: 'Administrateur', color: 'bg-red-100 text-red-800 border-red-200' },
  SUPERVISOR: { label: 'Superviseur', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  OPERATOR: { label: 'Opérateur', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  VIEWER: { label: 'Lecteur', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  SUPER_ADMIN: { label: 'Super Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  TENANT_ADMIN: { label: 'Admin Tenant', color: 'bg-red-100 text-red-800 border-red-200' },
};

// Scope type labels
const SCOPE_TYPE_LABELS = {
  CLIENT: 'Client (tout)',
  BUILDING: 'Bâtiment',
  FLOOR: 'Étage',
  ZONE: 'Zone',
  ROOM: 'Chambre',
  ROOM_SPACE: 'Sous-espace',
};

// Access level labels
const ACCESS_LEVEL_LABELS = {
  VIEW: { label: 'Lecture', color: 'bg-blue-100 text-blue-800' },
  MANAGE: { label: 'Gestion', color: 'bg-green-100 text-green-800' },
};

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserSheet, setShowUserSheet] = useState(false);
  
  // Form state
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'VIEWER'
  });

  // Load clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  // Load users when client changes
  useEffect(() => {
    if (selectedClient) {
      loadUsers();
    }
  }, [selectedClient]);

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
      console.error('Error loading users:', error);
      // Fallback to empty array if endpoint doesn't exist yet
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.full_name || !newUser.password) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    try {
      await api.post(`/clients/${selectedClient}/users`, newUser);
      toast.success('Utilisateur créé avec succès');
      setShowCreateDialog(false);
      setNewUser({ email: '', full_name: '', password: '', role: 'VIEWER' });
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la création');
    }
  };

  const handleUpdateUserStatus = async (clientUserId, isActive) => {
    try {
      await api.patch(`/client-users/${clientUserId}`, { is_active: isActive });
      toast.success(isActive ? 'Utilisateur activé' : 'Utilisateur désactivé');
      loadUsers();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleUpdateUserRole = async (clientUserId, newRole) => {
    try {
      await api.patch(`/client-users/${clientUserId}`, { role: newRole });
      toast.success('Rôle mis à jour');
      loadUsers();
      if (selectedUser?.id === clientUserId) {
        setSelectedUser({ ...selectedUser, role: newRole });
      }
    } catch (error) {
      toast.error('Erreur lors de la mise à jour du rôle');
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

  const openUserDetail = (user) => {
    setSelectedUser(user);
    setShowUserSheet(true);
  };

  // Filter users by search
  const filteredUsers = users.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.user_email?.toLowerCase().includes(query) ||
      user.user_full_name?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query)
    );
  });

  const selectedClientName = clients.find(c => c.id === selectedClient)?.name || '';

  return (
    <div className="space-y-6" data-testid="users-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Gestion des Utilisateurs
          </h1>
          <p className="text-muted-foreground mt-1">
            Gérez les accès et les permissions des utilisateurs
          </p>
        </div>
        
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-user-btn">
          <UserPlus className="h-4 w-4 mr-2" />
          Nouvel utilisateur
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Client selector */}
            <div className="w-full sm:w-64">
              <Label className="text-sm text-muted-foreground mb-2 block">Client</Label>
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="flex-1">
              <Label className="text-sm text-muted-foreground mb-2 block">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom ou email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Refresh button */}
            <div className="flex items-end">
              <Button variant="outline" onClick={loadUsers}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-sm text-muted-foreground">Total utilisateurs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {users.filter(u => u.is_active !== false).length}
            </div>
            <p className="text-sm text-muted-foreground">Actifs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {users.filter(u => u.role === 'CLIENT_ADMIN').length}
            </div>
            <p className="text-sm text-muted-foreground">Administrateurs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {users.filter(u => (u.scopes_count || 0) > 0).length}
            </div>
            <p className="text-sm text-muted-foreground">Avec périmètres</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Utilisateurs de {selectedClientName}</CardTitle>
          <CardDescription>
            {filteredUsers.length} utilisateur{filteredUsers.length > 1 ? 's' : ''} trouvé{filteredUsers.length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun utilisateur trouvé. Cliquez sur "Nouvel utilisateur" pour en créer un.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Utilisateur</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Périmètres</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(user => (
                  <TableRow 
                    key={user.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openUserDetail(user)}
                    data-testid={`user-row-${user.id}`}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{user.user_full_name || 'N/A'}</div>
                        <div className="text-sm text-muted-foreground">{user.user_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={ROLE_LABELS[user.role]?.color || ''}
                      >
                        {ROLE_LABELS[user.role]?.label || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.is_active !== false ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <Check className="h-3 w-3 mr-1" />
                          Actif
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <X className="h-3 w-3 mr-1" />
                          Inactif
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <span>{user.permissions_count || 0} modif.</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{user.scopes_count || 0} périmètre{(user.scopes_count || 0) > 1 ? 's' : ''}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openUserDetail(user)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDeleteDialog(true);
                          }}
                        >
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

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvel utilisateur</DialogTitle>
            <DialogDescription>
              Créer un nouvel utilisateur pour {selectedClientName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input
                placeholder="Jean Dupont"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select
                value={newUser.role}
                onValueChange={(value) => setNewUser({ ...newUser, role: value })}
              >
                <SelectTrigger>
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
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateUser}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action retirera {selectedUser?.user_full_name || selectedUser?.user_email} de ce client.
              L'utilisateur ne pourra plus accéder aux données de {selectedClientName}.
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
        <UserDetailSheet
          user={selectedUser}
          open={showUserSheet}
          onOpenChange={setShowUserSheet}
          clientId={selectedClient}
          onRoleChange={handleUpdateUserRole}
          onStatusChange={handleUpdateUserStatus}
          onUpdate={loadUsers}
        />
      )}
    </div>
  );
}

// ============================================================================
// USER DETAIL SHEET COMPONENT
// ============================================================================

function UserDetailSheet({ user, open, onOpenChange, clientId, onRoleChange, onStatusChange, onUpdate }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [permissions, setPermissions] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [effectiveAccess, setEffectiveAccess] = useState(null);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Load data when tab changes
  useEffect(() => {
    if (open && user) {
      if (activeTab === 'permissions') loadPermissions();
      if (activeTab === 'scopes') {
        loadScopes();
        loadLocationHierarchy();
      }
      if (activeTab === 'preview') loadEffectiveAccess();
    }
  }, [open, user, activeTab]);

  const loadPermissions = async () => {
    setLoadingPerms(true);
    try {
      const response = await api.get(`/client-users/${user.id}/permissions`);
      setPermissions(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des permissions');
    } finally {
      setLoadingPerms(false);
    }
  };

  const loadScopes = async () => {
    setLoadingScopes(true);
    try {
      const response = await api.get(`/client-users/${user.id}/scopes`);
      setScopes(response.data);
    } catch (error) {
      toast.error('Erreur lors du chargement des périmètres');
    } finally {
      setLoadingScopes(false);
    }
  };

  const loadEffectiveAccess = async () => {
    try {
      const response = await api.get(`/client-users/${user.id}/effective-access`);
      setEffectiveAccess(response.data);
    } catch (error) {
      console.error('Failed to load effective access:', error);
    }
  };

  const loadLocationHierarchy = async () => {
    try {
      const buildingsRes = await api.get(`/clients/${clientId}/buildings`);
      setBuildings(buildingsRes.data);
    } catch (error) {
      console.error('Failed to load locations:', error);
    }
  };

  const handlePermissionChange = async (permKey, newEffect) => {
    const currentOverrides = permissions
      .filter(p => p.override !== null && p.key !== permKey)
      .map(p => ({ permission_key: p.key, effect: p.override }));
    
    if (newEffect !== 'INHERIT') {
      currentOverrides.push({ permission_key: permKey, effect: newEffect });
    }
    
    try {
      await api.put(`/client-users/${user.id}/permissions`, {
        overrides: currentOverrides
      });
      toast.success('Permissions mises à jour');
      loadPermissions();
      onUpdate();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const handleAddScope = async (scopeData) => {
    try {
      await api.post(`/client-users/${user.id}/scopes`, scopeData);
      toast.success('Périmètre ajouté');
      loadScopes();
      onUpdate();
    } catch (error) {
      toast.error('Erreur lors de l\'ajout');
    }
  };

  const handleRemoveScope = async (scopeId) => {
    try {
      await api.delete(`/scopes/${scopeId}`);
      toast.success('Périmètre supprimé');
      loadScopes();
      onUpdate();
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    
    setResettingPassword(true);
    try {
      await api.post(`/client-users/${user.id}/reset-password`, {
        new_password: newPassword
      });
      toast.success('Mot de passe réinitialisé avec succès');
      setShowResetPasswordDialog(false);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Erreur lors de la réinitialisation');
    } finally {
      setResettingPassword(false);
    }
  };

  const groupedPermissions = permissions.reduce((acc, perm) => {
    const group = perm.group || 'Autre';
    if (!acc[group]) acc[group] = [];
    acc[group].push(perm);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {user.user_full_name || user.user_email}
          </SheetTitle>
          <SheetDescription>
            Gérer les accès et permissions de cet utilisateur
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profil</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="scopes">Périmètres</TabsTrigger>
            <TabsTrigger value="preview">Aperçu</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="text-lg">{user.user_email}</p>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Nom complet</Label>
                <p className="text-lg">{user.user_full_name || 'Non défini'}</p>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Rôle</Label>
                <Select
                  value={user.role}
                  onValueChange={(value) => onRoleChange(user.id, value)}
                >
                  <SelectTrigger className="w-full mt-1">
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
                <div>
                  <Label>Compte actif</Label>
                  <p className="text-sm text-muted-foreground">
                    L'utilisateur peut se connecter
                  </p>
                </div>
                <Switch
                  checked={user.is_active !== false}
                  onCheckedChange={(checked) => onStatusChange(user.id, checked)}
                />
              </div>
              
              <div>
                <Label className="text-muted-foreground">Créé le</Label>
                <p className="text-sm">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }) : 'N/A'}
                </p>
              </div>
              
              {/* Reset Password Button */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowResetPasswordDialog(true)}
                  data-testid="reset-password-btn"
                >
                  <Key className="h-4 w-4 mr-2" />
                  Réinitialiser le mot de passe
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-6 mt-6">
            {loadingPerms ? (
              <div className="text-center py-8 text-muted-foreground">
                Chargement des permissions...
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  Modifiez les permissions pour cet utilisateur. Les surcharges DENY sont prioritaires sur ALLOW.
                </p>
                
                {Object.entries(groupedPermissions).map(([group, perms]) => (
                  <div key={group}>
                    <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-3">
                      {group}
                    </h3>
                    <div className="space-y-2">
                      {perms.map(perm => (
                        <PermissionRow
                          key={perm.key}
                          permission={perm}
                          onChange={handlePermissionChange}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Scopes Tab */}
          <TabsContent value="scopes" className="space-y-6 mt-6">
            {loadingScopes ? (
              <div className="text-center py-8 text-muted-foreground">
                Chargement des périmètres...
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Définissez les emplacements auxquels l'utilisateur peut accéder.
                  Un périmètre Bâtiment inclut automatiquement tous ses étages et chambres.
                </p>
                
                <AddScopeForm
                  buildings={buildings}
                  clientId={clientId}
                  onAdd={handleAddScope}
                />
                
                <div className="space-y-2">
                  <Label>Périmètres actuels</Label>
                  {scopes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                      {user.role === 'CLIENT_ADMIN' 
                        ? 'Administrateur: accès complet (tous les périmètres)'
                        : 'Aucun périmètre défini - l\'utilisateur n\'a accès à aucune donnée'
                      }
                    </p>
                  ) : (
                    scopes.map(scope => (
                      <div
                        key={scope.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{scope.display_path}</p>
                            <p className="text-sm text-muted-foreground">
                              {SCOPE_TYPE_LABELS[scope.scope_type]}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={ACCESS_LEVEL_LABELS[scope.access_level]?.color}>
                            {ACCESS_LEVEL_LABELS[scope.access_level]?.label}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveScope(scope.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Preview Tab */}
          <TabsContent value="preview" className="space-y-6 mt-6">
            {effectiveAccess ? (
              <div className="space-y-6">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">Résumé des accès</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Rôle:</span>
                      <Badge className="ml-2" variant="outline">
                        {ROLE_LABELS[effectiveAccess.role]?.label || effectiveAccess.role}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Accès complet:</span>
                      <span className="ml-2">
                        {effectiveAccess.has_full_client_access ? 'Oui' : 'Non'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Radars accessibles:</span>
                      <span className="ml-2 font-medium">{effectiveAccess.total_accessible_radars}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Bâtiments:</span>
                      <span className="ml-2">{effectiveAccess.scope_summary?.buildings || 0}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Pages autorisées</h3>
                  <div className="flex flex-wrap gap-2">
                    {effectiveAccess.allowed_pages?.map(page => (
                      <Badge key={page} variant="outline" className="bg-green-50 text-green-700">
                        {page.replace('PAGE_', '').replace(/_/g, ' ')}
                      </Badge>
                    ))}
                    {(!effectiveAccess.allowed_pages || effectiveAccess.allowed_pages.length === 0) && (
                      <p className="text-sm text-muted-foreground">Aucune page accessible</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Actions autorisées</h3>
                  <div className="flex flex-wrap gap-2">
                    {effectiveAccess.allowed_actions?.map(action => (
                      <Badge key={action} variant="outline" className="bg-blue-50 text-blue-700">
                        {action.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                    {(!effectiveAccess.allowed_actions || effectiveAccess.allowed_actions.length === 0) && (
                      <p className="text-sm text-muted-foreground">Aucune action autorisée</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Chargement de l'aperçu...
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Reset Password Dialog */}
        <Dialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
              <DialogDescription>
                Définissez un nouveau mot de passe pour {user.user_full_name || user.user_email}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Minimum 6 caractères"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  data-testid="new-password-input"
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowResetPasswordDialog(false);
                  setNewPassword('');
                }}
              >
                Annuler
              </Button>
              <Button 
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword}
                data-testid="confirm-reset-password-btn"
              >
                {resettingPassword ? 'Réinitialisation...' : 'Réinitialiser'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// PERMISSION ROW COMPONENT
// ============================================================================

function PermissionRow({ permission, onChange }) {
  const [value, setValue] = useState(
    permission.override === 'ALLOW' ? 'ALLOW' :
    permission.override === 'DENY' ? 'DENY' :
    'INHERIT'
  );

  const handleChange = (newValue) => {
    setValue(newValue);
    onChange(permission.key, newValue);
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex-1">
        <p className="font-medium text-sm">{permission.label}</p>
        {permission.description && (
          <p className="text-xs text-muted-foreground">{permission.description}</p>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <Badge
          variant="outline"
          className={permission.effective 
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
          }
        >
          {permission.effective ? 'Autorisé' : 'Refusé'}
        </Badge>
        
        <Select value={value} onValueChange={handleChange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INHERIT">
              Par défaut ({permission.role_default ? 'Oui' : 'Non'})
            </SelectItem>
            <SelectItem value="ALLOW">Forcer Oui</SelectItem>
            <SelectItem value="DENY">Forcer Non</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ============================================================================
// ADD SCOPE FORM COMPONENT
// ============================================================================

function AddScopeForm({ buildings, clientId, onAdd }) {
  const [scopeType, setScopeType] = useState('BUILDING');
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [accessLevel, setAccessLevel] = useState('VIEW');
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (selectedBuilding) {
      loadFloors(selectedBuilding);
    } else {
      setFloors([]);
      setSelectedFloor('');
    }
  }, [selectedBuilding]);

  useEffect(() => {
    if (selectedFloor) {
      loadRooms(selectedFloor);
    } else {
      setRooms([]);
      setSelectedRoom('');
    }
  }, [selectedFloor]);

  const loadFloors = async (buildingId) => {
    try {
      const response = await api.get(`/buildings/${buildingId}/floors`);
      setFloors(response.data);
    } catch (error) {
      console.error('Failed to load floors:', error);
    }
  };

  const loadRooms = async (floorId) => {
    try {
      const response = await api.get(`/floors/${floorId}/rooms`);
      setRooms(response.data);
    } catch (error) {
      console.error('Failed to load rooms:', error);
    }
  };

  const handleAdd = () => {
    const scopeData = {
      scope_type: scopeType,
      client_id: clientId,
      building_id: scopeType !== 'CLIENT' ? selectedBuilding : null,
      floor_id: ['FLOOR', 'ROOM', 'ROOM_SPACE'].includes(scopeType) ? selectedFloor : null,
      room_id: ['ROOM', 'ROOM_SPACE'].includes(scopeType) ? selectedRoom : null,
      access_level: accessLevel
    };
    
    onAdd(scopeData);
    
    setScopeType('BUILDING');
    setSelectedBuilding('');
    setSelectedFloor('');
    setSelectedRoom('');
    setAccessLevel('VIEW');
  };

  const canAdd = scopeType === 'CLIENT' || 
    (scopeType === 'BUILDING' && selectedBuilding) ||
    (scopeType === 'FLOOR' && selectedFloor) ||
    (scopeType === 'ROOM' && selectedRoom);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Type de périmètre</Label>
            <Select value={scopeType} onValueChange={setScopeType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLIENT">Client (tout)</SelectItem>
                <SelectItem value="BUILDING">Bâtiment</SelectItem>
                <SelectItem value="FLOOR">Étage</SelectItem>
                <SelectItem value="ROOM">Chambre</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label>Niveau d'accès</Label>
            <Select value={accessLevel} onValueChange={setAccessLevel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIEW">Lecture seule</SelectItem>
                <SelectItem value="MANAGE">Gestion complète</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {scopeType !== 'CLIENT' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Bâtiment</Label>
              <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {buildings.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {['FLOOR', 'ROOM'].includes(scopeType) && (
              <div className="space-y-2">
                <Label>Étage</Label>
                <Select 
                  value={selectedFloor} 
                  onValueChange={setSelectedFloor}
                  disabled={!selectedBuilding}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scopeType === 'ROOM' && (
              <div className="space-y-2">
                <Label>Chambre</Label>
                <Select 
                  value={selectedRoom} 
                  onValueChange={setSelectedRoom}
                  disabled={!selectedFloor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name || `Ch. ${r.room_number}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        <Button onClick={handleAdd} disabled={!canAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Ajouter le périmètre
        </Button>
      </CardContent>
    </Card>
  );
}
