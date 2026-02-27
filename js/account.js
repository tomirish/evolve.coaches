requireAuth();

// ── Profile form ──────────────────────────────────────────────
const profileForm    = document.getElementById('profile-form');
const profileError   = document.getElementById('profile-error');
const profileSuccess = document.getElementById('profile-success');
const profileBtn     = document.getElementById('profile-btn');
const fullNameInput  = document.getElementById('full-name');
const emailInput     = document.getElementById('email');

async function loadProfile() {
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  if (session) emailInput.value    = session.user.email || '';
  if (profile)  fullNameInput.value = profile.full_name  || '';
}

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const newName  = fullNameInput.value.trim();
  const newEmail = emailInput.value.trim();

  profileError.classList.add('hidden');
  profileSuccess.classList.add('hidden');

  if (!newName) {
    profileError.textContent = 'Name cannot be empty.';
    profileError.classList.remove('hidden');
    return;
  }

  profileBtn.disabled    = true;
  profileBtn.textContent = 'Saving…';

  const session       = await getSession();
  const originalEmail = session.user.email;

  const { error: nameError } = await client
    .from('profiles')
    .update({ full_name: newName })
    .eq('id', session.user.id);

  if (nameError) {
    profileError.textContent = 'Failed to update name. Please try again.';
    profileError.classList.remove('hidden');
    profileBtn.disabled    = false;
    profileBtn.textContent = 'Save Changes';
    return;
  }

  // Bust the profile cache and update the nav greeting immediately
  _profile = null;
  const navBtn = document.querySelector('.nav-user-btn');
  if (navBtn) {
    const firstName = newName.split(' ')[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const caret = navBtn.querySelector('.nav-caret');
    navBtn.textContent = `Hi, ${firstName} `;
    if (caret) navBtn.appendChild(caret);
  }

  if (newEmail && newEmail !== originalEmail) {
    const { error: emailError } = await client.auth.updateUser({ email: newEmail });
    if (emailError) {
      profileError.textContent = 'Name saved, but email update failed. Please try again.';
      profileError.classList.remove('hidden');
      profileBtn.disabled    = false;
      profileBtn.textContent = 'Save Changes';
      return;
    }
    profileSuccess.textContent = 'Name saved. Check your new email address to confirm the change.';
  } else {
    profileSuccess.textContent = 'Profile updated successfully.';
  }

  profileBtn.disabled    = false;
  profileBtn.textContent = 'Save Changes';
  profileSuccess.classList.remove('hidden');
});

// ── Password form ─────────────────────────────────────────────
const passwordForm = document.getElementById('password-form');
const errorMsg     = document.getElementById('error-msg');
const successMsg   = document.getElementById('success-msg');
const saveBtn      = document.getElementById('save-btn');

passwordForm.addEventListener('submit', async (e) => {
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

  passwordForm.reset();
  saveBtn.disabled    = false;
  saveBtn.textContent = 'Update Password';
  successMsg.textContent = 'Password updated successfully.';
  successMsg.classList.remove('hidden');
});

// ── Init ─────────────────────────────────────────────────────
loadProfile();
initNav();
