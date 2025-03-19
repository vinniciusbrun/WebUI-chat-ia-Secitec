class ProfileManager {
    constructor() {
        this.profiles = {};
        this.currentProfile = 'default';
        this.initializeUI();
        this.loadProfiles();
    }

    async initializeUI() {
        const header = document.querySelector('.header');
        const profileSelector = document.createElement('div');
        profileSelector.className = 'profile-selector';
        profileSelector.innerHTML = `
            <select id="profile-select">
                <option value="">Carregando perfis...</option>
            </select>
        `;
        header.appendChild(profileSelector);

        document.getElementById('profile-select').addEventListener('change', (e) => {
            this.selectProfile(e.target.value);
        });
    }

    async loadProfiles() {
        try {
            const response = await fetch('/api/profiles');
            this.profiles = await response.json();
            this.updateProfileSelect();
        } catch (error) {
            console.error('Erro ao carregar perfis:', error);
        }
    }

    updateProfileSelect() {
        const select = document.getElementById('profile-select');
        select.innerHTML = Object.entries(this.profiles)
            .map(([id, profile]) => `
                <option value="${id}" ${id === this.currentProfile ? 'selected' : ''}>
                    ${profile.name}
                </option>
            `).join('');
    }

    async selectProfile(profileId) {
        try {
            const response = await fetch('/api/profiles/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile: profileId })
            });
            if (response.ok) {
                this.currentProfile = profileId;
            }
        } catch (error) {
            console.error('Erro ao selecionar perfil:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.profileManager = new ProfileManager();
});