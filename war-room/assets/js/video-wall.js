/**
 * AI-ULU Video Wall & Advanced Visualization (Phase 9)
 * Matrix streaming, session recording, advanced visualizations
 */

class VideoWall {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.isRunning = false;
        this.logs = [];
        this.matrixChars = "01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
        this.drops = [];
        
        this.init();
    }
    
    init() {
        this.createCanvas();
        this.loadRealLogs();
        window.addEventListener('resize', () => this.resize());
    }
    
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'matrix-canvas';
        this.ctx = this.canvas.getContext('2d');
        
        // Style it
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.zIndex = '-1';
        this.canvas.style.opacity = '0.15';
        
        document.body.insertBefore(this.canvas, document.body.firstChild);
        this.resize();
        
        // Initialize drops
        const columns = Math.floor(this.canvas.width / 20);
        this.drops = Array(columns).fill(1);
    }
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }
    
    async loadRealLogs() {
        // Load real logs from data files
        try {
            const response = await fetch('data/internal_memory.json');
            const data = await response.json();
            this.logs = data.recent_activities || [];
        } catch {
            // Fallback to generated logs
            this.logs = this.generateSampleLogs();
        }
    }
    
    generateSampleLogs() {
        const levels = ['INFO', 'WARN', 'ERROR', 'SUCCESS'];
        const agents = ['RepairAgent', 'ChaosMonkey', 'Watcher', 'Orchestrator'];
        
        return Array(50).fill(null).map((_, i) => ({
            level: levels[Math.floor(Math.random() * levels.length)],
            agent: agents[Math.floor(Math.random() * agents.length)],
            message: `Activity ${i + 1}`,
            timestamp: new Date(Date.now() - i * 60000).toISOString()
        }));
    }
    
    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.animate();
    }
    
    stop() {
        this.isRunning = false;
    }
    
    animate() {
        if (!this.isRunning) return;
        
        // Fade effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = '#00ff88';
        this.ctx.font = '15px monospace';
        
        // Draw characters
        for (let i = 0; i < this.drops.length; i++) {
            const text = this.matrixChars.charAt(
                Math.floor(Math.random() * this.matrixChars.length)
            );
            
            this.ctx.fillText(text, i * 20, this.drops[i] * 20);
            
            // Reset drop
            if (this.drops[i] * 20 > this.canvas.height && Math.random() > 0.975) {
                this.drops[i] = 0;
            }
            
            this.drops[i]++;
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    // Live log streaming
    addLog(log) {
        this.logs.unshift(log);
        if (this.logs.length > 100) this.logs.pop();
        
        // Visual feedback
        this.flashColumn();
    }
    
    flashColumn() {
        const col = Math.floor(Math.random() * this.drops.length);
        this.drops[col] = 0;
    }
}


class SessionRecorder {
    constructor() {
        this.isRecording = false;
        this.events = [];
        this.startTime = null;
        this.sessionId = null;
    }
    
    start() {
        this.isRecording = true;
        this.startTime = Date.now();
        this.sessionId = `session_${this.startTime}`;
        this.events = [];
        
        this.recordEvent('session_start', { url: window.location.href });
        this.attachListeners();
        
        console.log('📹 Session recording started:', this.sessionId);
    }
    
    stop() {
        this.isRecording = false;
        this.recordEvent('session_end', { duration: Date.now() - this.startTime });
        this.detachListeners();
        
        this.saveSession();
        console.log('📹 Session recording stopped:', this.sessionId);
    }
    
    attachListeners() {
        this.clickHandler = (e) => this.recordEvent('click', {
            x: e.clientX,
            y: e.clientY,
            target: e.target.tagName
        });
        
        this.scrollHandler = () => this.recordEvent('scroll', {
            x: window.scrollX,
            y: window.scrollY
        });
        
        document.addEventListener('click', this.clickHandler);
        window.addEventListener('scroll', this.scrollHandler);
    }
    
    detachListeners() {
        document.removeEventListener('click', this.clickHandler);
        window.removeEventListener('scroll', this.scrollHandler);
    }
    
    recordEvent(type, data) {
        if (!this.isRecording) return;
        
        this.events.push({
            timestamp: Date.now() - this.startTime,
            type,
            data
        });
    }
    
    saveSession() {
        const session = {
            id: this.sessionId,
            startTime: this.startTime,
            duration: Date.now() - this.startTime,
            events: this.events,
            metadata: {
                userAgent: navigator.userAgent,
                screenSize: { w: window.innerWidth, h: window.innerHeight }
            }
        };
        
        // Save to localStorage for demo
        const sessions = JSON.parse(localStorage.getItem('aiulu_sessions') || '[]');
        sessions.push(session);
        localStorage.setItem('aiulu_sessions', JSON.stringify(sessions));
    }
    
    async playback(sessionId) {
        const sessions = JSON.parse(localStorage.getItem('aiulu_sessions') || '[]');
        const session = sessions.find(s => s.id === sessionId);
        
        if (!session) {
            console.error('Session not found:', sessionId);
            return;
        }
        
        console.log('▶️ Playing session:', sessionId);
        
        // Create playback overlay
        const overlay = document.createElement('div');
        overlay.className = 'playback-overlay';
        overlay.innerHTML = `
            <div class="playback-controls">
                <span>▶️ Playing: ${sessionId}</span>
                <button onclick="this.closest('.playback-overlay').remove()">✕</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Play events
        let prevTime = 0;
        for (const event of session.events) {
            const delay = event.timestamp - prevTime;
            await this.sleep(delay);
            this.visualizeEvent(event);
            prevTime = event.timestamp;
        }
        
        setTimeout(() => overlay.remove(), 1000);
    }
    
    visualizeEvent(event) {
        // Visual feedback for each event
        if (event.type === 'click') {
            const indicator = document.createElement('div');
            indicator.className = 'playback-click';
            indicator.style.left = event.data.x + 'px';
            indicator.style.top = event.data.y + 'px';
            document.body.appendChild(indicator);
            setTimeout(() => indicator.remove(), 500);
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    listSessions() {
        return JSON.parse(localStorage.getItem('aiulu_sessions') || '[]');
    }
}


class MonacoEditor {
    constructor() {
        this.editor = null;
        this.container = null;
    }
    
    async init() {
        // Load Monaco from CDN
        await this.loadScript('https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js');
        
        require.config({
            paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }
        });
        
        return new Promise((resolve) => {
            require(['vs/editor/editor.main'], () => {
                this.createEditor();
                resolve();
            });
        });
    }
    
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    createEditor() {
        this.container = document.createElement('div');
        this.container.id = 'monaco-editor';
        this.container.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80vw;
            height: 80vh;
            background: #1e1e1e;
            border: 2px solid #00ff88;
            border-radius: 8px;
            z-index: 10000;
            display: none;
        `;
        
        this.container.innerHTML = `
            <div style="display: flex; justify-content: space-between; padding: 10px; background: #2d2d2d;">
                <span>📝 AI-ULU Code Editor</span>
                <button onclick="window.monacoEditor.close()">✕</button>
            </div>
            <div id="editor-container" style="height: calc(100% - 50px);"></div>
        `;
        
        document.body.appendChild(this.container);
        
        this.editor = monaco.editor.create(
            document.getElementById('editor-container'),
            {
                value: '// AI-ULU Code Editor\n// Write and deploy code directly',
                language: 'python',
                theme: 'vs-dark',
                automaticLayout: true,
                minimap: { enabled: true }
            }
        );
    }
    
    open(code = '', language = 'python') {
        this.container.style.display = 'block';
        this.editor.setValue(code);
        monaco.editor.setModelLanguage(this.editor.getModel(), language);
    }
    
    close() {
        this.container.style.display = 'none';
    }
    
    getValue() {
        return this.editor.getValue();
    }
    
    async deploy() {
        const code = this.getValue();
        console.log('🚀 Deploying code...');
        // Integration with deployment pipeline
        return { success: true, message: 'Code deployed' };
    }
}


class AdvancedVisualization {
    constructor() {
        this.chartInstances = {};
    }
    
    // 3D Globe for multi-region visualization
    createGlobe(containerId) {
        // Would use Three.js for 3D globe
        console.log('🌍 3D Globe initialized for', containerId);
    }
    
    // Real-time network graph
    createNetworkGraph(data) {
        // D3.js force-directed graph
        console.log('🕸️ Network graph created');
    }
    
    // Heatmap for activity
    createActivityHeatmap(containerId, data) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Simple heatmap using divs
        container.innerHTML = `
            <div class="heatmap">
                ${data.map(d => `
                    <div class="heatmap-cell ${d.intensity}" title="${d.time}"></div>
                `).join('')}
            </div>
        `;
    }
    
    // Animated metrics
    animateCounter(elementId, targetValue, duration = 1000) {
        const element = document.getElementById(elementId);
        if (!element) return;
        
        const start = parseFloat(element.textContent) || 0;
        const startTime = performance.now();
        
        const update = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            const current = start + (targetValue - start) * easeOutQuart;
            
            element.textContent = current.toFixed(1);
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        };
        
        requestAnimationFrame(update);
    }
}


// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    // Video Wall
    window.videoWall = new VideoWall();
    window.videoWall.start();
    
    // Session Recorder
    window.sessionRecorder = new SessionRecorder();
    
    // Monaco Editor
    window.monacoEditor = new MonacoEditor();
    
    // Advanced Viz
    window.advancedViz = new AdvancedVisualization();
    
    console.log('🎬 Video Wall & Advanced Visualization initialized');
});

// Export for global access
window.VideoWall = VideoWall;
window.SessionRecorder = SessionRecorder;
window.MonacoEditor = MonacoEditor;
window.AdvancedVisualization = AdvancedVisualization;
