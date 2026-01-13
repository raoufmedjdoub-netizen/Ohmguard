import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notificationsAPI } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { formatDate } from '../../lib/utils';
import {
  Bell,
  Mail,
  Webhook,
  Loader2
} from 'lucide-react';

const channelIcons = {
  in_app: Bell,
  email: Mail,
  webhook: Webhook
};

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await notificationsAPI.list({ limit: 100 });
        setNotifications(response.data);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div data-testid="notifications-page" className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('notifications.title')}</h1>
          <p className="text-muted-foreground">
            {notifications.length} notifications
          </p>
        </div>
      </div>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              {t('notifications.no_notifications')}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((notification) => {
                const ChannelIcon = channelIcons[notification.channel] || Bell;
                
                return (
                  <div
                    key={notification.id}
                    className="p-4 hover:bg-accent/30 transition-colors"
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <ChannelIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline">{notification.channel}</Badge>
                          <Badge variant="outline" className="text-success">
                            {notification.status}
                          </Badge>
                        </div>
                        <p className="text-sm">{notification.message}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>{t('notifications.recipient')}: {notification.recipient}</span>
                          <span>
                            {formatDate(notification.created_at, i18n.language === 'fr' ? 'fr-FR' : 'en-US')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
