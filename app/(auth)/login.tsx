import { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, TextInput as RNTextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../src/store/auth.store';

// ── 디자인 토큰 ──────────────────────────────────────
const C = {
  bg:       '#0a0a0a',
  card:     '#141414',
  border:   '#2a2a2a',
  borderFocus: '#4f8ef7',
  text:     '#ffffff',
  sub:      '#636366',
  accent:   '#4f8ef7',
  error:    '#ff453a',
};

// 눈 아이콘 (비밀번호 토글)
function EyeIcon({ visible, size = 20, color = C.sub }: { visible: boolean; size?: number; color?: string }) {
  if (visible) {
    return (
      <Text style={{ fontSize: size - 4, color, lineHeight: size }}>👁</Text>
    );
  }
  return (
    <Text style={{ fontSize: size - 4, color, lineHeight: size }}>🙈</Text>
  );
}

export default function LoginScreen() {
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);

  // 인라인 에러
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; general?: string }>({});

  // 포커스 상태
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Ref for input chaining
  const emailRef    = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);

  const { login, register } = useAuthStore();

  function validate(): boolean {
    const errs: typeof errors = {};
    if (mode === 'register' && !name.trim()) errs.name = '이름을 입력해주세요';
    if (!email.trim()) {
      errs.email = '이메일을 입력해주세요';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      errs.email = '올바른 이메일 형식이 아니에요';
    }
    if (!password) {
      errs.password = '비밀번호를 입력해주세요';
    } else if (mode === 'register' && password.length < 6) {
      errs.password = '비밀번호는 6자 이상이어야 해요';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, name.trim(), password);
      }
      router.replace('/(tabs)/home');
    } catch (e: any) {
      setErrors({ general: e.message ?? '잠시 후 다시 시도해주세요' });
    } finally {
      setLoading(false);
    }
  }

  function switchMode(m: 'login' | 'register') {
    setMode(m);
    setErrors({});
    setName('');
    setEmail('');
    setPassword('');
    setShowPw(false);
  }

  const canSubmit = email.trim() && password && (mode === 'login' || name.trim());

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 로고 */}
        <View style={styles.logoWrap}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🏋️</Text>
          </View>
          <Text style={styles.title}>FitStreak</Text>
          <Text style={styles.subtitle}>매일의 운동을 스트릭으로</Text>
        </View>

        {/* 탭 선택 */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => switchMode('login')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>로그인</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => switchMode('register')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>회원가입</Text>
          </TouchableOpacity>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          {/* 이름 (회원가입 전용) */}
          {mode === 'register' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>이름</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'name' && styles.inputFocused,
                  !!errors.name && styles.inputError,
                ]}
                placeholder="닉네임 또는 실명"
                placeholderTextColor={C.sub}
                value={name}
                onChangeText={(t) => { setName(t); setErrors(p => ({ ...p, name: undefined })); }}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                autoCapitalize="words"
              />
              {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
            </View>
          )}

          {/* 이메일 */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>이메일</Text>
            <TextInput
              ref={emailRef}
              style={[
                styles.input,
                focusedField === 'email' && styles.inputFocused,
                !!errors.email && styles.inputError,
              ]}
              placeholder="example@email.com"
              placeholderTextColor={C.sub}
              value={email}
              onChangeText={(t) => { setEmail(t); setErrors(p => ({ ...p, email: undefined })); }}
              onFocus={() => setFocusedField('email')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              autoComplete="email"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          {/* 비밀번호 */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>비밀번호</Text>
            <View style={[
              styles.input,
              styles.pwRow,
              focusedField === 'password' && styles.inputFocused,
              !!errors.password && styles.inputError,
            ]}>
              <TextInput
                ref={passwordRef}
                style={styles.pwInput}
                placeholder={mode === 'register' ? '6자 이상' : '비밀번호'}
                placeholderTextColor={C.sub}
                value={password}
                onChangeText={(t) => { setPassword(t); setErrors(p => ({ ...p, password: undefined })); }}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showPw}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                autoComplete={mode === 'login' ? 'password' : 'new-password'}
              />
              <TouchableOpacity
                onPress={() => setShowPw(v => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.eyeBtn}
              >
                <EyeIcon visible={showPw} />
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
          </View>
        </View>

        {/* 일반 에러 */}
        {errors.general && (
          <View style={styles.generalError}>
            <Text style={styles.generalErrorText}>⚠ {errors.general}</Text>
          </View>
        )}

        {/* 제출 버튼 */}
        <TouchableOpacity
          style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{mode === 'login' ? '로그인' : '계정 만들기'}</Text>
          }
        </TouchableOpacity>

        {/* 모드 전환 힌트 */}
        <View style={styles.switchRow}>
          <Text style={styles.switchText}>
            {mode === 'login' ? '아직 계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
          </Text>
          <TouchableOpacity onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.switchLink}>
              {mode === 'login' ? '회원가입' : '로그인'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner:     { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },

  // 로고
  logoWrap:   { alignItems: 'center', marginBottom: 40 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(79,142,247,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.3)',
  },
  logoEmoji:  { fontSize: 40 },
  title:      { color: C.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginBottom: 6 },
  subtitle:   { color: C.sub, fontSize: 14, fontWeight: '400' },

  // 탭
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 14,
    marginBottom: 28,
    padding: 4,
    borderWidth: 1,
    borderColor: '#222',
  },
  tab: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: C.accent,
    shadowColor: C.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  tabText:       { color: C.sub, fontWeight: '600', fontSize: 15 },
  tabTextActive: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // 폼
  form:       { gap: 4, marginBottom: 8 },
  fieldWrap:  { marginBottom: 16 },
  fieldLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.3 },

  input: {
    backgroundColor: '#141414',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  inputFocused: { borderColor: C.accent },
  inputError:   { borderColor: C.error },

  // 비밀번호 행
  pwRow:  {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 0, paddingHorizontal: 0,
    paddingLeft: 16,
  },
  pwInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 14 },
  eyeBtn:  { paddingHorizontal: 14, paddingVertical: 14 },

  // 에러
  errorText: { color: C.error, fontSize: 12, marginTop: 6, marginLeft: 4 },
  generalError: {
    backgroundColor: 'rgba(255,69,58,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
  },
  generalErrorText: { color: C.error, fontSize: 13, fontWeight: '500' },

  // 버튼
  button: {
    backgroundColor: C.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: C.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonDisabled: { backgroundColor: '#2a2a2a', shadowOpacity: 0 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 0.2 },

  // 하단 전환
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  switchText: { color: C.sub, fontSize: 14 },
  switchLink: { color: C.accent, fontSize: 14, fontWeight: '700' },
});
