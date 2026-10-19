(function () {
  var welcome = document.getElementById('welcome-dialog');
  var seen = false;
  try { seen = sessionStorage.getItem('vin-welcome-v2') === 'seen'; } catch (e) {}
  if (!seen && typeof welcome.showModal === 'function') welcome.showModal();
  welcome.querySelectorAll('[data-welcome-close]').forEach(function (button) {
    button.addEventListener('click', function () { welcome.close(); });
  });
  welcome.addEventListener('close', function () {
    try { sessionStorage.setItem('vin-welcome-v2', 'seen'); } catch (e) {}
    document.querySelector('.mark').focus();
  });
})();
