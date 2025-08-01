import { IAgentState } from './types'
import { StateSnapshot } from './StateTypes'
import { IStateStorage } from './StateStorage'

export interface IStateRecovery {
  initialize(): Promise<void>
  recover(agentId: string): Promise<IAgentState | null>
  createRecoveryPoint(agentId: string, state: IAgentState): Promise<string>
  restoreRecoveryPoint(agentId: string, recoveryPointId: string): Promise<boolean>
  getRecoveryPoints(agentId: string): Promise<RecoveryPoint[]>
  validateState(state: IAgentState): Promise<boolean>
  repairState(state: IAgentState): Promise<IAgentState>
  cleanup(): Promise<void>
}

export interface RecoveryPoint {
  id: string
  agentId: string
  state: IAgentState
  timestamp: Date
  checksum: string
  metadata: {
    reason: string
    isValid: boolean
    repairAttempts: number
  }
}

export class StateRecovery implements IStateRecovery {
  private storage: IStateStorage
  private initialized = false
  private recoveryPoints: Map<string, RecoveryPoint[]> = new Map()
  private maxRecoveryPoints = 10
  private checksumAlgorithm = 'sha256'

  constructor(storage: IStateStorage) {
    this.storage = storage
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Initialize recovery system
      await this.storage.initialize()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize StateRecovery:', error)
      throw error
    }
  }

  public async recover(agentId: string): Promise<IAgentState | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Try to get the latest valid state
      const recoveryPoints = await this.getRecoveryPoints(agentId)
      
      // Find the most recent valid recovery point
      const validRecoveryPoint = recoveryPoints
        .filter(point => point.metadata.isValid)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

      if (validRecoveryPoint) {
        console.log(`Recovering agent ${agentId} from recovery point ${validRecoveryPoint.id}`)
        return validRecoveryPoint.state
      }

      // If no valid recovery point found, try to repair the latest state
      const latestState = await this.storage.getLatestState(agentId)
      if (latestState) {
        const isValid = await this.validateState(latestState)
        if (!isValid) {
          console.log(`Attempting to repair state for agent ${agentId}`)
          return await this.repairState(latestState)
        }
        return latestState
      }

      return null
    } catch (error) {
      console.error(`Failed to recover state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async createRecoveryPoint(agentId: string, state: IAgentState): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const recoveryPointId = `${agentId}_${Date.now()}_recovery`
      const isValid = await this.validateState(state)
      
      const recoveryPoint: RecoveryPoint = {
        id: recoveryPointId,
        agentId,
        state,
        timestamp: new Date(),
        checksum: this.generateChecksum(state),
        metadata: {
          reason: 'Automatic recovery point',
          isValid,
          repairAttempts: 0
        }
      }

      // Store recovery point
      await this.storage.saveSnapshot(agentId, {
        id: recoveryPointId,
        agentId,
        state,
        version: (state.metadata as any)?.version || 1,
        timestamp: new Date(),
        checksum: recoveryPoint.checksum,
        metadata: recoveryPoint.metadata
      })

      // Update local cache
      const points = this.recoveryPoints.get(agentId) || []
      points.push(recoveryPoint)
      
      // Keep only the most recent recovery points
      if (points.length > this.maxRecoveryPoints) {
        points.splice(0, points.length - this.maxRecoveryPoints)
      }
      
      this.recoveryPoints.set(agentId, points)

      return recoveryPointId
    } catch (error) {
      console.error(`Failed to create recovery point for agent ${agentId}:`, error)
      throw error
    }
  }

  public async restoreRecoveryPoint(agentId: string, recoveryPointId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const snapshots = await this.storage.loadSnapshots(agentId)
      const snapshot = snapshots.find(s => s.id === recoveryPointId)
      
      if (!snapshot) {
        return false
      }

      // Validate the recovery point
      const isValid = await this.validateState(snapshot.state)
      if (!isValid) {
        console.warn(`Recovery point ${recoveryPointId} is invalid, attempting repair`)
        const repairedState = await this.repairState(snapshot.state)
        await this.storage.setState(agentId, repairedState, `Restored from recovery point ${recoveryPointId}`)
      } else {
        await this.storage.setState(agentId, snapshot.state, `Restored from recovery point ${recoveryPointId}`)
      }

      return true
    } catch (error) {
      console.error(`Failed to restore recovery point ${recoveryPointId} for agent ${agentId}:`, error)
      throw error
    }
  }

  public async getRecoveryPoints(agentId: string): Promise<RecoveryPoint[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Check cache first
      const cachedPoints = this.recoveryPoints.get(agentId)
      if (cachedPoints) {
        return cachedPoints
      }

      // Load from storage
      const snapshots = await this.storage.loadSnapshots(agentId)
      const recoveryPoints: RecoveryPoint[] = snapshots.map(snapshot => ({
        id: snapshot.id,
        agentId: snapshot.agentId,
        state: snapshot.state,
        timestamp: snapshot.timestamp,
        checksum: snapshot.checksum,
        metadata: {
          reason: snapshot.metadata?.reason || 'Unknown',
          isValid: true, // Assume valid until validated
          repairAttempts: 0
        }
      }))

      // Update cache
      this.recoveryPoints.set(agentId, recoveryPoints)

      return recoveryPoints
    } catch (error) {
      console.error(`Failed to get recovery points for agent ${agentId}:`, error)
      throw error
    }
  }

  public async validateState(state: IAgentState): Promise<boolean> {
    try {
      // Basic validation checks
      if (!state || !state.agentId || !state.status) {
        return false
      }

      // Validate state structure
      if (typeof state.agentId !== 'string' || typeof state.status !== 'string') {
        return false
      }

      // Validate metadata if present
      if (state.metadata) {
        if (typeof state.metadata !== 'object') {
          return false
        }
      }

      // Validate timestamp if present
      if (state.lastUpdated) {
        if (!(state.lastUpdated instanceof Date) || isNaN(state.lastUpdated.getTime())) {
          return false
        }
      }

      // Validate context if present
      if (state.context) {
        if (typeof state.context !== 'object') {
          return false
        }
      }

      // Validate data if present
      if (state.data) {
        if (typeof state.data !== 'object') {
          return false
        }
      }

      return true
    } catch (error) {
      console.error('State validation failed:', error)
      return false
    }
  }

  public async repairState(state: IAgentState): Promise<IAgentState> {
    try {
      const repairedState = { ...state }

      // Repair agentId if missing or invalid
      if (!repairedState.agentId || typeof repairedState.agentId !== 'string') {
        repairedState.agentId = 'unknown_agent'
      }

      // Repair status if missing or invalid
      if (!repairedState.status || typeof repairedState.status !== 'string') {
        repairedState.status = 'unknown'
      }

      // Repair metadata if invalid
      if (!repairedState.metadata || typeof repairedState.metadata !== 'object') {
        repairedState.metadata = {}
      }

      // Repair timestamp if missing or invalid
      if (!repairedState.lastUpdated || !(repairedState.lastUpdated instanceof Date)) {
        repairedState.lastUpdated = new Date()
      }

      // Repair context if invalid
      if (!repairedState.context || typeof repairedState.context !== 'object') {
        repairedState.context = {}
      }

      // Repair data if invalid
      if (!repairedState.data || typeof repairedState.data !== 'object') {
        repairedState.data = {}
      }

      // Add repair metadata
      repairedState.metadata.repaired = true
      repairedState.metadata.repairedAt = new Date()
      repairedState.metadata.repairCount = (repairedState.metadata.repairCount || 0) + 1

      return repairedState
    } catch (error) {
      console.error('State repair failed:', error)
      // Return a minimal valid state if repair fails
      return {
        agentId: 'recovered_agent',
        status: 'recovered',
        metadata: {
          repaired: true,
          repairedAt: new Date(),
          repairCount: 1,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        lastUpdated: new Date(),
        context: {},
        data: {}
      }
    }
  }

  private generateChecksum(state: IAgentState): string {
    // Simple checksum generation - in production, use a proper cryptographic hash
    const serialized = JSON.stringify(state)
    let hash = 0
    for (let i = 0; i < serialized.length; i++) {
      const char = serialized.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }

  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clean up recovery points cache
      this.recoveryPoints.clear()
      
      // Clean up storage
      await this.storage.cleanup()
      
      this.initialized = false
    } catch (error) {
      console.error('Failed to cleanup StateRecovery:', error)
      throw error
    }
  }
}