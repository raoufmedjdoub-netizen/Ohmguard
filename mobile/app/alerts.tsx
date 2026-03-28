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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAlerts, AlertFilter } from '../src/hooks/useAlerts';
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useAuth } from '../src/hooks/useAuth';
import { useNotificationSettings } from '../src/hooks/useNotificationSettings';
import { sendLocalNotification } from '../src/services/notifications';
import { colors, spacing, radius } from '../src/theme';
import type { Alert } from '../src/types';

const FILTERS: { key: AlertFilter; label: string }[] = [
  { key: 'ALL', label: 'Toutes' },
  { key: 'NEW', label: 'En cours' },
  { key: 'ACKNOWLEDGED', label: 'Traitees' },
];

export default function AlertsScreen() {
  const { ackedId } = useLocalSearchParams<{ ackedId?: string }>();
  const { user, logout } = useAuth();
  const {
    alerts: filteredAlerts, allAlerts, activeAlerts,
    loading, refreshing, error, filter, setFilter,
    hasMore, loadingMore, refresh, loadMore, addAlert, updateAlert
  } = useAlerts();
  const { enabled: notificationsEnabled, toggling, toggle: toggleNotifications } = useNotificationSettings();

  // Update alert status locally when returning from ack
  useFocusEffect(
    useCallback(() => {
      if (ackedId) {
        updateAlert(ackedId, { status: 'ACKNOWLEDGED', acknowledged_at: new Date().toISOString() });
      }
    }, [ackedId])
  );

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
        style={styles.alertCard}
        onPress={() => router.push(`/alert/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.alertHeader}>
          <View style={styles.alertBadges}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>Chute suspecte</Text>
            </View>
            <View style={[styles.severityBadge, { backgroundColor: '#0EA5E920', borderColor: '#0EA5E9' }]}>
              <Text style={[styles.severityBadgeText, { color: '#0EA5E9' }]}>MED</Text>
            </View>
          </View>
          <View style={styles.alertRight}>
            <View style={[styles.statusBadgeSmall,
              isNew ? styles.statusNew :
              (item.status === 'ACK' || item.status === 'ACKNOWLEDGED') ? { borderColor: '#0EA5E9', backgroundColor: '#EFF6FF' } :
              item.status === 'RESOLVED' ? { borderColor: '#22C55E', backgroundColor: '#F0FFF4' } :
              { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }
            ]}>
              <Text style={[styles.statusBadgeSmallText,
                isNew ? { color: '#22C55E' } :
                (item.status === 'ACK' || item.status === 'ACKNOWLEDGED') ? { color: '#0EA5E9' } :
                item.status === 'RESOLVED' ? { color: '#22C55E' } :
                { color: '#F59E0B' }
              ]}>
                {isNew ? 'Nouveau' :
                 (item.status === 'ACK' || item.status === 'ACKNOWLEDGED') ? 'Pris en charge' :
                 item.status === 'RESOLVED' ? 'Resolu' : 'Fausse alarme'}
              </Text>
            </View>
            <Text style={styles.alertTime}>{formatTime(item.timestamp)}</Text>
          </View>
        </View>

        <Text style={styles.alertLocation} numberOfLines={1}>
          {item.location_path || item.radar_name || 'Localisation inconnue'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.secondary} />
        <Text style={styles.footerLoaderText}>Chargement...</Text>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyCircle}>
        <Text style={styles.emptyCheck}>OK</Text>
      </View>
      <Text style={styles.emptyTitle}>
        {filter === 'NEW' ? 'Aucune alerte en attente' :
         filter === 'ACKNOWLEDGED' ? 'Aucune alerte acquittee' :
         'Aucune alerte'}
      </Text>
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
        <TouchableOpacity
          style={styles.headerLeft}
          onPress={() => router.push('/profile')}
          activeOpacity={0.7}
        >
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
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            disabled={toggling}
            trackColor={{ false: colors.surfaceLight, true: colors.secondary }}
            thumbColor={colors.white}
          />
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

      {/* Filter tabs */}
      <View style={styles.filterBar}>
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          const count = f.key === 'ALL' ? allAlerts.length :
                        f.key === 'NEW' ? activeAlerts.length :
                        allAlerts.filter(a => a.status !== 'NEW').length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {f.label}
              </Text>
              <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* List */}
      <FlatList
        data={filteredAlerts}
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
        ListFooterComponent={renderFooter}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={hasMore && !loadingMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md, fontSize: 14 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerBrand: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' },
  headerBrandText: { color: colors.white, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  headerTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '700' },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerStatus: { color: colors.textMuted, fontSize: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoutBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surfaceLight, borderRadius: radius.sm },
  logoutText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },

  // Status dots
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotSmall: { width: 6, height: 6, borderRadius: 3 },
  dotConnected: { backgroundColor: colors.success },
  dotDisconnected: { backgroundColor: colors.alertRed },

  // Banners
  errorBanner: { backgroundColor: colors.warningAmberBg, padding: spacing.md, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.warningAmber },
  errorBannerText: { color: '#92400E', fontSize: 13, textAlign: 'center' },
  activeCounter: { backgroundColor: colors.alertRedBg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  activeCounterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  activeCounterText: { color: '#991B1B', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },

  // Filter tabs
  filterBar: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, backgroundColor: colors.surfaceLight },
  filterTabActive: { backgroundColor: colors.secondary },
  filterTabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: colors.white },
  filterCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  filterCountTextActive: { color: colors.white },

  // List
  list: { padding: spacing.md, paddingBottom: spacing.xl },
  separator: { height: spacing.sm },
  footerLoader: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  footerLoaderText: { color: colors.textMuted, fontSize: 13 },

  // Alert cards — aligned with web platform
  alertCard: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  alertBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 4 },
  typeBadgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1 },
  severityBadgeText: { fontSize: 11, fontWeight: '700' },
  alertRight: { alignItems: 'flex-end', gap: 4 },
  statusBadgeSmall: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  statusNew: { borderColor: '#22C55E', backgroundColor: '#22C55E20' },
  statusAck: { borderColor: colors.border, backgroundColor: colors.surfaceLight },
  statusBadgeSmallText: { fontSize: 11, fontWeight: '600' },
  alertTime: { color: colors.textMuted, fontSize: 12 },
  alertLocation: { color: colors.textSecondary, fontSize: 14 },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surfaceLight, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
  emptyCheck: { color: colors.success, fontSize: 24, fontWeight: '800' },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: spacing.xs },
  emptySubtitle: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
});
