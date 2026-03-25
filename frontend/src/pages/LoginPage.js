import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Shield, Loader2, Sun, Moon, AlertCircle, Key, CheckCircle2 } from 'lucide-react';

export function LoginPage() {
  const { t } = useTranslation();
  const { login, isAuthenticated, loading: authLoading, mustChangePassword, clearMustChangePassword } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Change password dialog state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError, setChangePwError] = useState('');

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated && !mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      if (result.mustChangePassword) {
        setCurrentPw(password);
        setShowChangePassword(true);
      } else {
        navigate('/dashboard');
      }
    } else {
      setError(result.error || t('auth.login_error'));
    }

    setLoading(false);
  };

  const handleChangePassword = async () => {
    setChangePwError('');

    if (newPw.length < 6) {
      setChangePwError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (newPw !== confirmPw) {
      setChangePwError('Les mots de passe ne correspondent pas');
      return;
    }

    setChangePwLoading(true);
    try {
      await authAPI.changePassword(currentPw, newPw);
      clearMustChangePassword();
      setShowChangePassword(false);
      navigate('/dashboard');
    } catch (err) {
      setChangePwError(err.response?.data?.detail || 'Erreur lors du changement de mot de passe');
    } finally {
      setChangePwLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative bg-gradient-to-br from-[#1E3A5F] to-[#2563EB]"
    >
      <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />

      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 text-white hover:bg-white/10"
        onClick={toggleTheme}
        data-testid="login-theme-toggle"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </Button>

      <Card className="w-full max-w-md relative z-10 shadow-2xl bg-white" data-testid="login-card">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-[#06B6D4]/10 w-16 h-16 rounded-full flex items-center justify-center">
            <Shield className="h-8 w-8 text-[#06B6D4]" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-[#1E3A5F]">{t('app_name')}</CardTitle>
            <CardDescription className="mt-1">{t('app_tagline')}</CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
                data-testid="login-error"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@ohmguard.io"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="login-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-[#06B6D4] hover:bg-[#0891B2] text-white"
              disabled={loading}
              data-testid="login-submit"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('loading')}
                </>
              ) : (
                t('auth.login')
              )}
            </Button>
          </form>

        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Changement de mot de passe requis
            </DialogTitle>
            <DialogDescription>
              Votre compte utilise un mot de passe temporaire. Veuillez le changer pour continuer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {changePwError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{changePwError}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Minimum 6 caractères"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Retapez le mot de passe"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleChangePassword} disabled={changePwLoading} className="w-full">
              {changePwLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Changer le mot de passe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
