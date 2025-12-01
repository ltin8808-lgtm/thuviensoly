document.querySelectorAll('.item .title').forEach(function(title) {
  title.addEventListener('click', function () {
    const item = title.closest('.item');
    item.classList.toggle('active');
  });
});