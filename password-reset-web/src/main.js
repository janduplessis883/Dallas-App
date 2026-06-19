import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const form = document.querySelector('#reset-form');
const message = document.querySelector('#message');
const submitButton = document.querySelector('#submit-button');
const passwordInput = document.querySelector('#password');
const confirmPasswordInput = document.querySelector('#confirm-password');

if (!supabaseUrl || !supabaseAnonKey) {
  showMessage('Password reset is not configured. Missing Supabase environment variables.', true);
  form.hidden = true;
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

initializeRecoverySession();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (password.length < 6) {
    showMessage('Enter a password with at least 6 characters.', true);
    return;
  }

  if (password !== confirmPassword) {
    showMessage('Passwords do not match.', true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Updating...';
  showMessage('');

  const { error } = await supabase.auth.updateUser({ password });

  submitButton.disabled = false;
  submitButton.textContent = 'Update password';

  if (error) {
    showMessage(error.message, true);
    return;
  }

  passwordInput.value = '';
  confirmPasswordInput.value = '';
  showMessage('Password updated. You can now return to the Dallas app.');
});

async function initializeRecoverySession() {
  const params = getRecoveryParams();
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    showMessage(errorDescription, true);
    form.hidden = true;
    return;
  }

  if (!accessToken || !refreshToken) {
    showMessage('Open this page from the password reset email link.', true);
    form.hidden = true;
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    showMessage(error.message, true);
    form.hidden = true;
    return;
  }

  showMessage('Recovery link verified. Enter your new password.');
}

function getRecoveryParams() {
  const params = new URLSearchParams();
  const query = window.location.search.slice(1);
  const hash = window.location.hash.slice(1);

  appendParams(params, query);
  appendParams(params, hash);

  return params;
}

function appendParams(targetParams, value) {
  const nextParams = new URLSearchParams(value);

  nextParams.forEach((nextValue, key) => {
    targetParams.set(key, nextValue);
  });
}

function showMessage(value, isError = false) {
  message.textContent = value;
  message.classList.toggle('error', isError);
}
