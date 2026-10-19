for (const block of document.querySelectorAll('pre')) {
  const code = block.querySelector('code');
  if (!code) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy-code';
  button.textContent = 'Salin kode';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Tersalin';
    } catch {
      window.getSelection()?.selectAllChildren(code);
      button.textContent = 'Salin teks terpilih';
    }
    setTimeout(() => {
      button.textContent = 'Salin kode';
    }, 2000);
  });
  block.prepend(button);
}
