import { createClient } from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const form = document.querySelector('#reset-form');
const message = document.querySelector('#message');
const pageCopy = document.querySelector('#page-copy');
const pageTitle = document.querySelector('#page-title');
const submitButton = document.querySelector('#submit-button');
const passwordInput = document.querySelector('#password');
const confirmPasswordInput = document.querySelector('#confirm-password');

if (!supabaseUrl || !supabaseAnonKey) {
  showMessage('This account page is not configured. Missing Supabase environment variables.', true);
  form.hidden = true;
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

initializeAuthLinkPage();

form?.addEventListener('submit', async (event) => {
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

async function initializeAuthLinkPage() {
  const params = getAuthLinkParams();
  const linkType = params.get('type');
  const pathname = window.location.pathname;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    showMessage(errorDescription, true);
    form.hidden = true;
    return;
  }

  if (linkType === 'signup' || pathname.includes('account-created')) {
    showAccountCreated();
    return;
  }

  if (linkType && linkType !== 'recovery') {
    showMessage('This email link has been verified. You can return to the Dallas app.', false);
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

function getAuthLinkParams() {
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

function showAccountCreated() {
  pageTitle.textContent = 'Account confirmed';
  pageCopy.textContent = 'Your Dallas account has been created. Please return to the app and sign in.';
  form.hidden = true;
  showMessage('You can close this browser tab and open Dallas.');
}
