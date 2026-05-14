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
