// Função para adicionar animação de carregamento
function showLoadingAnimation() {
    const chatMessages = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message ai';
    loadingDiv.id = 'loading-message';
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading-animation">
                <div class="dot-pulse"></div>
            </div>
        </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return loadingDiv;
}

// Função para adicionar tempo de resposta à última mensagem da IA
function addResponseTime(time) {
    const messages = document.querySelectorAll('.message.ai');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const timeDiv = document.createElement('div');
        timeDiv.className = 'response-time';
        timeDiv.textContent = `Tempo de resposta: ${time}s`;
        lastMessage.appendChild(timeDiv);
    }
}

// Intercepta o evento de envio de mensagem
document.addEventListener('DOMContentLoaded', function() {
    const originalSendMessage = window.sendMessage;
    
    if (originalSendMessage) {
        window.sendMessage = function() {
            const messageInput = document.getElementById('message-input');
            const message = messageInput.value.trim();
            
            if (!message) return;
            
            // Mostra a animação de carregamento
            const loadingElement = showLoadingAnimation();
            
            // Chama a função original de envio
            const result = originalSendMessage.apply(this, arguments);
            
            // Intercepta a resposta para processar os marcadores
            const originalFetch = window.fetch;
            window.fetch = function(url, options) {
                if (url === '/chat' && options.method === 'POST') {
                    return originalFetch(url, options).then(response => {
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        
                        // Cria uma nova resposta simulada
                        const stream = new ReadableStream({
                            start(controller) {
                                let buffer = '';
                                
                                function push() {
                                    reader.read().then(({ done, value }) => {
                                        if (done) {
                                            controller.close();
                                            return;
                                        }
                                        
                                        const chunk = decoder.decode(value, { stream: true });
                                        buffer += chunk;
                                        
                                        // Processa os marcadores especiais
                                        if (buffer.includes('<RESPONSE_COMPLETE>')) {
                                            const parts = buffer.split('<RESPONSE_COMPLETE>');
                                            const responseTime = parts[1] || '';
                                            
                                            // Remove o marcador do buffer
                                            buffer = parts[0];
                                            
                                            // Envia o buffer limpo
                                            controller.enqueue(new TextEncoder().encode(buffer));
                                            
                                            // Remove a animação de carregamento
                                            if (loadingElement) {
                                                loadingElement.remove();
                                            }
                                            
                                            // Adiciona o tempo de resposta após um pequeno delay
                                            setTimeout(() => {
                                                addResponseTime(responseTime);
                                            }, 100);
                                            
                                            controller.close();
                                            return;
                                        } else if (buffer.includes('<PROCESSING_STARTED>')) {
                                            buffer = buffer.replace('<PROCESSING_STARTED>', '');
                                        }
                                        
                                        // Envia o chunk para o processador original
                                        controller.enqueue(value);
                                        push();
                                    }).catch(err => {
                                        console.error('Error reading stream:', err);
                                        controller.error(err);
                                    });
                                }
                                
                                push();
                            }
                        });
                        
                        return new Response(stream, {
                            headers: response.headers,
                            status: response.status,
                            statusText: response.statusText
                        });
                    });
                }
                
                return originalFetch.apply(this, arguments);
            };
            
            return result;
        };
    }
});