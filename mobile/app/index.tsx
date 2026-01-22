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
  Image,
} from 'react-native';
import { useAuth } from '../src/hooks/useAuth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) return;
    try {
      await login(email, password);
    } catch (err) {
      // Error handled by hook
    }
  };

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
            placeholderTextColor="#666"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          <TextInput
            style={styles.input}
            placeholder="Mot de passe"
            placeholderTextColor="#666"
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
    backgroundColor: '#666',
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
