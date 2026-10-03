// Loaded in <head> on every page, before the stylesheet, so a dark-mode coach
// never sees a white flash. This is only a local copy of profiles.theme —
// initNav() in auth.js corrects it once the profile loads.
try {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch (_) {}
