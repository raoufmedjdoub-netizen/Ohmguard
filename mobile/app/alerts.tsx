// Écran Liste des Alertes
import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert as RNAlert,
} from 'react-native';
import { router } from 'expo-router';
import { useAlerts } from '../src/hooks/useAlerts';
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useAuth } from '../src/hooks/useAuth';
import { useNotificationSettings } from '../src/hooks/useNotificationSettings';
import { sendLocalNotification } from '../src/services/notifications';
import { colors, spacing, radius } from '../src/theme';
import type { Alert } from '../src/types';

export default function AlertsScreen() {
  const { user, logout } = useAuth();
  const {
    activeAlerts, acknowledgedAlerts, loading, refreshing, error, refresh, addAlert
  } = useAlerts();
  const { enabled: notificationsEnabled, toggling, toggle: toggleNotifications } = useNotificationSettings();

  const handleNewAlert = useCallback((alert: Alert) => {
    addAlert(alert);
    sendLocalNotification(
      'CHUTE DETECTEE',
      `${alert.radar_name || 'Radar'} - ${alert.location_path || 'Localisation inconnue'}`,
      { alertId: alert.id }
    );
  }, [addAlert]);

  const { connected } = useWebSocket(handleNewAlert);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "A l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffMin < 1440) return `Il y a ${Math.floor(diffMin / 60)}h`;
    return date.toLocaleDateString('fr-FR');
  };

  const handleLogout = () => {
    RNAlert.alert('Deconnexion', 'Voulez-vous vous deconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Deconnexion', style: 'destructive', onPress: logout }
    ]);
  };

  const renderAlert = ({ item }: { item: Alert }) => {
    const isNew = item.status === 'NEW';
    return (
      <TouchableOpacity
        style={[styles.alertCard, isNew ? styles.alertNew : styles.alertAck]}
        onPress={() => router.push(`/alert/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.alertHeader}>
          <View style={[styles.statusBadge, isNew ? styles.badgeNew : styles.badgeAck]}>
            <View style={[styles.statusDotSmall, { backgroundColor: isNew ? colors.white : colors.success }]} />
            <Text style={[styles.statusText, !isNew && { color: colors.success }]}>
              {isNew ? 'NOUVELLE' : 'ACQUITTEE'}
            </Text>
          </View>
          <Text style={styles.alertTime}>{formatTime(item.timestamp)}</Text>
        </View>

        <Text style={[styles.alertType, !isNew && { color: colors.textSecondary }]}>
          CHUTE DETECTEE
        </Text>

        <View style={styles.locationRow}>
          <View style={styles.locationDot} />
          <Text style={styles.alertLocation} numberOfLines={1}>
            {item.location_path || item.radar_name || 'Localisation inconnue'}
          </Text>
        </View>

        {isNew && (
          <View style={styles.alertAction}>
            <Text style={styles.alertActionText}>Appuyez pour voir les details</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyCircle}>
        <Text style={styles.emptyCheck}>OK</Text>
      </View>
      <Text style={styles.emptyTitle}>Aucune alerte</Text>
      <Text style={styles.emptySubtitle}>
        Vous serez notifie en cas de detection de chute
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.secondary} />
        <Text style={styles.loadingText}>Chargement des alertes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerBrand}>
            <Text style={styles.headerBrandText}>OG</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>OhmGuard</Text>
            <View style={styles.connectionRow}>
              <View style={[styles.statusDot, connected ? styles.dotConnected : styles.dotDisconnected]} />
              <Text style={styles.headerStatus}>
                {connected ? 'Connecte' : 'Hors ligne'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.notifToggle}>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              disabled={toggling}
              trackColor={{ false: colors.surfaceLight, true: colors.secondary }}
              thumbColor={colors.white}
            />
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Sortir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error banner */}
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={refresh}>
          <Text style={styles.errorBannerText}>Erreur : {error} — Appuyez pour reessayer</Text>
        </TouchableOpacity>
      )}

      {/* Active counter */}
      {activeAlerts.length > 0 && (
        <View style={styles.activeCounter}>
          <View style={styles.activeCounterDot} />
          <Text style={styles.activeCounterText}>
            {activeAlerts.length} alerte{activeAlerts.length > 1 ? 's' : ''} en attente
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={[...activeAlerts, ...acknowledgedAlerts]}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.secondary}
            colors={[colors.secondary]}
          />
        }
        ListEmptyComponent={renderEmpty}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: 14,
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerBrand: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBrandText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerStatus: {
    color: colors.textMuted,
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  notifToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
  },
  logoutText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  // Status dots
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotConnected: {
    backgroundColor: colors.success,
  },
  dotDisconnected: {
    backgroundColor: colors.alertRed,
  },
  // Banners
  errorBanner: {
    backgroundColor: colors.warningAmberBg,
    padding: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.warningAmber,
  },
  errorBannerText: {
    color: '#FDE68A',
    fontSize: 13,
    textAlign: 'center',
  },
  activeCounter: {
    backgroundColor: colors.alertRedBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  activeCounterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  activeCounterText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  // List
  list: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },
  // Alert cards
  alertCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
  },
  alertNew: {
    backgroundColor: '#1C0A0A',
    borderColor: colors.primary,
  },
  alertAck: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeNew: {
    backgroundColor: colors.primary,
  },
  badgeAck: {
    backgroundColor: colors.surfaceLight,
  },
  statusText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertTime: {
    color: colors.textMuted,
    fontSize: 12,
  },
  alertType: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  alertLocation: {
    color: colors.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  alertAction: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#3D1515',
  },
  alertActionText: {
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 13,
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyCheck: {
    color: colors.success,
    fontSize: 24,
    fontWeight: '800',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
});
