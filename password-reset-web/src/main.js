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
const replyMessageInput = document.querySelector('#reply-message');
const threadMessages = document.querySelector('#thread-messages');

if (!supabaseUrl || !supabaseAnonKey) {
  showMessage('This account page is not configured. Missing Supabase environment variables.', true);
  if (form) {
    form.hidden = true;
  }
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

initializePage();

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (replyMessageInput) {
    await submitCheckInReply();
    return;
  }

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

async function initializePage() {
  const pathname = normalizePathname(window.location.pathname);

  if (pathname === '/check-in-reply/') {
    await initializeCheckInReplyPage();
    return;
  }

  await initializeAuthLinkPage();
}

async function initializeAuthLinkPage() {
  const params = getAuthLinkParams();
  const linkType = params.get('type');
  const pathname = normalizePathname(window.location.pathname);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const errorDescription = params.get('error_description');

  if (errorDescription) {
    showMessage(errorDescription, true);
    form.hidden = true;
    return;
  }

  if (pathname === '/account-created/') {
    showAccountCreated();
    return;
  }

  if (pathname !== '/reset-password/') {
    showMessage('This account link is not recognised. Please open the link from your Dallas email.', true);
    form.hidden = true;
    return;
  }

  if (linkType === 'signup') {
    showMessage('This signup confirmation link should open the account-created page. Please try the latest email link.', true);
    form.hidden = true;
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

async function initializeCheckInReplyPage() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return;
  }

  const token = getAuthLinkParams().get('token');

  if (!token) {
    showMessage('This check-in link is missing its reply token.', true);
    if (form) {
      form.hidden = true;
    }
    return;
  }

  const { data, error } = await callCheckInReplyFunction(token);

  if (error) {
    showMessage(error.message, true);
    if (form) {
      form.hidden = true;
    }
    return;
  }

  pageTitle.textContent = `Reply to ${data.partnerName}`;
  pageCopy.textContent = 'Send a short supportive reply. Dallas will show it in the accountability history.';
  renderThreadMessages(data.messages ?? []);
  form.hidden = false;
}

async function submitCheckInReply() {
  const token = getAuthLinkParams().get('token');
  const reply = replyMessageInput.value.trim();

  if (!reply) {
    showMessage('Write a reply before sending.', true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Sending...';
  showMessage('');

  const { error } = await callCheckInReplyFunction(token, { message: reply });

  submitButton.disabled = false;
  submitButton.textContent = 'Send reply';

  if (error) {
    showMessage(error.message, true);
    return;
  }

  replyMessageInput.value = '';
  showMessage('Reply sent. You can close this page.');
  await initializeCheckInReplyPage();
}

function renderThreadMessages(messages) {
  if (!threadMessages) {
    return;
  }

  threadMessages.innerHTML = '';

  if (!messages.length) {
    return;
  }

  messages.forEach((threadMessage) => {
    const item = document.createElement('article');
    item.className = 'thread-message';

    const sender = document.createElement('p');
    sender.className = 'thread-message-sender';
    sender.textContent = threadMessage.sender_type === 'partner' ? 'Partner' : 'Dallas user';

    const body = document.createElement('p');
    body.className = 'thread-message-body';
    body.textContent = threadMessage.body;

    item.append(sender, body);
    threadMessages.append(item);
  });
}

async function callCheckInReplyFunction(token, body) {
  const response = await fetch(`${supabaseUrl}/functions/v1/check-in-reply?token=${encodeURIComponent(token)}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    method: body ? 'POST' : 'GET',
  });
  const responseText = await response.text();
  const data = responseText ? parseJsonResponse(responseText) : {};

  if (!response.ok) {
    return {
      data: null,
      error: new Error(data.error ?? responseText ?? `Check-in reply failed with status ${response.status}.`),
    };
  }

  return { data, error: null };
}

function parseJsonResponse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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

function normalizePathname(value) {
  return value.endsWith('/') ? value : `${value}/`;
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
