// Classe para gerenciar o seletor de modelos
class ModelSelector {
    constructor() {
        this.currentModel = '';
        this.availableModels = [];
        this.isOpen = false;
        this.isLoading = false;
        this.selectorButton = null;
        this.dropdown = null;
        
        this.initialize();
    }
    
    async initialize() {
        // Criar elementos da UI
        this.createUI();
        
        // Carregar modelos disponíveis
        await this.loadModels();
        
        // Adicionar event listeners
        this.addEventListeners();
    }
    
    createUI() {
        // Criar o container do seletor
        const container = document.createElement('div');
        container.className = 'model-selector';
        
        // Criar o botão do seletor
        this.selectorButton = document.createElement('button');
        this.selectorButton.className = 'model-selector-button';
        this.selectorButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                <path d="M2 17l10 5 10-5"/>
                <path d="M2 12l10 5 10-5"/>
            </svg>
            <span class="model-name">Carregando...</span>
            <span class="model-loading"></span>
        `;
        
        // Criar o dropdown
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'model-selector-dropdown';
        
        // Adicionar elementos ao DOM
        container.appendChild(this.selectorButton);
        container.appendChild(this.dropdown);
        
        // Adicionar à header
        const headerControls = document.querySelector('.header-controls');
        if (headerControls) {
            headerControls.prepend(container);
        }
    }
    
    async loadModels() {
        try {
            this.isLoading = true;
            this.updateButtonUI();
            
            const response = await fetch('/api/models');
            const data = await response.json();
            
            this.availableModels = data.models || [];
            this.currentModel = data.current || '';
            
            this.renderModelOptions();
            this.updateButtonUI();
        } catch (error) {
            console.error('Erro ao carregar modelos:', error);
            this.availableModels = [];
            this.selectorButton.querySelector('.model-name').textContent = 'Erro ao carregar';
        } finally {
            this.isLoading = false;
            this.updateButtonUI();
        }
    }
    
    renderModelOptions() {
        // Limpar o dropdown
        this.dropdown.innerHTML = '';
        
        if (this.availableModels.length === 0) {
            const noModels = document.createElement('div');
            noModels.className = 'model-option';
            noModels.textContent = 'Nenhum modelo disponível';
            this.dropdown.appendChild(noModels);
            return;
        }
        
        // Adicionar cada modelo como uma opção
        this.availableModels.forEach(model => {
            const option = document.createElement('div');
            option.className = `model-option ${model === this.currentModel ? 'selected' : ''}`;
            option.setAttribute('data-model', model);
            
            const modelName = document.createElement('span');
            modelName.textContent = model;
            option.appendChild(modelName);
            
            if (model === this.currentModel) {
                const status = document.createElement('span');
                status.className = 'model-status active';
                option.appendChild(status);
            }
            
            option.addEventListener('click', () => this.selectModel(model));
            this.dropdown.appendChild(option);
        });
    }
    
    updateButtonUI() {
        const nameElement = this.selectorButton.querySelector('.model-name');
        const loadingElement = this.selectorButton.querySelector('.model-loading');
        
        if (this.isLoading) {
            nameElement.textContent = 'Carregando...';
            loadingElement.style.display = 'inline-block';
        } else {
            nameElement.textContent = this.currentModel || 'Selecionar modelo';
            loadingElement.style.display = 'none';
        }
    }
    
    toggleDropdown() {
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            this.dropdown.classList.add('active');
        } else {
            this.dropdown.classList.remove('active');
        }
    }
    
    async selectModel(modelName) {
        if (modelName === this.currentModel) {
            this.toggleDropdown();
            return;
        }
        
        try {
            this.isLoading = true;
            this.updateButtonUI();
            
            const response = await fetch('/api/models/select', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: modelName })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.currentModel = data.current;
                // Atualizar a interface
                this.renderModelOptions();
                // Adicionar uma mensagem ao chat informando sobre a mudança
                const chatContainer = document.getElementById('chat-container');
                const systemMessage = document.createElement('div');
                systemMessage.className = 'message system-message';
                systemMessage.innerHTML = `<p>Modelo alterado para <strong>${this.currentModel}</strong>.</p>`;
                chatContainer.appendChild(systemMessage);
                // Scroll to bottom
                chatContainer.scrollTop = chatContainer.scrollHeight;
            } else {
                console.error('Erro ao selecionar modelo:', data.error);
                alert(`Erro ao selecionar modelo: ${data.error}`);
            }
        } catch (error) {
            console.error('Erro ao selecionar modelo:', error);
            alert('Erro ao comunicar com o servidor');
        } finally {
            this.isLoading = false;
            this.updateButtonUI();
            this.toggleDropdown();
        }
    }
    
    addEventListeners() {
        // Toggle dropdown ao clicar no botão
        this.selectorButton.addEventListener('click', () => this.toggleDropdown());
        
        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.selectorButton.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.isOpen = false;
                this.dropdown.classList.remove('active');
            }
        });
        
        // Recarregar modelos se a conexão mudar
        window.addEventListener('online', () => this.loadModels());
    }
}

// Inicializar o seletor de modelos quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    new ModelSelector();
});