/**
 * AI-ULU Voice Commands (Phase 8)
 * Web Speech API integration for hands-free control
 */

class VoiceCommandInterface {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.neuralLink = window.neuralLink;
        
        this.commands = {
            'durum raporu': this.handleStatusCheck.bind(this),
            'status report': this.handleStatusCheck.bind(this),
            'unicorn repolar': this.handleUnicornRepos.bind(this),
            'show unicorns': this.handleUnicornRepos.bind(this),
            'chaos test': this.handleChaosTest.bind(this),
            'kararları listele': this.handleListDecisions.bind(this),
            'list decisions': this.handleListDecisions.bind(this),
            'tahminleri göster': this.handleShowPredictions.bind(this),
            'show predictions': this.handleShowPredictions.bind(this),
            'sesli komutları kapat': this.handleStopListening.bind(this),
            'stop listening': this.handleStopListening.bind(this)
        };
        
        this.init();
    }
    
    init() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('❌ Web Speech API not supported');
            this.showToast('Voice commands not supported in this browser', 'error');
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'tr-TR'; // Default Turkish
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateUIState('listening');
            console.log('🎙️ Voice commands active');
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateUIState('idle');
            // Auto-restart if not manually stopped
            if (!this.manuallyStopped) {
                setTimeout(() => this.start(), 500);
            }
        };
        
        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            console.log('🗣️ Heard:', transcript);
            this.handleCommand(transcript);
        };
        
        this.recognition.onerror = (event) => {
            console.error('❌ Speech recognition error:', event.error);
            this.updateUIState('error');
        };
        
        this.createUI();
    }
    
    createUI() {
        // Voice control button
        const btn = document.createElement('button');
        btn.id = 'voice-control-btn';
        btn.className = 'voice-btn';
        btn.innerHTML = '🎙️';
        btn.title = 'Voice Commands (Click to toggle)';
        btn.onclick = () => this.toggle();
        
        // Status indicator
        const status = document.createElement('div');
        status.id = 'voice-status';
        status.className = 'voice-status';
        status.textContent = 'Voice: OFF';
        
        // Transcript display
        const transcript = document.createElement('div');
        transcript.id = 'voice-transcript';
        transcript.className = 'voice-transcript';
        
        // Add to header
        const header = document.querySelector('.dashboard-header');
        if (header) {
            const controls = document.createElement('div');
            controls.className = 'voice-controls';
            controls.appendChild(btn);
            controls.appendChild(status);
            header.appendChild(controls);
        }
        
        // Add transcript to body
        document.body.appendChild(transcript);
    }
    
    toggle() {
        if (this.isListening) {
            this.stop();
        } else {
            this.start();
        }
    }
    
    start() {
        if (this.recognition) {
            this.manuallyStopped = false;
            this.recognition.start();
            this.speak('Sesli komutlar aktif');
        }
    }
    
    stop() {
        if (this.recognition) {
            this.manuallyStopped = true;
            this.recognition.stop();
            this.speak('Sesli komutlar kapatıldı');
        }
    }
    
    updateUIState(state) {
        const btn = document.getElementById('voice-control-btn');
        const status = document.getElementById('voice-status');
        
        if (!btn || !status) return;
        
        switch(state) {
            case 'listening':
                btn.classList.add('listening');
                status.textContent = 'Voice: ON 🎙️';
                status.classList.add('active');
                break;
            case 'idle':
                btn.classList.remove('listening');
                status.textContent = 'Voice: OFF';
                status.classList.remove('active');
                break;
            case 'error':
                btn.classList.add('error');
                status.textContent = 'Voice: Error';
                break;
        }
    }
    
    handleCommand(transcript) {
        // Show transcript
        this.showTranscript(transcript);
        
        // Parse and execute command
        let matched = false;
        
        for (const [pattern, handler] of Object.entries(this.commands)) {
            if (transcript.includes(pattern)) {
                matched = true;
                handler(transcript);
                break;
            }
        }
        
        if (!matched) {
            this.speak('Komut anlaşılamadı');
            this.showToast('Command not recognized', 'warning');
        }
    }
    
    showTranscript(text) {
        const el = document.getElementById('voice-transcript');
        if (el) {
            el.textContent = `🗣️ "${text}"`;
            el.classList.add('visible');
            setTimeout(() => el.classList.remove('visible'), 3000);
        }
    }
    
    // Command Handlers
    
    handleStatusCheck() {
        this.speak('Durum raporu hazırlanıyor');
        
        // Get current metrics
        const metrics = window.dashboard?.currentMetrics || {};
        const rsi = metrics.rsi || 98;
        const aor = metrics.aor || 92;
        
        const status = rsi > 90 ? 'mükemmel' : rsi > 80 ? 'iyi' : 'dikkat gerektiriyor';
        this.speak(`Sistem durumu ${status}. RSI yüzde ${rsi.toFixed(1)}, AOR yüzde ${aor.toFixed(1)}`);
        
        // Trigger dashboard update
        if (window.dashboard) {
            window.dashboard.refreshMetrics();
        }
    }
    
    handleUnicornRepos() {
        this.speak('Unicorn repolar listeleniyor');
        
        // Filter to show only unicorns
        if (window.dashboard) {
            window.dashboard.filterRepos('unicorn');
        }
        
        this.showToast('Showing Unicorn repositories', 'success');
    }
    
    handleChaosTest(transcript) {
        // Extract repo name if mentioned
        const repoMatch = transcript.match(/(?:repos?|for|on)\s+(\w+)/);
        const repo = repoMatch ? repoMatch[1] : 'all';
        
        this.speak(`Chaos test başlatılıyor: ${repo}`);
        
        // Send to Neural Link
        if (this.neuralLink) {
            this.neuralLink.send({
                type: 'command',
                action: 'chaos_test',
                target: repo,
                source: 'voice'
            });
        }
        
        this.showToast(`Chaos test queued for ${repo}`, 'success');
    }
    
    handleListDecisions() {
        this.speak('Son kararlar listeleniyor');
        
        if (window.dashboard) {
            window.dashboard.showDecisionsPanel();
        }
    }
    
    handleShowPredictions() {
        this.speak('Tahminler gösteriliyor');
        
        // Open predictions panel
        this.openPredictionsPanel();
    }
    
    handleStopListening() {
        this.speak('Kapatılıyor');
        this.stop();
    }
    
    speak(text) {
        if (!this.synthesis) return;
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'tr-TR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        this.synthesis.speak(utterance);
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }
    
    openPredictionsPanel() {
        // Create predictions panel
        let panel = document.getElementById('predictions-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'predictions-panel';
            panel.className = 'predictions-panel';
            document.body.appendChild(panel);
        }
        
        panel.innerHTML = `
            <div class="panel-header">
                <h3>🔮 Failure Predictions</h3>
                <button onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="panel-content">
                <p>Loading predictions...</p>
            </div>
        `;
        
        panel.classList.add('visible');
        
        // Load predictions
        fetch('ai-ulu-agents/prediction/models/latest_predictions.json')
            .then(r => r.json())
            .then(data => {
                const content = panel.querySelector('.panel-content');
                content.innerHTML = data.map(p => `
                    <div class="prediction-item ${p.risk_level}">
                        <strong>${p.repo}</strong>
                        <span>${(p.probability * 100).toFixed(0)}% risk</span>
                    </div>
                `).join('');
            })
            .catch(() => {
                panel.querySelector('.panel-content').innerHTML = '<p>No predictions available</p>';
            });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    window.voiceCommands = new VoiceCommandInterface();
});
