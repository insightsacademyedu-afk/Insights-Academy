// Apply the saved theme before the app paints, including with a strict CSP.
try {
  document.documentElement.dataset.theme = localStorage.getItem('academy-theme') === 'dark' ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}
