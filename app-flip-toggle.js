document.addEventListener('DOMContentLoaded', () => {
  const flip = document.getElementById('flip-btn') || document.querySelector('.cta-flip');
  if (!flip) return;
  flip.addEventListener('click', (e) => {
    e.preventDefault();
    document.documentElement.classList.toggle('is-inverted');
  });
});