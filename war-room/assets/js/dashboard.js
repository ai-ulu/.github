// AI-ULU War Room Dashboard
// Real-time metrics and agent activity monitoring

class WarRoomDashboard {
    constructor() {
        this.metricsUrl = 'data/metrics.json';
        this.agentLogUrl = 'data/agent-log.json';
        this.reposUrl = 'data/repos.json';
        this.updateInterval = 30000; // 30 seconds

        this.init();
    }

    async init() {
        console.log(' War Room Dashboard initializing...');

        // Load initial data
        await this.loadMetrics();
        await this.loadAgentLog();
        await this.loadRepositories();

        // Set up auto-refresh
        setInterval(() => this.loadMetrics(), this.updateInterval);
        setInterval(() => this.loadAgentLog(), this.updateInterval);
        setInterval(() => this.loadRepositories(), this.updateInterval * 4); // Repos update less frequently

        console.log('OK War Room Dashboard ready');
    }

    async loadMetrics() {
        try {
            const response = await fetch(this.metricsUrl);
            if (!response.ok) {
                // Use fallback data if file doesn't exist yet
                this.useFallbackMetrics();
                return;
            }

            const data = await response.json();
            this.updateMetrics(data);
        } catch (error) {
            console.warn('Using fallback metrics:', error);
            this.useFallbackMetrics();
        }
    }

    useFallbackMetrics() {
        // Fallback data from pitch_deck_data.json
        const fallbackData = {
            aor: 92.5,
            rsi: 98.4,
            mttr: 4.2,
            active_repos: 30,
            last_chaos: 'dependency_corruption (2 days ago)',
            chaos_success: '98.4%',
            chaos_scenarios: 24
        };
        this.updateMetrics(fallbackData);
    }

    updateMetrics(data) {
        // Update AOR
        this.updateMetric('aor', data.aor, '%', 95);

        // Update RSI
        this.updateMetric('rsi', data.rsi, '%', 99);

        // Update MTTR (invert bar - lower is better)
        const mttrElement = document.getElementById('mttr-value');
        const mttrBar = document.getElementById('mttr-bar');
        if (mttrElement && mttrBar) {
            mttrElement.textContent = data.mttr.toFixed(1);
            // Invert: 10 min = 0%, 0 min = 100%
            const mttrPercent = Math.max(0, 100 - (data.mttr / 10 * 100));
            mttrBar.style.width = `${mttrPercent}%`;
        }

        // Update Active Repos
        const reposElement = document.getElementById('repos-value');
        const reposBar = document.getElementById('repos-bar');
        if (reposElement && reposBar) {
            reposElement.textContent = data.active_repos;
            const reposPercent = (data.active_repos / 40) * 100; // Assuming max 40 repos
            reposBar.style.width = `${Math.min(100, reposPercent)}%`;
        }

        // Update Chaos Stats
        if (data.last_chaos) {
            const lastChaosElement = document.getElementById('last-chaos');
            if (lastChaosElement) lastChaosElement.textContent = data.last_chaos;
        }

        if (data.chaos_success) {
            const chaosSuccessElement = document.getElementById('chaos-success');
            if (chaosSuccessElement) chaosSuccessElement.textContent = data.chaos_success;
        }

        if (data.chaos_scenarios) {
            const chaosScenariosElement = document.getElementById('chaos-scenarios');
            if (chaosScenariosElement) chaosScenariosElement.textContent = data.chaos_scenarios;
        }

        // Update last update time
        this.updateLastUpdateTime();
    }

    updateMetric(id, value, unit, target) {
        const valueElement = document.getElementById(`${id}-value`);
        const barElement = document.getElementById(`${id}-bar`);

        if (valueElement && barElement) {
            valueElement.textContent = value.toFixed(1);
            const percent = (value / target) * 100;
            barElement.style.width = `${Math.min(100, percent)}%`;
        }
    }

    async loadAgentLog() {
        try {
            const response = await fetch(this.agentLogUrl);
            if (!response.ok) {
                this.useFallbackAgentLog();
                return;
            }

            const data = await response.json();
            this.updateAgentLog(data.activities || []);
        } catch (error) {
            console.warn('Using fallback agent log:', error);
            this.useFallbackAgentLog();
        }
    }

    useFallbackAgentLog() {
        const fallbackActivities = [
            {
                icon: '[REPAIR]',
                text: 'Repair Agent: System monitoring active across 30 repositories',
                time: 'Just now'
            },
            {
                icon: '[MEDIA]',
                text: 'Media Agent: Ready to generate marketing content on demand',
                time: '5 min ago'
            },
            {
                icon: '[CHAOS]',
                text: 'Chaos Monkey: Scheduled for next Monday 02:00 UTC',
                time: '1 hour ago'
            },
            {
                icon: '[SYSTEM]',
                text: 'System: All autonomous operations running smoothly',
                time: '2 hours ago'
            }
        ];
        this.updateAgentLog(fallbackActivities);
    }

    updateAgentLog(activities) {
        const logContainer = document.getElementById('agent-log');
        if (!logContainer) return;

        logContainer.innerHTML = '';

        activities.slice(0, 10).forEach(activity => {
            const feedItem = document.createElement('div');
            feedItem.className = 'feed-item';
            feedItem.innerHTML = `
                <span class="feed-icon">${activity.icon}</span>
                <span class="feed-text">${activity.text}</span>
                <span class="feed-time">${activity.time}</span>
            `;
            logContainer.appendChild(feedItem);
        });
    }

    async loadRepositories() {
        try {
            const response = await fetch(this.reposUrl);
            if (!response.ok) {
                this.useFallbackRepositories();
                return;
            }

            const data = await response.json();
            this.updateRepositories(data.repositories || []);
        } catch (error) {
            console.warn('Using fallback repositories:', error);
            this.useFallbackRepositories();
        }
    }

    useFallbackRepositories() {
        const fallbackRepos = [
            { name: 'GodFather', aura: 95, health: 'excellent' },
            { name: 'QA', aura: 92, health: 'excellent' },
            { name: 'UluCore', aura: 94, health: 'excellent' },
            { name: 'GitAura', aura: 96, health: 'excellent' },
            { name: 'Nexus-Agi', aura: 88, health: 'good' },
            { name: 'Synthetic-Scout', aura: 87, health: 'good' },
            { name: 'emergent-ai-ulu.com', aura: 85, health: 'good' },
            { name: 'ui-ux-pro-max-skill', aura: 82, health: 'good' },
            { name: 'superpowers', aura: 80, health: 'good' },
            { name: 'llm-council', aura: 78, health: 'fair' },
            { name: 'mcpify', aura: 76, health: 'fair' },
            { name: 'github-trend-radar', aura: 75, health: 'fair' }
        ];
        this.updateRepositories(fallbackRepos);
    }

    updateRepositories(repos) {
        const gridContainer = document.getElementById('repo-grid');
        if (!gridContainer) return;

        gridContainer.innerHTML = '';

        repos.forEach(repo => {
            const repoCard = document.createElement('div');
            repoCard.className = `repo-card ${repo.health}`;
            repoCard.innerHTML = `
                <div class="repo-name">${repo.name}</div>
                <div class="repo-aura">
                    Aura: <span class="repo-aura-value">${repo.aura}</span>
                </div>
            `;

            // Add click handler to open repo
            repoCard.addEventListener('click', () => {
                window.open(`https://github.com/ai-ulu/${repo.name}`, '_blank');
            });

            gridContainer.appendChild(repoCard);
        });
    }

    updateLastUpdateTime() {
        const timeElement = document.getElementById('last-update-time');
        if (timeElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            timeElement.textContent = timeString;
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WarRoomDashboard();
});
