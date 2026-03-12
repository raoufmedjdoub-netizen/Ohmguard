// Écran Liste des Alertes
import { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAlerts } from '../src/hooks/useAlerts';
import { useWebSocket } from '../src/hooks/useWebSocket';
import { useAuth } from '../src/hooks/useAuth';
import { useNotificationSettings } from '../src/hooks/useNotificationSettings';
import { sendLocalNotification } from '../src/services/notifications';
import type { Alert } from '../src/types';

export default function AlertsScreen() {
  const { user, logout } = useAuth();
  const {
    activeAlerts,
    acknowledgedAlerts,
    loading,
    refreshing,
    error,
    refresh,
    addAlert
  } = useAlerts();
  const { enabled: notificationsEnabled, toggling, toggle: toggleNotifications } = useNotificationSettings();

  // Callback pour nouvelles alertes WebSocket
  const handleNewAlert = useCallback((alert: Alert) => {
    addAlert(alert);
    // Notification locale
    sendLocalNotification(
      '🚨 CHUTE DÉTECTÉE',
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
    
    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffMin < 1440) return `Il y a ${Math.floor(diffMin / 60)}h`;
    return date.toLocaleDateString('fr-FR');
  };

  const renderAlert = ({ item }: { item: Alert }) => (
    <TouchableOpacity
      style={[
        styles.alertCard,
        item.status === 'NEW' ? styles.alertNew : styles.alertAck
      ]}
      onPress={() => router.push(`/alert/${item.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.alertHeader}>
        <View style={[
          styles.statusBadge,
          item.status === 'NEW' ? styles.badgeNew : styles.badgeAck
        ]}>
          <Text style={styles.statusText}>
            {item.status === 'NEW' ? '🚨 NOUVELLE' : '✓ ACQUITTÉE'}
          </Text>
        </View>
        <Text style={styles.alertTime}>{formatTime(item.timestamp)}</Text>
      </View>

      <Text style={styles.alertType}>CHUTE DÉTECTÉE</Text>
      
      <Text style={styles.alertLocation}>
        📍 {item.location_path || item.radar_name || 'Localisation inconnue'}
      </Text>

      {item.status === 'NEW' && (
        <View style={styles.alertAction}>
          <Text style={styles.alertActionText}>Appuyez pour acquitter →</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>✓</Text>
      <Text style={styles.emptyTitle}>Aucune alerte</Text>
      <Text style={styles.emptySubtitle}>
        Vous serez notifié en cas de détection de chute
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DC2626" />
        <Text style={styles.loadingText}>Chargement des alertes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header avec statut connexion */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, connected ? styles.dotConnected : styles.dotDisconnected]} />
          <Text style={styles.headerStatus}>
            {connected ? 'Connecté' : 'Hors ligne'}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {/* Toggle notifications */}
          <View style={styles.notifToggle}>
            <Text style={styles.notifToggleLabel}>
              {notificationsEnabled ? '🔔' : '🔕'}
            </Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              disabled={toggling}
              trackColor={{ false: '#444', true: '#DC2626' }}
              thumbColor={notificationsEnabled ? '#fff' : '#888'}
            />
          </View>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Compteur alertes actives */}
      {activeAlerts.length > 0 && (
        <View style={styles.activeCounter}>
          <Text style={styles.activeCounterText}>
            🚨 {activeAlerts.length} alerte{activeAlerts.length > 1 ? 's' : ''} en attente
          </Text>
        </View>
      )}

      {/* Liste */}
      <FlatList
        data={[...activeAlerts, ...acknowledgedAlerts]}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#DC2626"
            colors={['#DC2626']}
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
    backgroundColor: '#111',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotConnected: {
    backgroundColor: '#22C55E',
  },
  dotDisconnected: {
    backgroundColor: '#EF4444',
  },
  headerStatus: {
    color: '#888',
    fontSize: 14,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notifToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifToggleLabel: {
    fontSize: 16,
  },
  logoutBtn: {
    padding: 8,
  },
  logoutText: {
    color: '#888',
    fontSize: 14,
  },
  activeCounter: {
    backgroundColor: '#7F1D1D',
    padding: 12,
    alignItems: 'center',
  },
  activeCounterText: {
    color: '#FCA5A5',
    fontWeight: 'bold',
    fontSize: 16,
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  separator: {
    height: 12,
  },
  alertCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
  },
  alertNew: {
    backgroundColor: '#7F1D1D',
    borderColor: '#DC2626',
  },
  alertAck: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeNew: {
    backgroundColor: '#DC2626',
  },
  badgeAck: {
    backgroundColor: '#333',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  alertTime: {
    color: '#888',
    fontSize: 12,
  },
  alertType: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  alertLocation: {
    color: '#ccc',
    fontSize: 14,
  },
  alertAction: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#DC2626',
  },
  alertActionText: {
    color: '#FCA5A5',
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#666',
    textAlign: 'center',
  },
});
