// Redirect if already logged in
getSession().then(session => {
  if (session) window.location.href = 'catalog.html';
});

const form    = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const loginBtn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled    = true;
  loginBtn.textContent = 'Signing in…';
  errorMsg.classList.add('hidden');

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    errorMsg.textContent = 'Invalid email or password.';
    errorMsg.classList.remove('hidden');
    loginBtn.disabled    = false;
    loginBtn.textContent = 'Sign In';
  } else {
    window.location.href = 'catalog.html';
  }
});
