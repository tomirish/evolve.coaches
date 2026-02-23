requireAuth();

const form       = document.getElementById('password-form');
const errorMsg   = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');
const saveBtn    = document.getElementById('save-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const password = document.getElementById('new-password').value;
  const confirm  = document.getElementById('confirm-password').value;

  errorMsg.classList.add('hidden');
  successMsg.classList.add('hidden');

  if (password !== confirm) {
    errorMsg.textContent = 'Passwords do not match.';
    errorMsg.classList.remove('hidden');
    return;
  }

  if (password.length < 6) {
    errorMsg.textContent = 'Password must be at least 6 characters.';
    errorMsg.classList.remove('hidden');
    return;
  }

  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  const { error } = await client.auth.updateUser({ password });

  if (error) {
    errorMsg.textContent = 'Failed to update password. Please try again.';
    errorMsg.classList.remove('hidden');
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Update Password';
    return;
  }

  form.reset();
  saveBtn.disabled    = false;
  saveBtn.textContent = 'Update Password';
  successMsg.textContent = 'Password updated successfully.';
  successMsg.classList.remove('hidden');
});

// ── Init ─────────────────────────────────────────────────────
initNav();
