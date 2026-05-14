function switchTab(i) {
  document.querySelectorAll('.tab-btn').forEach((b, j) => b.classList.toggle('active', i === j));
  document.querySelectorAll('.tab-panel').forEach((p, j) => p.classList.toggle('active', i === j));
}

function toggleFaq(btn) {
  btn.parentElement.classList.toggle('open');
}

function toggleNav(el) {
  const ul = document.querySelector('.nav-links');
  const open = ul.style.display === 'flex';
  ul.style.cssText = open ? '' :
    'display:flex;flex-direction:column;position:fixed;top:62px;left:0;right:0;background:rgba(214,185,122,0.98);padding:20px 5vw;gap:14px;border-bottom:1px solid rgba(76,0,7,.25);z-index:998;';
}

// Close mobile nav when any nav link is clicked
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    const ul = document.querySelector('.nav-links');
    ul.style.cssText = '';
  });
});

// Scroll-reveal animation
const obs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) e.target.classList.add('visible');
}), { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

// Set to actual event date when confirmed. Placeholder: Jan 1, 2027 (IST).
const EVENT_DATE = new Date('2027-01-01T08:00:00+05:30');

function updateCountdown() {
  const now = new Date();
  const diff = EVENT_DATE - now;
  if (diff <= 0) {
    document.getElementById('countdown').innerHTML = '<p class="cd-live">Event is Live!</p>';
    return;
  }
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
  document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
}
updateCountdown();
setInterval(updateCountdown, 60000);
