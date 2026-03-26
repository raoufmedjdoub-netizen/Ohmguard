// Écran Profil / Paramètres
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert as RNAlert,
} from 'react-native';
import { router } from 'expo-router';
import apiClient from '../src/api/client';
import { useAuth } from '../src/hooks/useAuth';
import { useNotificationSettings } from '../src/hooks/useNotificationSettings';
import { colors, spacing, radius } from '../src/theme';
import { Switch } from 'react-native';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrateur',
  TENANT_ADMIN: 'Administrateur',
  CLIENT_ADMIN: 'Administrateur Client',
  SUPERVISOR: 'Superviseur',
  OPERATOR: 'Operateur',
  VIEWER: 'Lecteur',
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { enabled: notificationsEnabled, toggling, toggle: toggleNotifications } = useNotificationSettings();

  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Change password
  const [showChangePw, setShowChangePw] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await apiClient.getCurrentUser();
      setProfile(data);
    } catch (err: any) {
      RNAlert.alert('Erreur', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      RNAlert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    if (newPw.length < 8) {
      RNAlert.alert('Erreur', 'Le mot de passe doit contenir au moins 8 caracteres');
      return;
    }
    if (newPw !== confirmPw) {
      RNAlert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }

    setChangingPw(true);
    try {
      await apiClient.changePassword(currentPw, newPw);
      RNAlert.alert('Mot de passe change avec succes');
      setShowChangePw(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (err: any) {
      RNAlert.alert('Erreur', err.message);
    } finally {
      setChangingPw(false);
    }
  };

  const handleLogout = () => {
    RNAlert.alert('Deconnexion', 'Voulez-vous vous deconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Deconnexion', style: 'destructive', onPress: logout }
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar + Name */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.full_name || profile?.email || '?').substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.profileName}>{profile?.full_name || 'Utilisateur'}</Text>
        <Text style={styles.profileEmail}>{profile?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {ROLE_LABELS[profile?.role] || profile?.role || 'Utilisateur'}
          </Text>
        </View>
      </View>

      {/* Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Notifications push</Text>
            <Text style={styles.settingDesc}>Recevoir les alertes de chute sur cet appareil</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            disabled={toggling}
            trackColor={{ false: colors.surfaceLight, true: colors.secondary }}
            thumbColor={colors.white}
          />
        </View>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SECURITE</Text>

        {!showChangePw ? (
          <TouchableOpacity style={styles.actionRow} onPress={() => setShowChangePw(true)}>
            <Text style={styles.actionLabel}>Changer le mot de passe</Text>
            <Text style={styles.actionChevron}>{'>'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.changePwForm}>
            <TextInput
              style={styles.input}
              placeholder="Mot de passe actuel"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={currentPw}
              onChangeText={setCurrentPw}
            />
            <TextInput
              style={styles.input}
              placeholder="Nouveau mot de passe"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmer le nouveau mot de passe"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
            <View style={styles.changePwActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowChangePw(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (!currentPw || !newPw || !confirmPw) && { opacity: 0.4 }]}
                onPress={handleChangePassword}
                disabled={changingPw || !currentPw || !newPw || !confirmPw}
              >
                {changingPw ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.confirmBtnText}>Changer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Info */}
      {(profile?.phone || profile?.job_title || profile?.department) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INFORMATIONS</Text>
          {profile.phone && (
            <InfoRow label="Telephone" value={profile.phone} />
          )}
          {profile.job_title && (
            <InfoRow label="Fonction" value={profile.job_title} />
          )}
          {profile.department && (
            <InfoRow label="Service" value={profile.department} />
          )}
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Se deconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.version}>OhmGuard v1.0.0</Text>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 48 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  // Header
  profileHeader: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: colors.white, fontSize: 26, fontWeight: '800' },
  profileName: { color: colors.textPrimary, fontSize: 22, fontWeight: '700' },
  profileEmail: { color: colors.textSecondary, fontSize: 14 },
  roleBadge: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.surfaceLight },
  roleBadgeText: { color: colors.secondary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },

  // Sections
  section: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: spacing.md },

  // Setting row
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  settingDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  // Action row
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  actionLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  actionChevron: { color: colors.textMuted, fontSize: 18 },

  // Change password form
  changePwForm: { gap: spacing.sm },
  input: { backgroundColor: colors.surfaceLight, borderRadius: radius.sm, padding: 14, fontSize: 15, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  changePwActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.surfaceLight, alignItems: 'center' },
  cancelBtnText: { color: colors.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.secondary, alignItems: 'center' },
  confirmBtnText: { color: colors.white, fontWeight: '700' },

  // Logout
  logoutButton: { backgroundColor: colors.alertRedBg, borderRadius: radius.md, padding: 16, alignItems: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.alertRed },
  logoutButtonText: { color: colors.alertRed, fontSize: 16, fontWeight: '700' },

  version: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.md, fontSize: 12 },
});
