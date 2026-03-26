// Écran Détail Alerte
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
import { colors, spacing, radius } from '../../src/theme';
import type { Alert } from '../../src/types';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => { loadAlert(); }, [id]);

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
      'Confirmez-vous la prise en charge de cette alerte ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'ACQUITTER',
          style: 'destructive',
          onPress: async () => {
            setAcknowledging(true);
            try {
              await apiClient.acknowledgeAlert(id!);
              setAlert(prev => prev ? { ...prev, status: 'ACKNOWLEDGED' } : null);
              RNAlert.alert('Alerte acquittee', 'La prise en charge a ete enregistree.', [
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
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!alert) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Alerte introuvable</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isNew = alert.status === 'NEW';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* Status banner */}
        <View style={[styles.statusBanner, isNew ? styles.bannerNew : styles.bannerAck]}>
          <View style={[styles.statusIndicator, { backgroundColor: isNew ? colors.primary : colors.success }]} />
          <Text style={styles.statusLabel}>
            {isNew ? 'ALERTE EN ATTENTE' : 'ALERTE ACQUITTEE'}
          </Text>
        </View>

        {/* Type */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TYPE D'EVENEMENT</Text>
          <Text style={[styles.alertType, { color: isNew ? colors.primary : colors.textSecondary }]}>
            CHUTE DETECTEE
          </Text>
        </View>

        {/* Date/Heure */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DATE ET HEURE</Text>
          <Text style={styles.sectionValue}>{formatDateTime(alert.timestamp)}</Text>
        </View>

        {/* Localisation */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LOCALISATION</Text>
          <Text style={styles.sectionValue}>
            {alert.location_path || 'Non specifiee'}
          </Text>
          {alert.radar_name && (
            <View style={styles.radarRow}>
              <View style={styles.radarDot} />
              <Text style={styles.radarName}>{alert.radar_name}</Text>
            </View>
          )}
        </View>

        {/* Location details */}
        {alert.location && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DETAILS</Text>
            {alert.location.client_name && (
              <DetailRow label="Organisation" value={alert.location.client_name} />
            )}
            {alert.location.building_name && (
              <DetailRow label="Batiment" value={alert.location.building_name} />
            )}
            {alert.location.floor_name && (
              <DetailRow label="Etage" value={alert.location.floor_name} />
            )}
            {alert.location.room_name && (
              <DetailRow label="Chambre" value={alert.location.room_name} />
            )}
          </View>
        )}

        {/* Acknowledgment info */}
        {alert.acknowledged_at && (
          <View style={[styles.section, styles.sectionSuccess]}>
            <Text style={styles.sectionLabel}>ACQUITTEMENT</Text>
            <Text style={styles.sectionValue}>{formatDateTime(alert.acknowledged_at)}</Text>
            {alert.acknowledged_by && (
              <Text style={styles.acknowledgedBy}>Par : {alert.acknowledged_by}</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Acknowledge button */}
      {isNew && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={handleAcknowledge}
            disabled={acknowledging}
            activeOpacity={0.8}
          >
            {acknowledging ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.acknowledgeText}>ACQUITTER L'ALERTE</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={detailStyles.row}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  value: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});

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
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  backBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.sm,
  },
  backBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 120,
  },
  // Status banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  bannerNew: {
    backgroundColor: '#1C0A0A',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  bannerAck: {
    backgroundColor: '#0A1C0A',
    borderWidth: 1,
    borderColor: colors.success,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  // Sections
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionSuccess: {
    borderColor: colors.success,
    backgroundColor: '#0A1C0A',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  sectionValue: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  alertType: {
    fontSize: 20,
    fontWeight: '800',
  },
  radarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  radarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
  },
  radarName: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  acknowledgedBy: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  acknowledgeButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acknowledgeText: {
    color: colors.white,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
