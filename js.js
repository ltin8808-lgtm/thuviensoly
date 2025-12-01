document.querySelectorAll('.item .title').forEach(function(title) {
  title.addEventListener('click', function () {
    const item = title.closest('.item');
    item.classList.toggle('active');
  });
<<<<<<< HEAD
});
=======
});
>>>>>>> d0b74648760dd8df3adec4cc9a7d3ce5b144ef83
