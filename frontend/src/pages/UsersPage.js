import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usersAPI } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn, getInitials } from '../../lib/utils';
import { toast } from 'sonner';
import {
  Users,
  Loader2,
  Shield,
  ShieldCheck,
  User,
  Eye
} from 'lucide-react';

const roleIcons = {
  SUPER_ADMIN: ShieldCheck,
  TENANT_ADMIN: Shield,
  SUPERVISOR: Shield,
  OPERATOR: User,
  VIEWER: Eye
};

const roleColors = {
  SUPER_ADMIN: 'bg-destructive/10 text-destructive',
  TENANT_ADMIN: 'bg-primary/10 text-primary',
  SUPERVISOR: 'bg-secondary/10 text-secondary',
  OPERATOR: 'bg-warning/10 text-warning',
  VIEWER: 'bg-muted text-muted-foreground'
};

export function UsersPage() {
  const { t } = useTranslation();
  const { canManageUsers, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.list();
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateUser = async (userId, updates) => {
    try {
      await usersAPI.update(userId, updates);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
      toast.success(t('users.user_updated'));
    } catch (error) {
      toast.error(t('errors.generic'));
    }
  };

  const getRoleIcon = (role) => {
    const Icon = roleIcons[role] || User;
    return Icon;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="users-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('users.title')}</h1>
            <p className="text-muted-foreground">
              {users.length} {t('users.title').toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('users.no_users')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('users.full_name')}</TableHead>
                  <TableHead>{t('users.email')}</TableHead>
                  <TableHead>{t('users.role')}</TableHead>
                  <TableHead>{t('users.language')}</TableHead>
                  <TableHead>{t('users.is_active')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const RoleIcon = getRoleIcon(user.role);
                  const isCurrentUser = user.id === currentUser?.id;
                  
                  return (
                    <TableRow 
                      key={user.id} 
                      className="table-row-highlight"
                      data-testid={`user-row-${user.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">
                            {user.full_name}
                            {isCurrentUser && (
                              <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        {canManageUsers && !isCurrentUser ? (
                          <Select
                            value={user.role}
                            onValueChange={(v) => handleUpdateUser(user.id, { role: v })}
                          >
                            <SelectTrigger className="w-40" data-testid={`role-select-${user.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SUPER_ADMIN">{t('users.role_super_admin')}</SelectItem>
                              <SelectItem value="TENANT_ADMIN">{t('users.role_tenant_admin')}</SelectItem>
                              <SelectItem value="SUPERVISOR">{t('users.role_supervisor')}</SelectItem>
                              <SelectItem value="OPERATOR">{t('users.role_operator')}</SelectItem>
                              <SelectItem value="VIEWER">{t('users.role_viewer')}</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={cn('gap-1', roleColors[user.role])}>
                            <RoleIcon className="h-3 w-3" />
                            {t(`users.role_${user.role.toLowerCase()}`)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {user.language?.toUpperCase() || 'FR'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canManageUsers && !isCurrentUser ? (
                          <Switch
                            checked={user.is_active}
                            onCheckedChange={(v) => handleUpdateUser(user.id, { is_active: v })}
                            data-testid={`active-switch-${user.id}`}
                          />
                        ) : (
                          <Badge variant={user.is_active ? 'default' : 'secondary'}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
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
