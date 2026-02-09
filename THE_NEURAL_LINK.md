# The Neural Link: WebSocket + AI Integration 🧠⚡

> *"30 saniyelik antik bekleme ölüyor. Sistem artık düşünüyor."*

---

## 🎯 Vizyon: "Düşünen Dashboard"

**Eski:** "Veri çek → Bekle 30sn → Göster"  
**Yeni:** "Olay olur olmaz anında yansı + LLM analizi"

```
┌─────────────────────────────────────────────────────────────┐
│                    THE NEURAL LINK                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Agent (Python)        WebSocket Server        Dashboard   │
│        │                      │                      │      │
│        │  1. Error!           │                      │      │
│        │────────────────────>│                      │      │
│        │                      │  2. Broadcast        │      │
│        │                      │────────────────────>│      │
│        │                      │                      │      │
│        │  3. Send to Claude   │                      │      │
│        │─────────────────────│                      │      │
│        │                      │                      │      │
│        │  4. Analysis         │                      │      │
│        │<─────────────────────                      │      │
│        │                      │  5. Fix Suggestion   │      │
│        │                      │────────────────────>│      │
│        │                      │                      │      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Phase 1: WebSocket Server (Sinir Sistemi)

### 1.1 Python WebSocket Server

**File:** `ai-ulu-agents/websocket/server.py`

```python
"""
AI-ULU Neural Link - WebSocket Server
Gerçek zamanlı iletişim merkezi
"""

import asyncio
import websockets
import json
from datetime import datetime
from typing import Dict, Set
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class NeuralLink:
    """
    Merkezi WebSocket sunucusu.
    Tüm agent'lar ve dashboard buraya bağlanır.
    """
    
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.clients: Set[websockets.WebSocketServerProtocol] = set()
        self.agent_connections: Dict[str, websockets.WebSocketServerProtocol] = {}
        self.dashboard_connections: Set[websockets.WebSocketServerProtocol] = set()
        
    async def register(self, websocket, path):
        """Yeni bağlantı kaydı"""
        self.clients.add(websocket)
        
        try:
            # İlk mesaj: client tipi (agent/dashboard)
            message = await websocket.recv()
            data = json.loads(message)
            client_type = data.get('type', 'unknown')
            
            if client_type == 'agent':
                agent_id = data.get('agent_id', 'unknown')
                self.agent_connections[agent_id] = websocket
                logger.info(f"🤖 Agent connected: {agent_id}")
                
                # Dashboard'lara bildir
                await self.broadcast_to_dashboards({
                    'event': 'agent.connected',
                    'agent_id': agent_id,
                    'timestamp': datetime.utcnow().isoformat()
                })
                
            elif client_type == 'dashboard':
                self.dashboard_connections.add(websocket)
                logger.info(f"📊 Dashboard connected")
                
                # Mevcut durumu gönder
                await self.send_current_state(websocket)
            
            # Mesaj dinle
            await self.handle_messages(websocket, client_type)
            
        except websockets.exceptions.ConnectionClosed:
            logger.info("Client disconnected")
        finally:
            self.clients.discard(websocket)
            self.dashboard_connections.discard(websocket)
            
            # Agent bağlantısını temizle
            for agent_id, conn in list(self.agent_connections.items()):
                if conn == websocket:
                    del self.agent_connections[agent_id]
                    logger.info(f"🤖 Agent disconnected: {agent_id}")
                    break
    
    async def handle_messages(self, websocket, client_type):
        """Gelen mesajları işle"""
        async for message in websocket:
            try:
                data = json.loads(message)
                await self.process_message(data, client_type)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON: {message}")
    
    async def process_message(self, data: dict, source_type: str):
        """Mesajları yönlendir"""
        event_type = data.get('event')
        
        if event_type == 'agent.activity':
            # Agent aktivitesi → Dashboard'a gönder
            await self.broadcast_to_dashboards(data)
            
        elif event_type == 'agent.error':
            # Hata oluştu! Dashboard'a gönder ve LLM analizi başlat
            await self.broadcast_to_dashboards(data)
            
            # LLM analizi (async)
            asyncio.create_task(self.analyze_error_with_llm(data))
            
        elif event_type == 'metrics.update':
            # Metrik güncellemesi
            await self.broadcast_to_dashboards(data)
            
        elif event_type == 'panic.triggered':
            # PANIK! Tüm client'lara bildir
            await self.broadcast_to_all(data)
            
        elif event_type == 'cortex.decision':
            # Yeni stratejik karar
            await self.broadcast_to_dashboards(data)
    
    async def broadcast_to_dashboards(self, data: dict):
        """Tüm dashboard'lara mesaj gönder"""
        if not self.dashboard_connections:
            return
            
        message = json.dumps(data)
        disconnected = []
        
        for dashboard in self.dashboard_connections:
            try:
                await dashboard.send(message)
            except websockets.exceptions.ConnectionClosed:
                disconnected.append(dashboard)
        
        # Temizlik
        for d in disconnected:
            self.dashboard_connections.discard(d)
    
    async def broadcast_to_all(self, data: dict):
        """Tüm client'lara mesaj gönder"""
        message = json.dumps(data)
        
        for client in self.clients:
            try:
                await client.send(message)
            except websockets.exceptions.ConnectionClosed:
                pass
    
    async def send_current_state(self, dashboard):
        """Yeni dashboard'a mevcut durumu gönder"""
        state = {
            'event': 'state.full',
            'connected_agents': list(self.agent_connections.keys()),
            'timestamp': datetime.utcnow().isoformat()
        }
        await dashboard.send(json.dumps(state))
    
    async def analyze_error_with_llm(self, error_data: dict):
        """Hatayı LLM ile analiz et"""
        # Phase 2'de implemente edilecek
        logger.info(f"🔍 Analyzing error with LLM: {error_data.get('error_id')}")
        
        # Simülasyon
        await asyncio.sleep(2)
        
        analysis = {
            'event': 'llm.analysis',
            'error_id': error_data.get('error_id'),
            'root_cause': 'Race condition detected',
            'suggested_fix': 'Add file locking mechanism',
            'confidence': 0.95,
            'auto_apply': True,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        await self.broadcast_to_dashboards(analysis)
    
    async def start(self):
        """Sunucuyu başlat"""
        logger.info(f"🚀 Neural Link starting on ws://{self.host}:{self.port}")
        
        async with websockets.serve(self.register, self.host, self.port):
            await asyncio.Future()  # Sonsuz bekle


# Agent tarafı entegrasyonu
class NeuralLinkAgent:
    """Agent'ların WebSocket bağlantısı"""
    
    def __init__(self, agent_id: str, server_url: str = 'ws://localhost:8765'):
        self.agent_id = agent_id
        self.server_url = server_url
        self.websocket = None
        self.connected = False
    
    async def connect(self):
        """Sunucuya bağlan"""
        try:
            self.websocket = await websockets.connect(self.server_url)
            
            # Kayıt mesajı gönder
            await self.websocket.send(json.dumps({
                'type': 'agent',
                'agent_id': self.agent_id
            }))
            
            self.connected = True
            logger.info(f"✅ {self.agent_id} connected to Neural Link")
            
        except Exception as e:
            logger.error(f"❌ Connection failed: {e}")
    
    async def emit(self, event: str, data: dict):
        """Olay yayınla"""
        if not self.connected:
            await self.connect()
        
        message = {
            'event': event,
            'agent_id': self.agent_id,
            'data': data,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        try:
            await self.websocket.send(json.dumps(message))
        except websockets.exceptions.ConnectionClosed:
            self.connected = False
            logger.warning(f"⚠️ {self.agent_id} disconnected, retrying...")
            await self.connect()
            await self.emit(event, data)
    
    async def report_activity(self, text: str, icon: str = '[INFO]'):
        """Aktivite raporu"""
        await self.emit('agent.activity', {
            'text': text,
            'icon': icon
        })
    
    async def report_error(self, error: str, context: dict = None):
        """Hata raporu (LLM analizi tetikler)"""
        await self.emit('agent.error', {
            'error': error,
            'context': context or {},
            'error_id': f"err_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        })


# Başlat
if __name__ == '__main__':
    neural_link = NeuralLink()
    asyncio.run(neural_link.start())
```

### 1.2 Dashboard WebSocket Client

**File:** `war-room/assets/js/neural-link.js`

```javascript
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
    }

    rejectFix(data) {
        console.log('❌ Fix rejected:', data);
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
```

---

## 🎨 CSS: LLM Banner & Animations

**File:** `war-room/assets/css/neural-link.css`

```css
/* Neural Link Animations */
.feed-item.new {
    animation: pulseHighlight 2s ease;
    background: rgba(0, 255, 136, 0.2) !important;
}

@keyframes pulseHighlight {
    0% { background: rgba(0, 255, 136, 0.4); }
    100% { background: rgba(0, 245, 255, 0.05); }
}

/* LLM Banner */
.llm-banner {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 400px;
    background: linear-gradient(135deg, #1a1f3a, #2d1b4e);
    border: 2px solid #b24bf3;
    border-radius: 15px;
    padding: 20px;
    box-shadow: 0 10px 40px rgba(178, 75, 243, 0.3);
    z-index: 10000;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

.llm-banner-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(178, 75, 243, 0.3);
}

.llm-icon {
    font-size: 24px;
}

.llm-banner-header h4 {
    flex: 1;
    margin: 0;
    color: #b24bf3;
}

.confidence {
    background: rgba(0, 255, 136, 0.2);
    color: #00ff88;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
}

.llm-banner-actions {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}

.btn-approve {
    flex: 1;
    background: linear-gradient(135deg, #00ff88, #00cc66);
    border: none;
    color: #000;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
}

.btn-reject {
    flex: 1;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #fff;
    padding: 10px;
    border-radius: 8px;
    cursor: pointer;
}

/* Toast Notifications */
.toast {
    position: fixed;
    top: 80px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 8px;
    color: #fff;
    font-weight: 500;
    animation: slideInRight 0.3s ease;
    z-index: 10001;
}

.toast-success { background: rgba(0, 255, 136, 0.9); color: #000; }
.toast-error { background: rgba(255, 0, 85, 0.9); }
.toast-info { background: rgba(0, 245, 255, 0.9); color: #000; }
.toast-panic { 
    background: linear-gradient(90deg, #ff0055, #ff0000);
    animation: panicPulse 0.5s infinite;
}

@keyframes panicPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(255, 0, 0, 0.5); }
    50% { box-shadow: 0 0 40px rgba(255, 0, 0, 0.8); }
}

@keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}
```

---

## 🧠 Phase 2: LLM Integration (Claude Brain)

**File:** `ai-ulu-agents/llm/claude_brain.py`

```python
"""
Claude Brain: AI-ULU'nun düşünce merkezi
"""

import os
import json
from anthropic import Anthropic
from typing import Dict, Any, Optional


class ClaudeBrain:
    """
    Claude LLM entegrasyonu.
    Hata analizi, öneriler ve stratejik kararlar.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.client = Anthropic(api_key=api_key or os.getenv('ANTHROPIC_API_KEY'))
        self.model = "claude-3-5-sonnet-20241022"
    
    def analyze_error(self, error_log: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Hatayı analiz et ve çözüm öner.
        
        Example:
            analysis = brain.analyze_error(
                error_log="FileNotFoundError: metrics.json not found",
                context={"repo": "ai-ulu", "agent": "repair_agent"}
            )
        """
        prompt = f"""
        You are an expert DevOps AI analyzing system errors.
        
        Error Log:
        ```
        {error_log}
        ```
        
        Context:
        - Repository: {context.get('repo', 'unknown')}
        - Agent: {context.get('agent', 'unknown')}
        - Timestamp: {context.get('timestamp', 'unknown')}
        
        Analyze this error and provide:
        1. Root cause (be specific)
        2. Suggested fix (code snippet if applicable)
        3. Confidence level (0.0-1.0)
        4. Whether this can be auto-applied
        
        Respond in JSON format:
        {{
            "root_cause": "...",
            "suggested_fix": "...",
            "code_patch": "...",  // if applicable
            "confidence": 0.95,
            "auto_apply": true,
            "explanation": "..."
        }}
        """
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        # JSON parse
        try:
            result = json.loads(response.content[0].text)
            return result
        except json.JSONDecodeError:
            # Fallback
            return {
                "root_cause": "Could not parse LLM response",
                "suggested_fix": response.content[0].text,
                "confidence": 0.5,
                "auto_apply": False
            }
    
    def suggest_strategic_decision(self, kingdom_map: Dict, metrics: Dict) -> Dict[str, Any]:
        """
        Stratejik karar öner.
        
        GodFather'a: "Şimdi ne yapsam?" diye sorduğunda bu çalışır.
        """
        prompt = f"""
        You are the strategic advisor for an autonomous AI engineering ecosystem.
        
        Current Kingdom Map:
        {json.dumps(kingdom_map, indent=2)}
        
        Current Metrics:
        {json.dumps(metrics, indent=2)}
        
        Based on this state, suggest the next strategic decision.
        Consider:
        - Resource allocation
        - Risk management
        - Growth opportunities
        
        Respond in JSON:
        {{
            "decision_type": "repo_classification|agent_policy|chaos_scenario",
            "target": "...",
            "action": "...",
            "reasoning": "...",
            "expected_outcome": "...",
            "priority": "high|medium|low"
        }}
        """
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=1000,
            messages=[{"role": "user", "content": prompt}]
        )
        
        return json.loads(response.content[0].text)
    
    def parse_natural_language_command(self, command: str) -> Dict[str, Any]:
        """
        Doğal dil komutunu parse et.
        
        Example:
            "tüm muscle repolara chaos testi yap"
            -> {"action": "chaos_scenario", "target": "muscle", "scope": "all"}
        """
        prompt = f"""
        Parse this natural language command for an AI engineering system:
        
        Command: "{command}"
        
        Available actions:
        - chaos_scenario: Run chaos engineering test
        - status_check: Get status of repositories
        - repo_classify: Classify repositories
        - agent_deploy: Deploy/update agents
        
        Respond in JSON:
        {{
            "action": "...",
            "target": "...",
            "parameters": {{...}},
            "confidence": 0.95
        }}
        """
        
        response = self.client.messages.create(
            model=self.model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        
        return json.loads(response.content[0].text)


# Kullanım
if __name__ == '__main__':
    brain = ClaudeBrain()
    
    # Test
    analysis = brain.analyze_error(
        "MemoryError: Unable to allocate 2GB",
        {"repo": "ai-ulu", "agent": "repair_agent"}
    )
    
    print(json.dumps(analysis, indent=2))
```

---

## 🚀 Kurulum & Çalıştırma

### 1. Dependencies

```bash
# requirements.txt
websockets>=11.0
anthropic>=0.18.0
python-dotenv>=1.0.0
```

### 2. Environment Variables

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
NEURAL_LINK_HOST=localhost
NEURAL_LINK_PORT=8765
```

### 3. Başlat

```bash
# Terminal 1: WebSocket Server
python ai-ulu-agents/websocket/server.py

# Terminal 2: Agent (örnek)
python -c "
import asyncio
from ai_ulu_agents.websocket.server import NeuralLinkAgent

async def main():
    agent = NeuralLinkAgent('repair_agent')
    await agent.connect()
    
    # Test mesajı
    await agent.report_activity('System check complete', '[OK]')
    
    # Test hatası (LLM analizi tetikler)
    await agent.report_error('Database connection timeout')
    
    await asyncio.sleep(10)

asyncio.run(main())
"

# Browser: Dashboard'u aç
open war-room/index.html
```

---

## 🎯 Beklenen Sonuç

**Dashboard'da göreceksin:**

```
🧠 Neural Link connected
🤖 repair_agent joined
📊 [OK] System check complete

⚠️ Error from repair_agent: Database connection timeout
🔍 LLM analyzing error...

🧠 LLM Analysis Complete (95% confidence)
Issue: Database connection timeout - likely connection pool exhaustion
Suggested Fix: Increase max_connections from 10 to 50

[✅ Approve & Apply] [❌ Reject]
```

---


