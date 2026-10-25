// Lightbox & Gallery Interaction
let currentImages = [];
let currentIndex = 0;

function initLightboxList() {
  const imgs = Array.from(document.querySelectorAll('img[data-full]'));
  currentImages = imgs.map(img => img.getAttribute('data-full') || img.src);
}

function openLightbox(imgEl) {
  initLightboxList();
  const targetSrc = imgEl.getAttribute('data-full') || imgEl.src;
  currentIndex = currentImages.indexOf(targetSrc);
  if (currentIndex === -1) {
    currentImages.push(targetSrc);
    currentIndex = currentImages.length - 1;
  }
  updateLightboxView();
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function updateLightboxView() {
  const lbImg = document.getElementById('lb-img');
  const lbCounter = document.getElementById('lb-counter');
  lbImg.src = currentImages[currentIndex];
  lbCounter.textContent = (currentIndex + 1) + ' / ' + currentImages.length;
}

function stepLightbox(dir, event) {
  if (event) event.stopPropagation();
  if (!currentImages.length) return;
  currentIndex = (currentIndex + dir + currentImages.length) % currentImages.length;
  updateLightboxView();
}

function closeLightbox(event) {
  if (event && event.target.id === 'lb-img') return;
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lb-img').src = '';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', function(e) {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') stepLightbox(-1);
  if (e.key === 'ArrowRight') stepLightbox(1);
});
