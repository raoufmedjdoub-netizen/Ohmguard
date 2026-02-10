import React, { useState, useEffect, useCallback } from 'react';
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
import { getInitials } from '@/lib/utils';
import { toast } from 'sonner';
import api from '@/lib/api';
import {
  Sun, Moon, Globe, User, Mail, Send, Loader2, CheckCircle2, Server
} from 'lucide-react';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  // SMTP config state
  const [smtp, setSmtp] = useState({
    host: '', port: 587, username: '', password: '',
    from_email: '', from_name: 'OhmGuard Alerts', use_tls: true, enabled: false
  });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  // User notification pref
  const [emailNotif, setEmailNotif] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'TENANT_ADMIN';

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  // Load SMTP config
  useEffect(() => {
    if (isAdmin) {
      api.get('/settings/smtp').then(r => setSmtp(r.data)).catch(() => {});
    }
    api.get('/users/me/notifications').then(r => {
      setEmailNotif(r.data.email_notifications || false);
    }).catch(() => {});
  }, [isAdmin]);

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

  return (
    <div data-testid="settings-page" className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile */}
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

        {/* Appearance */}
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

      {/* Email Notifications Toggle - All users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Notifications Email
          </CardTitle>
          <CardDescription>
            Recevez un email lors de la détection d'une chute
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Recevoir les alertes de chute par email</Label>
              <p className="text-sm text-muted-foreground">
                Un email sera envoyé à <span className="font-medium">{user?.email}</span> lors de chaque chute détectée
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

      {/* SMTP Configuration - Admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Configuration SMTP
            </CardTitle>
            <CardDescription>
              Paramétrez le serveur d'envoi d'emails pour les alertes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <Label className="text-base">Activer l'envoi d'emails</Label>
                <p className="text-sm text-muted-foreground">
                  Les emails d'alerte seront envoyés uniquement si activé
                </p>
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
                <Input
                  placeholder="smtp.example.com"
                  value={smtp.host}
                  onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))}
                  data-testid="smtp-host"
                />
              </div>
              <div className="space-y-2">
                <Label>Port</Label>
                <Input
                  type="number"
                  placeholder="587"
                  value={smtp.port}
                  onChange={e => setSmtp(s => ({ ...s, port: parseInt(e.target.value) || 587 }))}
                  data-testid="smtp-port"
                />
              </div>
              <div className="space-y-2">
                <Label>Identifiant</Label>
                <Input
                  placeholder="user@example.com"
                  value={smtp.username}
                  onChange={e => setSmtp(s => ({ ...s, username: e.target.value }))}
                  data-testid="smtp-username"
                />
              </div>
              <div className="space-y-2">
                <Label>Mot de passe</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={smtp.password}
                  onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))}
                  data-testid="smtp-password"
                />
              </div>
              <div className="space-y-2">
                <Label>Email expéditeur</Label>
                <Input
                  placeholder="alerts@ohmguard.fr"
                  value={smtp.from_email}
                  onChange={e => setSmtp(s => ({ ...s, from_email: e.target.value }))}
                  data-testid="smtp-from-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Nom de l'expéditeur</Label>
                <Input
                  placeholder="OhmGuard Alerts"
                  value={smtp.from_name}
                  onChange={e => setSmtp(s => ({ ...s, from_name: e.target.value }))}
                  data-testid="smtp-from-name"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                <Switch
                  checked={smtp.use_tls}
                  onCheckedChange={(v) => setSmtp(s => ({ ...s, use_tls: v }))}
                  data-testid="smtp-tls-switch"
                />
                <Label>TLS/STARTTLS</Label>
              </div>
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
      )}
    </div>
  );
}

export default SettingsPage;
