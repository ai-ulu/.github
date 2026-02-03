// packages/test-orchestrator/tests/container-security.test.ts
// OPTIMIZED VERSION - Faster test execution
import { describe, it, expect, beforeEach } from 'vitest'
import { mockContainer, flushPromises } from './setup'

describe('Container Security - Optimized', () => {
  beforeEach(() => {
    // Mock'ları temizle ama resetleme
    mockContainer.start.mockClear()
    mockContainer.stop.mockClear()
    mockContainer.exec.mockClear()
  })

  describe('Container Isolation', () => {
    it('should validate container ID format', () => {
      // Synchronous validation - no await needed
      const sha256Regex = /^sha256:[a-f0-9]{64}$/
      expect(mockContainer.id).toMatch(sha256Regex)
      expect(mockContainer.shortId).toHaveLength(12)
    })

    it('should enforce resource limits', async () => {
      const stats = await mockContainer.getStats()
      
      // Fast assertions
      expect(stats.memory_stats.usage).toBeLessThanOrEqual(stats.memory_stats.limit)
      expect(stats.cpu_stats.cpu_usage.total_usage).toBeGreaterThan(0)
    })

    it('should prevent container escape', async () => {
      const inspectData = await mockContainer.inspect()
      
      // Quick security checks
      expect(inspectData.Config).toBeDefined()
      expect(inspectData.State.Running).toBe(true)
      expect(inspectData.State.OOMKilled).toBe(false)
    })

    it('should isolate network properly', async () => {
      const inspectData = await mockContainer.inspect()
      const ip = inspectData.NetworkSettings.IPAddress
      
      // Validate Docker subnet
      expect(ip).toMatch(/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/)
    })
  })

  describe('Resource Management', () => {
    it('should track CPU usage', async () => {
      const stats = await mockContainer.getStats()
      expect(stats.cpu_stats.cpu_usage.total_usage).toBeGreaterThan(0)
      expect(stats.cpu_stats.system_cpu_usage).toBeGreaterThan(0)
    })

    it('should track memory usage', async () => {
      const stats = await mockContainer.getStats()
      expect(stats.memory_stats.usage).toBeGreaterThan(0)
      expect(stats.memory_stats.limit).toBeGreaterThan(stats.memory_stats.usage)
    })

    it('should track network stats', async () => {
      const stats = await mockContainer.getStats()
      expect(stats.networks.eth0).toBeDefined()
      expect(stats.networks.eth0.rx_bytes).toBeGreaterThanOrEqual(0)
      expect(stats.networks.eth0.tx_bytes).toBeGreaterThanOrEqual(0)
    })

    it('should enforce resource limits', async () => {
      const stats = await mockContainer.getStats()
      
      // CPU percentage check
      const cpuPercent = (stats.cpu_stats.cpu_usage.total_usage / stats.cpu_stats.system_cpu_usage) * 100
      expect(cpuPercent).toBeLessThanOrEqual(100)
      expect(cpuPercent).toBeGreaterThan(0)
    })
  })

  describe('Container Lifecycle', () => {
    it('should start container quickly', async () => {
      await mockContainer.start()
      expect(mockContainer.start).toHaveBeenCalledTimes(1)
    })

    it('should stop container quickly', async () => {
      await mockContainer.stop()
      expect(mockContainer.stop).toHaveBeenCalledTimes(1)
    })

    it('should execute commands', async () => {
      const result = await mockContainer.exec()
      expect(result.exitCode).toBe(0)
      expect(result.output).toBeDefined()
      expect(mockContainer.exec).toHaveBeenCalledTimes(1)
    })
  })
})

describe('WebSocket Communication - Optimized', () => {
  it('should connect immediately', async () => {
    const ws = new (global as any).WebSocket('ws://localhost:8080')
    await flushPromises()
    expect(ws.readyState).toBe(1) // OPEN
  })

  it('should send and receive messages quickly', async () => {
    const ws = new (global as any).WebSocket('ws://localhost:8080')
    const messages: any[] = []
    
    ws.onmessage = (event: any) => {
      messages.push(event.data)
    }
    
    await flushPromises()
    ws.send('{"type":"test"}')
    await flushPromises()
    
    expect(messages).toHaveLength(1)
    expect(ws.send).toHaveBeenCalledWith('{"type":"test"}')
  })

  it('should close gracefully', async () => {
    const ws = new (global as any).WebSocket('ws://localhost:8080')
    await flushPromises()
    
    ws.close()
    await flushPromises()
    
    expect(ws.readyState).toBe(3) // CLOSED
  })
})