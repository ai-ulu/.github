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
        logger.info(f"🔍 Analyzing error with LLM: {error_data.get('error_id')}")
        
        # Simülasyon - gerçek LLM entegrasyonu sonraki aşamada
        await asyncio.sleep(2)
        
        analysis = {
            'event': 'llm.analysis',
            'error_id': error_data.get('error_id'),
            'root_cause': 'Race condition detected in file access',
            'suggested_fix': 'Implement file locking mechanism',
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
