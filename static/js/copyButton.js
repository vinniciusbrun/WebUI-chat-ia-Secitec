export function createCopyButton(message, messageContent) {
  const copyButton = document.createElement('button');
  copyButton.className = 'copy-button';
  copyButton.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  `;
  
  copyButton.addEventListener('click', () => handleCopyClick(messageContent, copyButton));
  return copyButton;
}

function handleCopyClick(messageContent, copyButton) {
  // Criar range para seleção
  const range = document.createRange();
  range.selectNodeContents(messageContent);

  // Criar seleção
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  // Copiar o texto selecionado
  try {
    document.execCommand('copy');
    updateButtonStyle(copyButton);
  } catch (err) {
    console.error('Falha ao copiar texto:', err);
  } finally {
    // Limpar seleção
    selection.removeAllRanges();
  }
}

function updateButtonStyle(copyButton) {
  copyButton.style.backgroundColor = '#000000';
  copyButton.querySelector('svg').style.stroke = '#ffffff';
  
  setTimeout(() => {
    copyButton.style.backgroundColor = '';
    copyButton.querySelector('svg').style.stroke = '';
  }, 1000);
}