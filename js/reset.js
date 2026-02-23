const contentEl = document.getElementById('content');

// ── Auth state listener ───────────────────────────────────────
// When a coach arrives via the email reset link, Supabase fires
// PASSWORD_RECOVERY. We switch to the new-password form at that point.
client.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    showNewPasswordForm();
  }
});

// ── Init ─────────────────────────────────────────────────────
// If there's a hash, Supabase is processing the recovery token — show
// a loading state and wait for the auth event above.
// If there's no hash, the coach clicked "Forgot password?" — show the
// email request form straight away.
if (window.location.hash) {
  contentEl.innerHTML = '<p class="status-msg">Loading…</p>';
} else {
  showEmailForm();
}

// ── Email request form ────────────────────────────────────────
function showEmailForm() {
  contentEl.innerHTML = `
    <p class="brand-sub">Enter your email and we'll send you a reset link.</p>

    <form id="reset-form" novalidate>
      <div id="error-msg" class="error hidden"></div>

      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" placeholder="you@example.com" autocomplete="email" required autofocus>
      </div>

      <button type="submit" id="reset-btn" class="btn btn-primary">Send Reset Link</button>
    </form>

    <p class="auth-back"><a href="index.html">← Back to sign in</a></p>
  `;

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const btn      = document.getElementById('reset-btn');
    const errorMsg = document.getElementById('error-msg');

    btn.disabled    = true;
    btn.textContent = 'Sending…';
    errorMsg.classList.add('hidden');

    const resetUrl = new URL('reset.html', window.location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });

    if (error) {
      errorMsg.textContent = 'Something went wrong. Please try again.';
      errorMsg.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Send Reset Link';
      return;
    }

    contentEl.innerHTML = `
      <p class="brand-sub">Check your email for a reset link.</p>
      <p class="auth-back"><a href="index.html">← Back to sign in</a></p>
    `;
  });
}

// ── New password form ─────────────────────────────────────────
function showNewPasswordForm() {
  contentEl.innerHTML = `
    <p class="brand-sub">Enter your new password.</p>

    <form id="new-password-form" novalidate>
      <div id="error-msg" class="error hidden"></div>

      <div class="field">
        <label for="password">New Password</label>
        <input type="password" id="password" placeholder="••••••••" autocomplete="new-password" required autofocus>
      </div>

      <button type="submit" id="save-btn" class="btn btn-primary">Set New Password</button>
    </form>
  `;

  document.getElementById('new-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const btn      = document.getElementById('save-btn');
    const errorMsg = document.getElementById('error-msg');

    if (password.length < 6) {
      errorMsg.textContent = 'Password must be at least 6 characters.';
      errorMsg.classList.remove('hidden');
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Saving…';
    errorMsg.classList.add('hidden');

    const { error } = await client.auth.updateUser({ password });

    if (error) {
      errorMsg.textContent = 'Failed to update password. Please try again.';
      errorMsg.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Set New Password';
      return;
    }

    window.location.href = 'catalog.html';
  });
}
