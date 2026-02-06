// AI-ULU War Room Dashboard
// Real-time metrics and agent activity monitoring

class WarRoomDashboard {
    constructor() {
        this.metricsUrl = 'data/metrics.json';
        this.agentLogUrl = 'data/agent-log.json';
        this.reposUrl = 'data/repos.json';
        this.memoryUrl = 'data/agent_memory.json';
        this.queueUrl = 'data/task_queue.json';
        this.classifyUrl = 'data/classify_queue.json';
        this.dashboardDataUrl = 'data/dashboard_data.json';
        this.updateInterval = 30000; // 30 seconds
        this.translations = {
            en: {
                tagline: 'Autonomous Agentic Engineering - Live Mission Control',
                status_operational: 'SYSTEM OPERATIONAL',
                label_aor: 'Autonomous Operation Rate',
                label_rsi: 'Resilience Stability Index',
                label_mttr: 'Mean Time To Repair',
                label_repos: 'Active Repositories',
                section_activity: 'Live Agent Activity',
                queue_status: 'Queue: {pending} pending, {active} active',
                last_update: 'Last update:',
                queue_title: 'Next Tasks',
                loading: 'Loading...',
                feed_init: 'Initializing agent feed...',
                section_repo: 'Repository Health Matrix',
                legend_excellent: 'Excellent',
                legend_good: 'Good',
                legend_fair: 'Fair',
                legend_poor: 'Poor',
                repos_loading: 'Loading repositories...',
                section_chaos: 'Chaos Engineering Status',
                chaos_last: 'Last Chaos Test',
                chaos_success: 'Recovery Success Rate',
                chaos_scenarios: 'Scenarios Executed',
                footer_line: '(c) 2026 ai-ulu | Autonomous Agentic Engineering Ecosystem',
                footer_tagline: '"Not a framework. Not a platform. An Operating System for AI."',
                queue_empty: 'empty',
                repos_meta: 'Total {total} (Public {public}, Private {private})',
                classify_title: 'Classification Proposals',
                classify_empty: 'none',
                section_kingdom: 'Kingdom Map',
                chart_distribution: 'Repo Distribution',
                chart_power: 'Aura Power Meter',
                premium_indicator: 'Premium Indicator',
                strategic_advice: 'Strategic Advice'
            },
            tr: {
                tagline: 'Otonom Ajan Mühendisligi - Canli Misyon Kontrol',
                status_operational: 'SISTEM AKTIF',
                label_aor: 'Otonom Operasyon Orani',
                label_rsi: 'Dayaniklilik Stabilite Indeksi',
                label_mttr: 'Onarim Ortalama Suresi',
                label_repos: 'Aktif Depolar',
                section_activity: 'Canli Ajan Aktivitesi',
                queue_status: 'Kuyruk: {pending} bekleyen, {active} aktif',
                last_update: 'Son guncelleme:',
                queue_title: 'Siradaki Gorevler',
                loading: 'Yukleniyor...',
                feed_init: 'Ajan akisi baslatiliyor...',
                section_repo: 'Depo Saglik Matrisi',
                legend_excellent: 'Mukemmel',
                legend_good: 'Iyi',
                legend_fair: 'Orta',
                legend_poor: 'Zayif',
                repos_loading: 'Depolar yukleniyor...',
                section_chaos: 'Kaos Muhendisligi Durumu',
                chaos_last: 'Son Kaos Testi',
                chaos_success: 'Kurtarma Basari Orani',
                chaos_scenarios: 'Calistirilan Senaryolar',
                footer_line: '(c) 2026 ai-ulu | Otonom Ajan Muhendisligi Ekosistemi',
                footer_tagline: '"Bir framework degil. Bir platform degil. AI icin bir Isletim Sistemi."',
                queue_empty: 'bos',
                repos_meta: 'Toplam {total} (Acik {public}, Gizli {private})',
                classify_title: 'Siniflandirma Onerileri',
                classify_empty: 'yok',
                section_kingdom: 'Krallik Haritasi',
                chart_distribution: 'Repo Dagilimi',
                chart_power: 'Aura Guc Olceri',
                premium_indicator: 'Premium Gosterge',
                strategic_advice: 'Stratejik Tavsiye'
            }
        };
        this.lang = this.getDefaultLanguage();

        this.init();
    }

    async init() {
        console.log(' War Room Dashboard initializing...');
        this.applyTranslations();
        this.bindLanguageToggle();

        // Load initial data
        await this.loadMetrics();
        await this.loadAgentLog();
        await this.loadRepositories();
        await this.checkPanic();
        await this.loadQueueStatus();
        await this.loadClassifyStatus();
        await this.loadKingdomMap();

        // Set up auto-refresh
        setInterval(() => this.loadMetrics(), this.updateInterval);
        setInterval(() => this.loadAgentLog(), this.updateInterval);
        setInterval(() => this.loadRepositories(), this.updateInterval * 4); // Repos update less frequently
        setInterval(() => this.checkPanic(), this.updateInterval);
        setInterval(() => this.loadQueueStatus(), this.updateInterval);
        setInterval(() => this.loadClassifyStatus(), this.updateInterval);
        setInterval(() => this.loadKingdomMap(), this.updateInterval * 2);

        console.log('OK War Room Dashboard ready');
    }

    getDefaultLanguage() {
        const stored = localStorage.getItem('war_room_lang');
        if (stored) return stored;
        return navigator.language && navigator.language.startsWith('tr') ? 'tr' : 'en';
    }

    setLanguage(lang) {
        this.lang = this.translations[lang] ? lang : 'en';
        localStorage.setItem('war_room_lang', this.lang);
        document.documentElement.setAttribute('lang', this.lang);
        this.applyTranslations();
        this.loadQueueStatus();
        this.updateLastUpdateTime();
    }

    bindLanguageToggle() {
        const buttons = document.querySelectorAll('.lang-btn');
        buttons.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.lang === this.lang);
            btn.addEventListener('click', () => {
                const next = btn.dataset.lang || 'en';
                this.setLanguage(next);
                buttons.forEach((b) => b.classList.toggle('active', b.dataset.lang === next));
            });
        });
    }

    applyTranslations() {
        const dict = this.translations[this.lang] || this.translations.en;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key || !dict[key]) return;
            if (key === 'last_update') {
                el.innerHTML = `${dict[key]} <span id="last-update-time">--</span>`;
                return;
            }
            el.textContent = dict[key];
        });
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
        const reposMeta = document.getElementById('repos-meta');
        if (reposElement && reposBar) {
            reposElement.textContent = data.active_repos;
            const reposPercent = (data.active_repos / 40) * 100; // Assuming max 40 repos
            reposBar.style.width = `${Math.min(100, reposPercent)}%`;
        }
        if (reposMeta) {
            const dict = this.translations[this.lang] || this.translations.en;
            const total = data.total_repos ?? '--';
            const pub = data.public_repos ?? '--';
            const priv = data.private_repos ?? '--';
            reposMeta.textContent = dict.repos_meta
                .replace('{total}', total)
                .replace('{public}', pub)
                .replace('{private}', priv);
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
            const timeString = now.toLocaleTimeString(this.lang === 'tr' ? 'tr-TR' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            timeElement.textContent = timeString;
        }
    }

    async loadQueueStatus() {
        const statusEl = document.getElementById('queue-status');
        const listEl = document.getElementById('queue-list');
        if (!statusEl) return;
        const dict = this.translations[this.lang] || this.translations.en;
        try {
            const response = await fetch(this.queueUrl);
            if (!response.ok) {
                statusEl.textContent = dict.queue_status
                    .replace('{pending}', '--')
                    .replace('{active}', '--');
                if (listEl) listEl.innerHTML = '<li>--</li>';
                return;
            }
            const data = await response.json();
            const pending = (data.pending || []).length;
            const inProgress = (data.in_progress || []).length;
            statusEl.textContent = dict.queue_status
                .replace('{pending}', pending)
                .replace('{active}', inProgress);
            if (listEl) {
                const items = (data.pending || []).slice(0, 3);
                if (items.length === 0) {
                    listEl.innerHTML = `<li>${dict.queue_empty}</li>`;
                } else {
                    listEl.innerHTML = items
                        .map((task) => {
                            const type = (task.type || 'TASK').toUpperCase();
                            const priority = (task.priority || 'normal').toUpperCase();
                            return `<li>[${type}] ${priority}</li>`;
                        })
                        .join('');
                }
            }
        } catch (error) {
            statusEl.textContent = dict.queue_status
                .replace('{pending}', '--')
                .replace('{active}', '--');
            if (listEl) listEl.innerHTML = '<li>--</li>';
        }
    }

    async loadClassifyStatus() {
        const listEl = document.getElementById('classify-list');
        if (!listEl) return;
        const dict = this.translations[this.lang] || this.translations.en;
        try {
            const response = await fetch(this.classifyUrl);
            if (!response.ok) {
                listEl.innerHTML = '<li>--</li>';
                return;
            }
            const data = await response.json();
            const pending = (data.pending || []).slice(0, 3);
            if (!pending.length) {
                listEl.innerHTML = `<li>${dict.classify_empty}</li>`;
                return;
            }
            listEl.innerHTML = pending
                .map((item) => `<li>${item.repo} -> ${item.suggested_class}</li>`)
                .join('');
        } catch (error) {
            listEl.innerHTML = '<li>--</li>';
        }
    }

    async loadKingdomMap() {
        const premiumValue = document.getElementById('premium-value');
        const premiumNote = document.getElementById('premium-note');
        const adviceText = document.getElementById('advice-text');
        try {
            const response = await fetch(this.dashboardDataUrl);
            if (!response.ok) return;
            const data = await response.json();

            if (premiumValue) {
                premiumValue.textContent = `${Math.round((data.premium_ratio || 0) * 100)}%`;
            }
            if (premiumNote) {
                premiumNote.textContent = 'Unicorn / Total';
            }
            if (adviceText) {
                adviceText.textContent = data.advice || '--';
            }

            this.renderDistributionChart(data.class_counts || {});
            this.renderPowerChart(data.class_avg_aura || {});
        } catch (error) {
            // noop
        }
    }

    renderDistributionChart(counts) {
        const ctx = document.getElementById('distribution-chart');
        if (!ctx || !window.Chart) return;
        const labels = ['Unicorn', 'Muscle', 'Archive'];
        const values = [
            counts.unicorn || 0,
            counts.muscle || 0,
            counts.archive || 0
        ];
        if (this.distributionChart) this.distributionChart.destroy();
        this.distributionChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#00ff88', '#00f5ff', '#b24bf3']
                }]
            },
            options: {
                plugins: { legend: { labels: { color: '#8b9dc3' } } }
            }
        });
    }

    renderPowerChart(auras) {
        const ctx = document.getElementById('power-chart');
        if (!ctx || !window.Chart) return;
        const labels = ['Unicorn', 'Muscle', 'Archive'];
        const values = [
            auras.unicorn || 0,
            auras.muscle || 0,
            auras.archive || 0
        ];
        if (this.powerChart) this.powerChart.destroy();
        this.powerChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#00ff88', '#00f5ff', '#b24bf3']
                }]
            },
            options: {
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#8b9dc3' } },
                    y: { ticks: { color: '#8b9dc3' } }
                }
            }
        });
    }

    async checkPanic() {
        try {
            const response = await fetch(this.memoryUrl);
            if (!response.ok) {
                this.setPanicMode(false);
                return;
            }
            const data = await response.json();
            this.setPanicMode(Boolean(data.panic_status));
        } catch (error) {
            console.warn('Panic check failed:', error);
            this.setPanicMode(false);
        }
    }

    setPanicMode(enabled) {
        const body = document.body;
        if (!body) return;
        if (enabled) {
            body.classList.add('panic-mode');
        } else {
            body.classList.remove('panic-mode');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new WarRoomDashboard();
});
