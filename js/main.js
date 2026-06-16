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
  if (open) {
    ul.style.cssText = '';
    document.querySelectorAll('.nav-submenu').forEach(s => s.classList.remove('mobile-open'));
  } else {
    ul.style.cssText = 'display:flex;flex-direction:column;position:fixed;top:66px;left:0;right:0;background:rgba(76,0,7,0.98);padding:20px 5vw;gap:14px;border-bottom:1px solid rgba(222,193,137,.2);z-index:998;';
  }
}

// Season 1 dropdown — mobile touch support
document.querySelector('.nav-dropdown-toggle').addEventListener('click', function(e) {
  if (window.innerWidth <= 900) {
    e.preventDefault();
    this.closest('.nav-dropdown').querySelector('.nav-submenu').classList.toggle('mobile-open');
  }
});

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

const EVENT_DATE = new Date('2026-08-02T08:00:00+05:30');

function updateCountdown() {
  const wrap = document.getElementById('countdown');
  if (!wrap) return;
  const now = new Date();
  const diff = EVENT_DATE - now;
  if (diff <= 0) {
    wrap.innerHTML = '<p class="cd-live">Event is Live!</p>';
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
