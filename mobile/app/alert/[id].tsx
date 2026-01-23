// Écran Détail Alerte avec bouton ACQUITTER
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert as RNAlert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import apiClient from '../../src/api/client';
import type { Alert } from '../../src/types';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    loadAlert();
  }, [id]);

  const loadAlert = async () => {
    try {
      const data = await apiClient.getAlert(id!);
      setAlert(data as Alert);
    } catch (err: any) {
      RNAlert.alert('Erreur', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    RNAlert.alert(
      'Confirmer l\'acquittement',
      'Êtes-vous sûr de vouloir acquitter cette alerte ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'ACQUITTER',
          style: 'destructive',
          onPress: async () => {
            setAcknowledging(true);
            try {
              await apiClient.acknowledgeAlert(id!);
              setAlert(prev => prev ? { ...prev, status: 'ACK' } : null);
              RNAlert.alert('Succès', 'Alerte acquittée', [
                { text: 'OK', onPress: () => router.back() }
              ]);
            } catch (err: any) {
              RNAlert.alert('Erreur', err.message);
            } finally {
              setAcknowledging(false);
            }
          },
        },
      ]
    );
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#DC2626" />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Alerte introuvable</Text>
      </View>
    );
  }

  const isNew = alert.status === 'NEW';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Statut */}
        <View style={[styles.statusBanner, isNew ? styles.bannerNew : styles.bannerAck]}>
          <Text style={styles.statusEmoji}>{isNew ? '🚨' : '✓'}</Text>
          <Text style={styles.statusLabel}>
            {isNew ? 'ALERTE EN ATTENTE' : 'ALERTE ACQUITTÉE'}
          </Text>
        </View>

        {/* Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type d'événement</Text>
          <Text style={styles.alertType}>CHUTE DÉTECTÉE</Text>
        </View>

        {/* Date/Heure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date et heure</Text>
          <Text style={styles.sectionValue}>{formatDateTime(alert.timestamp)}</Text>
        </View>

        {/* Localisation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Localisation</Text>
          <Text style={styles.sectionValue}>
            {alert.location_path || 'Non spécifiée'}
          </Text>
          {alert.radar_name && (
            <Text style={styles.radarName}>Radar : {alert.radar_name}</Text>
          )}
        </View>

        {/* Détails localisation */}
        {alert.location && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Détails</Text>
            {alert.location.client_name && (
              <Text style={styles.detailItem}>🏢 {alert.location.client_name}</Text>
            )}
            {alert.location.building_name && (
              <Text style={styles.detailItem}>🏠 {alert.location.building_name}</Text>
            )}
            {alert.location.floor_name && (
              <Text style={styles.detailItem}>📍 {alert.location.floor_name}</Text>
            )}
            {alert.location.room_name && (
              <Text style={styles.detailItem}>🚪 {alert.location.room_name}</Text>
            )}
          </View>
        )}

        {/* Info acquittement */}
        {alert.acknowledged_at && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Acquittement</Text>
            <Text style={styles.sectionValue}>
              {formatDateTime(alert.acknowledged_at)}
            </Text>
            {alert.acknowledged_by && (
              <Text style={styles.acknowledgedBy}>Par : {alert.acknowledged_by}</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bouton ACQUITTER (uniquement si NEW) */}
      {isNew && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={handleAcknowledge}
            disabled={acknowledging}
            activeOpacity={0.8}
          >
            {acknowledging ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.acknowledgeIcon}>✓</Text>
                <Text style={styles.acknowledgeText}>ACQUITTER L'ALERTE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  errorContainer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#888',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    gap: 12,
  },
  bannerNew: {
    backgroundColor: '#7F1D1D',
  },
  bannerAck: {
    backgroundColor: '#14532D',
  },
  statusEmoji: {
    fontSize: 32,
  },
  statusLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionValue: {
    color: '#fff',
    fontSize: 16,
  },
  alertType: {
    color: '#DC2626',
    fontSize: 20,
    fontWeight: 'bold',
  },
  radarName: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  detailItem: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  acknowledgedBy: {
    color: '#666',
    fontSize: 14,
    marginTop: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  acknowledgeButton: {
    backgroundColor: '#DC2626',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  acknowledgeIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  acknowledgeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
