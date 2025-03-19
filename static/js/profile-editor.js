class ProfileEditor {
    constructor() {
        this.profiles = {};
        this.currentProfileId = null;
        this.loadProfiles();
        this.initializeUI();
    }

    updateProfilesList() {
        const profilesList = document.getElementById('profiles-list');
        // Primeiro, adicione o botão de novo perfil
        profilesList.innerHTML = `
            <button type="button" class="add-profile-button" id="add-profile">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Novo Perfil
            </button>
        `;

        // Depois, adicione a lista de perfis
        profilesList.innerHTML += Object.entries(this.profiles)
            .map(([id, profile]) => `
                <div class="profile-item ${id === this.currentProfileId ? 'active' : ''}"
                     data-profile-id="${id}">
                    ${profile.name}
                </div>
            `).join('');

        // Reattach event listeners
        document.getElementById('add-profile').addEventListener('click', () => {
            this.createNewProfile();
        });

        const profileItems = profilesList.querySelectorAll('.profile-item');
        profileItems.forEach(item => {
            item.addEventListener('click', () => {
                this.loadProfile(item.dataset.profileId);
            });
        });
    }

    async updateProfile(profileId, profileData) {
        const response = await fetch('/api/profiles/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: profileId,
                ...profileData
            })
        });

        if (response.ok) {
            this.profiles[profileId] = profileData;
            this.updateProfilesList();
            alert('Perfil atualizado com sucesso!');
        } else {
            const data = await response.json();
            throw new Error(data.error);
        }
    }

    initializeUI() {
        document.getElementById('add-profile').addEventListener('click', () => {
            this.createNewProfile();
        });

        document.getElementById('profile-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });

        document.getElementById('delete-profile').addEventListener('click', () => {
            if (this.currentProfileId && confirm('Tem certeza que deseja excluir este perfil?')) {
                this.deleteProfile();
            }
        });
    }

    createNewProfile() {
        this.currentProfileId = null;
        document.getElementById('profile-form').reset();
        document.getElementById('editor-title').textContent = 'Novo Perfil';
        document.getElementById('save-text').textContent = 'Criar Perfil';
        document.getElementById('delete-profile').style.display = 'none';
        
        // Valores padrão para novos perfis
        document.getElementById('temperature').value = '0.7';
        document.getElementById('top-p').value = '0.9';
        document.getElementById('top-k').value = '50';
        document.getElementById('repeat-penalty').value = '1.1';
    }

    async loadProfiles() {
        try {
            const response = await fetch('/api/profiles');
            this.profiles = await response.json();
            this.updateProfilesList();
        } catch (error) {
            console.error('Erro ao carregar perfis:', error);
        }
    }

    loadProfile(profileId) {
        const profile = this.profiles[profileId];
        if (!profile) return;

        this.currentProfileId = profileId;
        document.getElementById('profile-name').value = profile.name;
        document.getElementById('profile-description').value = profile.description;
        document.getElementById('prompt-template').value = profile.prompt_template;
        document.getElementById('temperature').value = profile.parameters.temperature;
        document.getElementById('top-p').value = profile.parameters.top_p;
        document.getElementById('top-k').value = profile.parameters.top_k;
        document.getElementById('repeat-penalty').value = profile.parameters.repeat_penalty;

        this.updateProfilesList();
    }

    async saveProfile() {
        const profileData = {
            name: document.getElementById('profile-name').value,
            description: document.getElementById('profile-description').value,
            prompt_template: document.getElementById('prompt-template').value,
            parameters: {
                temperature: parseFloat(document.getElementById('temperature').value),
                top_p: parseFloat(document.getElementById('top-p').value),
                top_k: parseInt(document.getElementById('top-k').value),
                repeat_penalty: parseFloat(document.getElementById('repeat-penalty').value)
            }
        };

        try {
            if (this.currentProfileId) {
                // Atualizar perfil existente
                await this.updateProfile(this.currentProfileId, profileData);
            } else {
                // Criar novo perfil
                const profileId = this.generateProfileId(profileData.name);
                await this.addProfile(profileId, profileData);
            }
        } catch (error) {
            console.error('Erro ao salvar perfil:', error);
            alert('Erro ao salvar perfil');
        }
    }

    generateProfileId(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    async addProfile(profileId, profileData) {
        const response = await fetch('/api/profiles/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: profileId,
                ...profileData
            })
        });

        if (response.ok) {
            this.profiles[profileId] = profileData;
            this.currentProfileId = profileId;
            this.updateProfilesList();
            alert('Perfil criado com sucesso!');
        } else {
            const data = await response.json();
            throw new Error(data.error);
        }
    }

    async deleteProfile() {
        if (!this.currentProfileId) return;

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
}

document.addEventListener('DOMContentLoaded', () => {
    new ProfileEditor();
});