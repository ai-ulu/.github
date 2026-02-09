/**
 * AI-ULU Neural Link Client
 * Dashboard ↔️ WebSocket bağlantısı
 */

class NeuralLinkClient {
    constructor(url = 'ws://localhost:8765') {
        this.url = url;
        this.ws = null;
        this.connected = false;
        this.reconnectInterval = 3000;
        this.listeners = new Map();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('🧠 Neural Link connected');
            this.connected = true;
            
            // Dashboard olarak kaydol
            this.send({
                type: 'dashboard'
            });

            // Bağlantı bildirimi
            this.showNotification('Neural Link active', 'success');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            console.log('⚠️ Neural Link disconnected, retrying...');
            this.connected = false;
            setTimeout(() => this.connect(), this.reconnectInterval);
        };

        this.ws.onerror = (error) => {
            console.error('❌ Neural Link error:', error);
        };
    }

    handleMessage(data) {
        const event = data.event;

        switch(event) {
            case 'agent.activity':
                this.onAgentActivity(data);
                break;
            
            case 'agent.error':
                this.onAgentError(data);
                break;
            
            case 'panic.triggered':
                this.onPanic(data);
                break;
            
            case 'llm.analysis':
                this.onLLMAnalysis(data);
                break;
            
            case 'agent.connected':
                console.log(`🤖 ${data.agent_id} joined`);
                break;
            
            case 'state.full':
                console.log('📊 Full state received:', data);
                break;
        }

        // Custom listeners
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    onAgentActivity(data) {
        // Canlı feed'e ekle
        const feed = document.getElementById('agent-log');
        if (feed) {
            const item = document.createElement('div');
            item.className = 'feed-item new';
            item.innerHTML = `
                <span class="feed-icon">${data.data.icon}</span>
                <span class="feed-text">${data.data.text}</span>
                <span class="feed-time">Just now</span>
            `;
            feed.insertBefore(item, feed.firstChild);
            
            // Animasyon
            setTimeout(() => item.classList.remove('new'), 500);
            
            // Ses efekti (opsiyonel)
            this.playSound('activity');
        }
    }

    onAgentError(data) {
        // Kırmızı alert göster
        this.showNotification(
            `Error from ${data.agent_id}: ${data.data.error}`,
            'error'
        );

        // LLM analizi bekleniyor
        this.showNotification('LLM analyzing error...', 'info');
    }

    onLLMAnalysis(data) {
        // LLM analizi geldi!
        const { root_cause, suggested_fix, confidence, auto_apply } = data;

        // Banner göster
        this.showBanner({
            title: '🧠 LLM Analysis Complete',
            message: `Root cause: ${root_cause}`,
            suggestion: suggested_fix,
            confidence: confidence,
            autoApply: auto_apply,
            onApprove: () => this.approveFix(data),
            onReject: () => this.rejectFix(data)
        });
    }

    onPanic(data) {
        // Panik modu!
        document.body.classList.add('panic-mode');
        this.playSound('alarm');
        
        this.showNotification(
            `🚨 PANIC: ${data.data.reason}`,
            'panic'
        );
    }

    showBanner(options) {
        // LLM öneri banner'ı
        const banner = document.createElement('div');
        banner.className = 'llm-banner';
        banner.innerHTML = `
            <div class="llm-banner-header">
                <span class="llm-icon">🧠</span>
                <h4>${options.title}</h4>
                <span class="confidence">${(options.confidence * 100).toFixed(0)}% confidence</span>
            </div>
            <div class="llm-banner-body">
                <p><strong>Issue:</strong> ${options.message}</p>
                <p><strong>Suggested Fix:</strong> ${options.suggestion}</p>
            </div>
            <div class="llm-banner-actions">
                <button class="btn-approve" onclick="this.closest('.llm-banner').approve()">
                    ✅ Approve & Apply
                </button>
                <button class="btn-reject" onclick="this.closest('.llm-banner').reject()">
                    ❌ Reject
                </button>
            </div>
        `;

        banner.approve = options.onApprove;
        banner.reject = options.onReject;

        document.body.appendChild(banner);
    }

    approveFix(data) {
        console.log('✅ Fix approved:', data);
        // Phase 2: Auto-PR burada başlayacak
        this.showNotification('Fix approved! Auto-PR will be created.', 'success');
    }

    rejectFix(data) {
        console.log('❌ Fix rejected:', data);
        this.showNotification('Fix rejected.', 'info');
    }

    showNotification(message, type = 'info') {
        // Toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 5000);
    }

    playSound(type) {
        // Ses efektleri (opsiyonel)
        const sounds = {
            activity: 'beep.mp3',
            error: 'error.mp3',
            alarm: 'alarm.mp3'
        };
        // Implementation...
    }

    send(data) {
        if (this.connected) {
            this.ws.send(JSON.stringify(data));
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }
}

// Dashboard başlatıldığında bağlan
document.addEventListener('DOMContentLoaded', () => {
    window.neuralLink = new NeuralLinkClient();
    window.neuralLink.connect();
});
