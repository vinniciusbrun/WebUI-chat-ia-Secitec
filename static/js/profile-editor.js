class ProfileEditor {
    constructor() {
        this.profiles = {};
        this.currentProfileId = null;
        
        // Inicializar elementos
        this.profilesList = document.getElementById('profiles-list');
        this.profileForm = document.getElementById('profile-form');
        this.profileIdInput = document.getElementById('profile-id');
        this.profileNameInput = document.getElementById('profile-name');
        this.profileDescInput = document.getElementById('profile-description');
        this.promptTemplateInput = document.getElementById('prompt-template');
        this.temperatureInput = document.getElementById('temperature');
        this.topPInput = document.getElementById('top-p');
        this.topKInput = document.getElementById('top-k');
        this.repeatPenaltyInput = document.getElementById('repeat-penalty');
        this.saveButton = document.getElementById('save-profile');
        this.deleteButton = document.getElementById('delete-profile');
        this.addButton = document.getElementById('add-profile');
        
        // Configurar eventos
        this.addButton.addEventListener('click', () => this.createNewProfile());
        this.profileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });
        this.deleteButton.addEventListener('click', () => this.deleteProfile());
        
        // Carregar perfis
        this.loadProfiles();
    }
    
    async loadProfiles() {
        try {
            console.log("Carregando perfis...");
            const response = await fetch('/api/profiles');
            
            if (!response.ok) {
                throw new Error(`Erro ao carregar perfis: ${response.status}`);
            }
            
            this.profiles = await response.json();
            console.log("Perfis carregados:", this.profiles);
            
            // Atualizar a lista de perfis
            this.updateProfilesList();
            
            // Carregar o primeiro perfil por padrão
            if (Object.keys(this.profiles).length > 0) {
                this.loadProfile('default');
            } else {
                this.createNewProfile();
            }
        } catch (error) {
            console.error("Erro ao carregar perfis:", error);
            alert(`Erro ao carregar perfis: ${error.message}`);
        }
    }
    
    updateProfilesList() {
        // Limpar lista atual (exceto o botão de adicionar)
        const children = Array.from(this.profilesList.children);
        for (const child of children) {
            if (child !== this.addButton) {
                this.profilesList.removeChild(child);
            }
        }
        
        // Adicionar perfis à lista
        for (const [id, profile] of Object.entries(this.profiles)) {
            const profileItem = document.createElement('div');
            profileItem.className = 'profile-item';
            if (id === this.currentProfileId) {
                profileItem.classList.add('active');
            }
            
            profileItem.innerHTML = `
                <div class="profile-name">${profile.name || 'Sem nome'}</div>
                <div class="profile-description">${profile.description || ''}</div>
            `;
            
            profileItem.addEventListener('click', () => this.loadProfile(id));
            
            // Inserir após o botão de adicionar
            this.profilesList.insertBefore(profileItem, this.addButton.nextSibling);
        }
    }
    
    loadProfile(profileId) {
        const profile = this.profiles[profileId];
        if (!profile) return;
        
        this.currentProfileId = profileId;
        this.profileIdInput.value = profileId;
        this.profileNameInput.value = profile.name || '';
        this.profileDescInput.value = profile.description || '';
        this.promptTemplateInput.value = profile.prompt_template || '';
        
        const params = profile.parameters || {};
        this.temperatureInput.value = params.temperature || 0.7;
        this.topPInput.value = params.top_p || 0.9;
        this.topKInput.value = params.top_k || 50;
        this.repeatPenaltyInput.value = params.repeat_penalty || 1.1;
        
        // Atualizar título e botões
        document.getElementById('editor-title').textContent = 'Editar Perfil';
        document.getElementById('save-text').textContent = 'Salvar Alterações';
        this.deleteButton.style.display = (profileId === 'default') ? 'none' : 'block';
        
        this.updateProfilesList();
    }
    
    createNewProfile() {
        this.currentProfileId = '';
        this.profileIdInput.value = '';
        this.profileNameInput.value = '';
        this.profileDescInput.value = '';
        this.promptTemplateInput.value = '';
        this.temperatureInput.value = 0.7;
        this.topPInput.value = 0.9;
        this.topKInput.value = 50;
        this.repeatPenaltyInput.value = 1.1;
        
        // Atualizar título e botões
        document.getElementById('editor-title').textContent = 'Novo Perfil';
        document.getElementById('save-text').textContent = 'Criar Perfil';
        this.deleteButton.style.display = 'none';
        
        this.updateProfilesList();
    }
    
    async saveProfile() {
        try {
            const name = this.profileNameInput.value.trim();
            if (!name) {
                alert('O nome do perfil é obrigatório');
                return;
            }
            
            let profileId = this.profileIdInput.value.trim();
            const isNewProfile = !profileId;
            
            // Gerar ID para novos perfis
            if (isNewProfile) {
                profileId = this.generateProfileId(name);
            }
            
            const profileData = {
                name: name,
                description: this.profileDescInput.value.trim(),
                prompt_template: this.promptTemplateInput.value.trim(),
                parameters: {
                    temperature: parseFloat(this.temperatureInput.value) || 0.7,
                    top_p: parseFloat(this.topPInput.value) || 0.9,
                    top_k: parseInt(this.topKInput.value) || 50,
                    repeat_penalty: parseFloat(this.repeatPenaltyInput.value) || 1.1
                }
            };
            
            const endpoint = isNewProfile ? '/api/profiles/add' : '/api/profiles/update';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: profileId,
                    ...profileData
                })
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `Erro ao ${isNewProfile ? 'criar' : 'atualizar'} perfil`);
            }
            
            // Atualizar perfil na lista local
            this.profiles[profileId] = profileData;
            this.currentProfileId = profileId;
            this.profileIdInput.value = profileId;
            
            // Atualizar UI
            this.updateProfilesList();
            
            alert(`Perfil ${isNewProfile ? 'criado' : 'atualizado'} com sucesso!`);
        } catch (error) {
            console.error('Erro ao salvar perfil:', error);
            alert(`Erro ao salvar perfil: ${error.message}`);
        }
    }
    
    async deleteProfile() {
        if (this.currentProfileId === 'default') {
            alert('O perfil padrão não pode ser excluído');
            return;
        }
        
        if (!confirm(`Tem certeza que deseja excluir o perfil "${this.profiles[this.currentProfileId]?.name}"?`)) {
            return;
        }
        
        try {
            const response = await fetch('/api/profiles/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: this.currentProfileId })
            });

            if (response.ok) {
                delete this.profiles[this.currentProfileId];
                this.currentProfileId = null;
                this.updateProfilesList();
                document.getElementById('profile-form').reset();
                alert('Perfil excluído com sucesso!');
            }
        } catch (error) {
            console.error('Erro ao excluir perfil:', error);
            alert('Erro ao excluir perfil');
        }
    }
    
    generateProfileId(name) {
        // Criar um slug a partir do nome do perfil
        const slug = name.toLowerCase()
            .replace(/[^\w\s]/g, '')  // Remover caracteres especiais
            .replace(/\s+/g, '-')     // Substituir espaços por hífens
            .substring(0, 20);        // Limitar o tamanho
        
        // Adicionar timestamp para garantir unicidade
        return `${slug}-${Date.now().toString(36)}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfileEditor();
});