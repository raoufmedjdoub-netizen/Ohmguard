// Écran Détail Alerte — Workflow séquentiel obligatoire
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert as RNAlert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import apiClient from '../../src/api/client';
import { colors, spacing, radius } from '../../src/theme';
import type { Alert } from '../../src/types';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => { loadAlert(); }, [id]);

  const loadAlert = async () => {
    try {
      const data = await apiClient.getAlert(id!);
      setAlert(data);
    } catch (err: any) {
      RNAlert.alert('Erreur', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (status: string, label: string, requireComment: boolean) => {
    if (requireComment && !comment.trim()) {
      RNAlert.alert('Commentaire requis', 'Veuillez ajouter un commentaire pour cette action.');
      return;
    }

    RNAlert.alert(
      `Confirmer : ${label}`,
      `Voulez-vous marquer cette alerte comme "${label}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'CONFIRMER',
          onPress: async () => {
            setProcessing(true);
            try {
              const payload: any = { status };
              if (comment.trim()) payload.comment = comment.trim();
              const updated = await apiClient.updateEvent(id!, payload);
              setAlert(updated);
              setComment('');
              setActionSuccess(label);

              // If resolved/false alarm → return to list after delay
              if (status === 'RESOLVED' || status === 'FALSE_ALARM') {
                setTimeout(() => {
                  router.navigate({ pathname: '/alerts', params: { ackedId: id, newStatus: status } });
                }, 1500);
              } else {
                // ACK → stay on screen, show resolution options
                setTimeout(() => setActionSuccess(null), 1500);
              }
            } catch (err: any) {
              RNAlert.alert('Erreur', err.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const formatDateTime = (timestamp: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDateTimeFull = (timestamp: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
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
  const isAck = alert.status === 'ACK' || alert.status === 'ACKNOWLEDGED';
  const isResolved = alert.status === 'RESOLVED' || alert.status === 'FALSE_ALARM';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>

        {/* Badges */}
        <View style={styles.headerCard}>
          <View style={styles.badgesRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>Chute suspecte</Text>
            </View>
            <View style={[styles.statusBadge,
              isNew ? { borderColor: colors.primary, backgroundColor: '#FFF7ED' } :
              isAck ? { borderColor: '#0EA5E9', backgroundColor: '#EFF6FF' } :
              alert.status === 'RESOLVED' ? { borderColor: '#22C55E', backgroundColor: '#F0FFF4' } :
              { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }
            ]}>
              <Text style={[styles.statusBadgeText,
                isNew ? { color: colors.primary } :
                isAck ? { color: '#0EA5E9' } :
                alert.status === 'RESOLVED' ? { color: '#22C55E' } :
                { color: '#F59E0B' }
              ]}>
                {isNew ? 'Nouveau' : isAck ? 'Pris en charge' : alert.status === 'RESOLVED' ? 'Resolu' : 'Fausse alarme'}
              </Text>
            </View>
          </View>
        </View>

        {/* Detection time */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DETECTION</Text>
          <Text style={styles.sectionValue}>{formatDateTimeFull(alert.timestamp)}</Text>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LOCALISATION</Text>
          <Text style={styles.sectionValue}>{alert.location_path || 'Non specifiee'}</Text>
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
            {alert.location.client_name && <DetailRow label="Organisation" value={alert.location.client_name} />}
            {alert.location.building_name && <DetailRow label="Batiment" value={alert.location.building_name} />}
            {alert.location.floor_name && <DetailRow label="Etage" value={alert.location.floor_name} />}
            {alert.location.room_name && <DetailRow label="Chambre" value={alert.location.room_name} />}
          </View>
        )}

        {/* === PRISE EN CHARGE INFO === */}
        {(isAck || isResolved) && alert.acknowledged_at && (
          <View style={[styles.section, { borderColor: '#0EA5E9' }]}>
            <Text style={styles.sectionLabel}>PRISE EN CHARGE</Text>
            <Text style={styles.sectionValue}>{formatDateTime(alert.acknowledged_at)}</Text>
            {alert.acknowledged_by && <Text style={styles.subText}>Par : {alert.acknowledged_by}</Text>}
            {alert.timestamp && alert.acknowledged_at && (
              <View style={styles.delayRow}>
                <Text style={styles.delayLabel}>Delai de prise en charge</Text>
                <Text style={styles.delayValue}>{formatDelay(alert.timestamp, alert.acknowledged_at)}</Text>
              </View>
            )}
          </View>
        )}

        {/* === RESOLUTION INFO === */}
        {isResolved && alert.resolved_at && (
          <View style={[styles.section, { borderColor: alert.status === 'RESOLVED' ? '#22C55E' : '#F59E0B' }]}>
            <Text style={styles.sectionLabel}>
              {alert.status === 'RESOLVED' ? 'RESOLUTION' : 'FAUSSE ALARME'}
            </Text>
            <Text style={styles.sectionValue}>{formatDateTime(alert.resolved_at)}</Text>
            {alert.resolved_by && <Text style={styles.subText}>Par : {alert.resolved_by}</Text>}
            {alert.acknowledged_at && alert.resolved_at && (
              <View style={styles.delayRow}>
                <Text style={styles.delayLabel}>Delai d'intervention</Text>
                <Text style={styles.delayValue}>{formatDelay(alert.acknowledged_at, alert.resolved_at)}</Text>
              </View>
            )}
            {alert.timestamp && alert.resolved_at && (
              <View style={styles.delayRow}>
                <Text style={styles.delayLabel}>Delai total</Text>
                <Text style={[styles.delayValue, { fontWeight: '800' }]}>{formatDelay(alert.timestamp, alert.resolved_at)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Comments */}
        {alert.comments && alert.comments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>COMMENTAIRES</Text>
            {alert.comments.map((c: any, i: number) => (
              <View key={c.id || i} style={styles.commentItem}>
                <Text style={styles.commentAuthor}>{c.user_name} — {formatDateTime(c.created_at)}</Text>
                <Text style={styles.commentText}>{c.text}</Text>
              </View>
            ))}
          </View>
        )}

        {/* === ÉTAPE 1 : PRISE EN CHARGE (si NEW) === */}
        {isNew && !actionSuccess && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACTION REQUISE</Text>
            <Text style={styles.actionDesc}>
              Confirmez la prise en charge de cette alerte pour signaler que vous vous en occupez.
            </Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Commentaire (optionnel)"
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#0EA5E9' }]}
              onPress={() => handleAction('ACK', 'Prise en charge', false)}
              disabled={processing}
              activeOpacity={0.8}
            >
              {processing ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.actionButtonText}>PRISE EN CHARGE</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* === ÉTAPE 2 : RÉSOLUTION (si ACK) === */}
        {isAck && !actionSuccess && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>RESOLUTION REQUISE</Text>
            <Text style={styles.actionDesc}>
              L'alerte est prise en charge. Selectionnez le resultat de votre intervention.
            </Text>
            <TextInput
              style={styles.commentInput}
              placeholder="Commentaire (obligatoire)"
              placeholderTextColor={colors.textMuted}
              value={comment}
              onChangeText={setComment}
              multiline
              numberOfLines={3}
            />
            <View style={styles.resolutionButtons}>
              <TouchableOpacity
                style={[styles.resolutionBtn, { borderColor: '#22C55E', borderLeftWidth: 4 }]}
                onPress={() => handleAction('RESOLVED', 'Resolu', true)}
                disabled={processing}
                activeOpacity={0.7}
              >
                <Text style={[styles.resolutionBtnLabel, { color: '#22C55E' }]}>Resoudre</Text>
                <Text style={styles.resolutionBtnDesc}>L'intervention est terminee</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resolutionBtn, { borderColor: '#F59E0B', borderLeftWidth: 4 }]}
                onPress={() => handleAction('FALSE_ALARM', 'Fausse alarme', true)}
                disabled={processing}
                activeOpacity={0.7}
              >
                <Text style={[styles.resolutionBtnLabel, { color: '#F59E0B' }]}>Fausse alarme</Text>
                <Text style={styles.resolutionBtnDesc}>Ce n'est pas une vraie chute</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Success banner */}
      {actionSuccess && (
        <View style={styles.successBanner}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>{actionSuccess}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function formatDelay(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return '-';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '< 1 min';
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  errorText: { color: colors.textSecondary, fontSize: 16 },
  backBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.surfaceLight, borderRadius: radius.sm },
  backBtnText: { color: colors.textPrimary, fontWeight: '600' },
  scrollView: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: 100 },

  // Header
  headerCard: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: { backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 4 },
  typeBadgeText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1 },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },

  // Sections
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
  sectionValue: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  subText: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  radarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  radarDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.secondary },
  radarName: { color: colors.textSecondary, fontSize: 13 },

  // Delays
  delayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  delayLabel: { color: colors.textMuted, fontSize: 12 },
  delayValue: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },

  // Comments
  commentItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  commentAuthor: { color: colors.textMuted, fontSize: 11, marginBottom: 2 },
  commentText: { color: colors.textPrimary, fontSize: 14 },

  // Action section
  actionDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: spacing.sm },
  commentInput: { backgroundColor: colors.surfaceLight, borderRadius: radius.sm, padding: 14, fontSize: 14, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top', minHeight: 60, marginBottom: spacing.md },
  actionButton: { borderRadius: radius.md, padding: 18, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: colors.white, fontSize: 17, fontWeight: '800', letterSpacing: 1 },

  // Resolution buttons
  resolutionButtons: { gap: spacing.sm },
  resolutionBtn: { padding: 16, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  resolutionBtnLabel: { fontSize: 16, fontWeight: '700' },
  resolutionBtnDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  // Success
  successBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, backgroundColor: '#F0FFF4', borderTopWidth: 2, borderTopColor: colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  successIcon: { fontSize: 28, color: colors.success, fontWeight: '800' },
  successText: { fontSize: 18, fontWeight: '700', color: '#166534' },
});
