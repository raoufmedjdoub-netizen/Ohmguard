import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getInitials } from '@/lib/utils';
import {
  Settings,
  Sun,
  Moon,
  Globe,
  User
} from 'lucide-react';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(newLang);
  };

  return (
    <div data-testid="settings-page" className="space-y-6">
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
    </div>
  );
}
