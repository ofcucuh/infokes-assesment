<script setup lang="ts">
import { ref } from 'vue';
import { LogIn, UserPlus, ShieldAlert, CheckCircle, Eye, EyeOff } from 'lucide-vue-next';

const emit = defineEmits<{
  (e: 'authenticated', token: string, user: { email: string; role: string }): void;
}>();

const isLogin = ref(true);
const email = ref('');
const password = ref('');
const role = ref('MEMBER'); 
const errorMsg = ref('');
const successMsg = ref('');
const loading = ref(false);
const showPassword = ref(false);

const roles = ['MEMBER', 'VIEWER'];


const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

const handleSubmit = async () => {
  if (!email.value || !password.value) {
    errorMsg.value = 'Please fill out all fields.';
    return;
  }
  
  errorMsg.value = '';
  successMsg.value = '';
  loading.value = true;

  try {
    const endpoint = isLogin.value ? '/api/v1/auth/login' : '/api/v1/auth/register';
    const payload = isLogin.value
      ? { email: email.value, password: password.value }
      : { email: email.value, password: password.value, role: role.value };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Authentication failed');
    }

    if (isLogin.value) {
      const payload = data.data;
      localStorage.setItem('dt_token', payload.token);
      localStorage.setItem('dt_user', JSON.stringify(payload.user));
      successMsg.value = 'Login successful!';
      setTimeout(() => {
        emit('authenticated', payload.token, payload.user);
      }, 500);
    } else {
      successMsg.value = 'Registration successful! Swapping to login...';
      setTimeout(() => {
        isLogin.value = true;
        password.value = '';
        loading.value = false;
        successMsg.value = '';
      }, 1500);
    }
  } catch (err: any) {
    errorMsg.value = err.message || 'Something went wrong. Please try again.';
    loading.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md">
    <div class="w-full max-w-md p-8 rounded-2xl glass-panel shadow-2xl animate-slide-up border border-brand-500/20">
      
      
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 text-white shadow-lg mb-4">
          <span class="text-3xl">🌐</span>
        </div>
        <h1 class="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-brand-300 bg-clip-text text-transparent">
          Dot Traveler
        </h1>
        <p class="text-sm text-slate-400 mt-1">Enterprise Hierarchy Explorer</p>
      </div>

      
      <div class="flex bg-slate-900/60 p-1 rounded-xl mb-6 border border-slate-800">
        <button
          @click="isLogin = true; errorMsg = ''; successMsg = ''"
          :class="['flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2', 
            isLogin ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-white']"
        >
          <LogIn class="w-4 h-4" /> Login
        </button>
        <button
          @click="isLogin = false; errorMsg = ''; successMsg = ''"
          :class="['flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2', 
            !isLogin ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-white']"
        >
          <UserPlus class="w-4 h-4" /> Register
        </button>
      </div>

      
      <div v-if="errorMsg" class="p-3 bg-red-950/60 border border-red-500/30 text-red-200 text-sm rounded-lg mb-4 flex items-center gap-2 animate-fade-in">
        <ShieldAlert class="w-4 h-4 text-red-400 shrink-0" />
        <span>{{ errorMsg }}</span>
      </div>
      
      <div v-if="successMsg" class="p-3 bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-sm rounded-lg mb-4 flex items-center gap-2 animate-fade-in">
        <CheckCircle class="w-4 h-4 text-emerald-400 shrink-0" />
        <span>{{ successMsg }}</span>
      </div>

      
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Email Address</label>
          <input
            v-model="email"
            type="email"
            required
            placeholder="name@company.com"
            class="w-full px-4 py-2.5 rounded-xl glass-input text-sm"
            autocomplete="email"
          />
        </div>

        <div>
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Password</label>
          <div class="relative">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="••••••••"
              class="w-full px-4 py-2.5 pr-10 rounded-xl glass-input text-sm"
              autocomplete="current-password"
            />
            <button
              type="button"
              @click="togglePasswordVisibility"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <Eye v-if="!showPassword" class="w-4 h-4" />
              <EyeOff v-else class="w-4 h-4" />
            </button>
          </div>
        </div>

        
        <div v-if="!isLogin" class="animate-fade-in">
          <label class="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Account Role</label>
          <select
            v-model="role"
            class="w-full px-4 py-2.5 rounded-xl glass-input text-sm appearance-none cursor-pointer"
          >
            <option v-for="r in roles" :key="r" :value="r">{{ r.replace('_', ' ') }}</option>
          </select>
        </div>

        
        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-brand-500/20 disabled:opacity-50 disabled:pointer-events-none mt-2"
        >
          <span v-if="loading" class="inline-block animate-spin mr-2">⏳</span>
          <span v-else>{{ isLogin ? 'Sign In' : 'Create Account' }}</span>
        </button>
      </form>
      
      
      <p class="text-center text-xs text-slate-500 mt-6">
        By continuing, you establish a separate sandbox database tenant.
      </p>
    </div>
  </div>
</template>
