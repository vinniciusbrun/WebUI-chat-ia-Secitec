// Marked configuration
import { createCopyButton } from './copyButton.js';
import { createFeedbackButtons } from './feedbackButtons.js'; // Movido para cá

marked.setOptions({
  gfm: true,
  breaks: true,
  headerIds: false,
  mangle: false,
  tables: true
});

const renderer = new marked.Renderer();
renderer.table = function(header, body) {
  return `
      <div class="table-wrapper">
          <table>
              <thead>${header}</thead>
              <tbody>${body}</tbody>
          </table>
      </div>
  `;
};
marked.use({ renderer });

// Main chat functionality
document.addEventListener('DOMContentLoaded', function() {
  const chatContainer = document.querySelector('.chat-container');
  const messageInput = document.querySelector('.message-input');
  const sendButton = document.querySelector('.send-button');
  const stopButton = document.querySelector('.stop-button');
  let controller = null;

  function formatResponse(text) {
      if (!text) return '';
      let processedText = text
          .replace(/\n#/g, '\n\n#')
          .replace(/\n-/g, '\n\n-')
          .replace(/\n\n\n+/g, '\n\n');
  
      // Processar fórmulas LaTeX - Corrigido para capturar quebras de linha
      processedText = processedText.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
          return `<div class="math-block">\\[${formula}\\]</div>`;
      });
      
      // Processar fórmulas LaTeX inline
      processedText = processedText.replace(/\$(.*?)\$/g, (match, formula) => {
          return `<span class="math-inline">$${formula}$</span>`;
      });
  
      const sections = processedText.split(/(\n\|[^|]+\|[^\n]*\n[\s|:-]*\n[\s\S]*?(?=\n\s*\n|$))/g);
      const formattedText = sections.map(section => {
          if (section.trim().startsWith('|')) {
              try {
                  const lines = section.trim().split('\n').filter(line => line.trim());
                  if (lines.length >= 3) {
                      const headers = lines[0].split('|').filter(cell => cell.trim()).map(cell => cell.trim());
                      const dataRows = lines.slice(2).map(row => 
                          row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
                      );
                      let tableHtml = '<div class="table-wrapper"><table><thead><tr>';
                      headers.forEach(header => {
                          tableHtml += `<th>${header}</th>`;
                      });
                      tableHtml += '</tr></thead><tbody>';
                      dataRows.forEach(row => {
                          if (row.length > 0) {
                              tableHtml += '<tr>';
                              row.forEach(cell => {
                                  tableHtml += `<td>${cell}</td>`;
                              });
                              tableHtml += '</tr>';
                          }
                      });
                      tableHtml += '</tbody></table></div>';
                      return tableHtml;
                  }
              } catch (e) {
                  console.error('Table processing error:', e);
              }
          }
          return marked.parse(section);
      }).join('\n');
  
      // Forçar renderização do MathJax
      requestAnimationFrame(() => {
          if (window.MathJax) {
              MathJax.texReset();
              MathJax.typesetClear();
              MathJax.typesetPromise([document.querySelector('.chat-container')]).catch(err => {
                  console.error('Erro MathJax:', err);
              });
          }
      });
  
      return formattedText;
  }

  function appendMessage(message, isUser = false) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.innerHTML = isUser ? message : formatResponse(message);
      messageDiv.appendChild(contentDiv);
      
      if (!isUser) {
          const buttonsDiv = document.createElement('div');
          buttonsDiv.className = 'message-buttons hidden';
          const actionsDiv = document.createElement('div');
          actionsDiv.className = 'message-actions';
          
          // Use createCopyButton from copyButton.js
          const copyButton = createCopyButton(messageDiv, contentDiv);
          
          actionsDiv.appendChild(copyButton);
          actionsDiv.innerHTML += `
              <button class="feedback-button" data-type="positive">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                  </svg>
              </button>
              <button class="feedback-button" data-type="negative">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
                  </svg>
              </button>
          `;
          
          buttonsDiv.appendChild(actionsDiv);
          messageDiv.appendChild(buttonsDiv);
      }
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      return messageDiv;
  }

  function resetButtons() {
      if (stopButton && sendButton) {
          stopButton.classList.remove('visible');
          sendButton.style.display = 'flex';
      }
  }

  // Função para criar o cursor piscante
  function createTypingCursor() {
      const cursor = document.createElement('span');
      cursor.className = 'typing-cursor';
      return cursor;
  }

  // Remover estas linhas duplicadas (linha 152-153)
  // No início do arquivo, adicione a importação do módulo feedbackButtons
  // import { createCopyButton } from './copyButton.js';
  // import { createFeedbackButtons } from './feedbackButtons.js';
  
  async function processStreamResponse(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentMessage = '';
      let messageElement = null;
      
      // Criar elemento para resposta do assistente com cursor piscante
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message ai processing-message';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      
      const typingCursor = createTypingCursor();
      
      messageDiv.appendChild(contentDiv);
      messageDiv.appendChild(typingCursor);
      chatContainer.appendChild(messageDiv);
      
      // Rolar para mostrar a resposta da IA no topo da área visível
      messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  
      try {
          while (true) {
              const { value, done } = await reader.read();
              if (done) break;
  
              const chunk = decoder.decode(value, { stream: true });
              if (chunk.includes('<RESPONSE_COMPLETE>')) {
                  // Remover o cursor piscante
                  if (typingCursor && typingCursor.parentNode) {
                      typingCursor.parentNode.removeChild(typingCursor);
                  }
                  
                  // Remover a classe de processamento
                  messageDiv.classList.remove('processing-message');
                  
                  const parts = currentMessage.split('<RESPONSE_COMPLETE>');
                  currentMessage = parts[0];
                  
                  // Atualizar conteúdo final
                  contentDiv.innerHTML = formatResponse(currentMessage);
                  
                  // Adicionar botões
                  const buttonsDiv = document.createElement('div');
                  buttonsDiv.className = 'message-buttons';
                  const actionsDiv = document.createElement('div');
                  actionsDiv.className = 'message-actions';
                  
                  // Use createCopyButton from copyButton.js
                  const copyButton = createCopyButton(messageDiv, contentDiv);
                  
                  // Usar o módulo feedbackButtons para criar os botões de feedback
                  const feedbackContainer = createFeedbackButtons(messageDiv, contentDiv.textContent);
                  
                  actionsDiv.appendChild(copyButton);
                  actionsDiv.appendChild(feedbackContainer);
                  
                  buttonsDiv.appendChild(actionsDiv);
                  messageDiv.appendChild(buttonsDiv);
                  
                  break;
              }
  
              currentMessage += chunk;
              
              // Atualizar conteúdo com efeito de digitação
              contentDiv.innerHTML = formatResponse(currentMessage);
              
              // Rolar para o final
              chatContainer.scrollTop = chatContainer.scrollHeight;
          }
      } catch (error) {
          console.error('Erro ao processar resposta:', error);
          contentDiv.textContent = `Erro: ${error.message}`;
          
          // Remover o cursor piscante em caso de erro
          if (typingCursor && typingCursor.parentNode) {
              typingCursor.parentNode.removeChild(typingCursor);
          }
      }
      
      // Aplicar highlight.js para código
      document.querySelectorAll('pre code').forEach((block) => {
          if (window.hljs) {
              hljs.highlightBlock(block);
          }
      });
      
      // Renderizar fórmulas matemáticas
      if (window.MathJax) {
          MathJax.typeset();
      }
      
      resetButtons();
  }

  // Função para gerar UUID
  function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
      });
  }

  // Função principal para enviar mensagem
  async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;
      
      // Desabilitar input e botão enquanto processa
      messageInput.value = '';
      // Resetar a altura do textarea para o padrão após limpar o conteúdo
      messageInput.style.height = '';
      messageInput.disabled = true;
      sendButton.disabled = true;
      
      if (stopButton) {
          stopButton.classList.add('visible');
          sendButton.style.display = 'none';
      }
      
      // Adicionar mensagem do usuário abaixo da última resposta
      const messageElement = document.createElement('div');
      messageElement.className = 'message user';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      contentDiv.textContent = message;
      messageElement.appendChild(contentDiv);
      
      // Adicionar a mensagem ao final do chat (comportamento normal)
      chatContainer.appendChild(messageElement);
      
      // Rolar para mostrar a mensagem do usuário no topo da área visível
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      try {
          // Criar um novo AbortController para esta requisição
          controller = new AbortController();
          const signal = controller.signal;
          
          // Obter o modelo e perfil selecionados
          const modelSelector = document.querySelector('.model-selector');
          const profileSelector = document.querySelector('.profile-selector');
          
          let modelName = 'default';
          let profileId = 'default';
          
          if (modelSelector) {
              modelName = modelSelector.dataset.selectedModel || 'default';
          }
          
          if (profileSelector) {
              profileId = profileSelector.dataset.selectedProfile || 'default';
          }
          
          // Enviar requisição para o servidor - Corrigindo o endpoint da API
          const response = await fetch('/chat', {  // Alterado de '/api/chat' para '/chat'
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  message: message,
                  session_id: localStorage.getItem('session_id') || generateUUID(),
                  model: modelName,
                  profile: profileId
              }),
              signal: signal
          });
          
          if (!response.ok) {
              throw new Error(`Erro HTTP: ${response.status}`);
          }
          
          // Processar resposta em stream
          await processStreamResponse(response);
          
      } catch (error) {
          if (error.name !== 'AbortError') {
              console.error('Erro:', error);
              
              // Criar mensagem de erro da IA
              const errorElement = document.createElement('div');
              errorElement.className = 'message ai';
              
              const errorContentDiv = document.createElement('div');
              errorContentDiv.className = 'message-content';
              errorContentDiv.textContent = `Erro: ${error.message}`;
              errorElement.appendChild(errorContentDiv);
              
              // Inserir mensagem de erro após a mensagem do usuário
              if (chatContainer.firstChild) {
                  chatContainer.insertBefore(errorElement, chatContainer.firstChild.nextSibling);
              } else {
                  chatContainer.appendChild(errorElement);
              }
          }
      } finally {
          // Habilitar input e botão novamente
          messageInput.disabled = false;
          sendButton.disabled = false;
          resetButtons();
          messageInput.focus();
          controller = null;
      }
  }

  // Função para parar a geração
  function stopGeneration() {
      if (controller) {
          controller.abort();
          controller = null;
          resetButtons();
      }
  }

  // Event listeners
  if (sendButton) {
      sendButton.addEventListener('click', sendMessage);
  }
  
  if (stopButton) {
      stopButton.addEventListener('click', stopGeneration);
  }
  
  if (messageInput) {
      messageInput.addEventListener('keydown', function(event) {
          if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
          }
      });
      
      // Ajustar altura do textarea automaticamente
      messageInput.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
      });
      
      // Focar no input ao carregar a página
      messageInput.focus();
  }

  // Inicializar sugestões de perguntas
  const suggestionButtons = document.querySelectorAll('.suggestion-button');
  suggestionButtons.forEach(button => {
      button.addEventListener('click', function() {
          const question = this.textContent;
          messageInput.value = question;
          sendMessage();
      });
  });
});