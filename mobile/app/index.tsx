// Écran de connexion
import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useAuth } from '../src/hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, changePassword, loading, error, mustChangePassword } = useAuth();

  // Change password form
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      await login(email, password);
    } catch {
      // Error handled by hook
    }
  };

  const handleChangePassword = async () => {
    setChangeError(null);

    if (!newPassword || !confirmPassword) {
      setChangeError('Veuillez remplir tous les champs');
      return;
    }
    if (newPassword.length < 8) {
      setChangeError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError('Les mots de passe ne correspondent pas');
      return;
    }
    if (newPassword === password) {
      setChangeError('Le nouveau mot de passe doit être différent de l\'ancien');
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword(password, newPassword);
    } catch (err: any) {
      setChangeError(err.message || 'Erreur lors du changement de mot de passe');
    } finally {
      setChangingPassword(false);
    }
  };

  // Password change screen
  if (mustChangePassword) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: '#F59E0B' }]}>
              <Text style={styles.logoText}>🔑</Text>
            </View>
            <Text style={styles.title}>Changement requis</Text>
            <Text style={styles.subtitle}>
              Vous devez changer votre mot de passe temporaire
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="Nouveau mot de passe"
              placeholderTextColor="#888"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />

            <TextInput
              style={styles.input}
              placeholder="Confirmer le mot de passe"
              placeholderTextColor="#888"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            {changeError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{changeError}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#F59E0B' }, (!newPassword || !confirmPassword) && styles.buttonDisabled]}
              onPress={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>CHANGER LE MOT DE PASSE</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Login screen
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>⚠️</Text>
          </View>
          <Text style={styles.title}>OhmGuard</Text>
          <Text style={styles.subtitle}>Alertes de Chute</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#888"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.button, (!email || !password) && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || !email || !password}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.buttonText}>SE CONNECTER</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Application réservée au personnel autorisé
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#555',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#7F1D1D',
    padding: 12,
    borderRadius: 8,
  },
  errorText: {
    color: '#FCA5A5',
    textAlign: 'center',
  },
  footer: {
    color: '#666',
    textAlign: 'center',
    marginTop: 48,
    fontSize: 12,
  },
});
