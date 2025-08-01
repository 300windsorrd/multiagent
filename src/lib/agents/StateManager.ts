import { IAgentState } from './types'
import { StateSnapshot } from './StateTypes'
import { StateStorage } from './StateStorage'
import { StateRecovery } from './StateRecovery'

export interface IStateManager {
  initialize(): Promise<void>
  setState(agentId: string, state: IAgentState, reason?: string): Promise<void>
  getState(agentId: string): Promise<IAgentState | null>
  deleteState(agentId: string): Promise<boolean>
  getLatestState(agentId: string): Promise<IAgentState | null>
  getStateHistory(agentId: string, limit?: number): Promise<IAgentState[]>
  createSnapshot(agentId: string, reason?: string): Promise<StateSnapshot>
  getSnapshots(agentId: string): Promise<StateSnapshot[]>
  restoreSnapshot(agentId: string, snapshotId: string): Promise<boolean>
  createBackup(agentId: string): Promise<string>
  restoreBackup(agentId: string, backupId: string): Promise<boolean>
  recover(agentId: string): Promise<boolean>
  cleanup(): Promise<void>
}

export class StateManager implements IStateManager {
  private storage: StateStorage
  private recovery: StateRecovery
  private initialized = false
  private stateCache: Map<string, IAgentState> = new Map()
  private snapshotCache: Map<string, StateSnapshot[]> = new Map()
  private cacheTTL = 60000 // 1 minute cache TTL

  constructor(db: any) {
    this.storage = new StateStorage(db)
    this.recovery = new StateRecovery(this.storage)
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      await this.storage.initialize()
      await this.recovery.initialize()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize StateManager:', error)
      throw error
    }
  }

  public async setState(agentId: string, state: IAgentState, reason?: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Update cache
      this.stateCache.set(agentId, state)
      
      // Add metadata
      const stateWithMetadata: IAgentState = {
        ...state,
        metadata: {
          ...state.metadata,
          lastUpdateReason: reason,
          updatedAt: new Date()
        },
        lastUpdated: new Date()
      }

      // Save to storage
      await this.storage.saveState(agentId, stateWithMetadata)
      
      // Clear snapshot cache for this agent
      this.snapshotCache.delete(agentId)
    } catch (error) {
      console.error(`Failed to set state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async getState(agentId: string): Promise<IAgentState | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Check cache first
      const cachedState = this.stateCache.get(agentId)
      if (cachedState) {
        return cachedState
      }

      // Load from storage
      const state = await this.storage.loadState(agentId)
      if (state) {
        this.stateCache.set(agentId, state)
      }

      return state
    } catch (error) {
      console.error(`Failed to get state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async deleteState(agentId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Clear cache
      this.stateCache.delete(agentId)
      this.snapshotCache.delete(agentId)
      
      // Delete from storage (this would need to be implemented in StateStorage)
      // For now, we'll just clear the cache
      return true
    } catch (error) {
      console.error(`Failed to delete state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async getLatestState(agentId: string): Promise<IAgentState | null> {
    return this.getState(agentId)
  }

  public async getStateHistory(agentId: string, limit: number = 10): Promise<IAgentState[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Get snapshots (which represent state history)
      const snapshots = await this.getSnapshots(agentId)
      return snapshots.slice(0, limit).map(snapshot => snapshot.state)
    } catch (error) {
      console.error(`Failed to get state history for agent ${agentId}:`, error)
      throw error
    }
  }

  public async createSnapshot(agentId: string, reason?: string): Promise<StateSnapshot> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const currentState = await this.getState(agentId)
      if (!currentState) {
        throw new Error(`No state found for agent ${agentId}`)
      }

      const snapshot: StateSnapshot = {
        id: `${agentId}_${Date.now()}`,
        agentId,
        state: currentState,
        version: (currentState.metadata as any)?.version || 1,
        timestamp: new Date(),
        checksum: this.generateChecksum(currentState),
        metadata: {
          reason,
          createdAt: new Date()
        }
      }

      await this.storage.saveSnapshot(agentId, snapshot)
      
      // Update cache
      const snapshots = this.snapshotCache.get(agentId) || []
      snapshots.push(snapshot)
      this.snapshotCache.set(agentId, snapshots)

      return snapshot
    } catch (error) {
      console.error(`Failed to create snapshot for agent ${agentId}:`, error)
      throw error
    }
  }

  public async getSnapshots(agentId: string): Promise<StateSnapshot[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Check cache first
      const cachedSnapshots = this.snapshotCache.get(agentId)
      if (cachedSnapshots) {
        return cachedSnapshots
      }

      // Load from storage
      const snapshots = await this.storage.loadSnapshots(agentId)
      this.snapshotCache.set(agentId, snapshots)

      return snapshots
    } catch (error) {
      console.error(`Failed to get snapshots for agent ${agentId}:`, error)
      throw error
    }
  }

  public async restoreSnapshot(agentId: string, snapshotId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const snapshots = await this.getSnapshots(agentId)
      const snapshot = snapshots.find(s => s.id === snapshotId)
      
      if (!snapshot) {
        return false
      }

      await this.setState(agentId, snapshot.state, `Restored from snapshot ${snapshotId}`)
      return true
    } catch (error) {
      console.error(`Failed to restore snapshot ${snapshotId} for agent ${agentId}:`, error)
      throw error
    }
  }

  public async createBackup(agentId: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const currentState = await this.getState(agentId)
      if (!currentState) {
        throw new Error(`No state found for agent ${agentId}`)
      }

      return await this.storage.createBackup(agentId, currentState)
    } catch (error) {
      console.error(`Failed to create backup for agent ${agentId}:`, error)
      throw error
    }
  }

  public async restoreBackup(agentId: string, backupId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const state = await this.storage.restoreBackup(agentId, backupId)
      if (!state) {
        return false
      }

      await this.setState(agentId, state, `Restored from backup ${backupId}`)
      return true
    } catch (error) {
      console.error(`Failed to restore backup ${backupId} for agent ${agentId}:`, error)
      throw error
    }
  }

  public async recover(agentId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const success = await this.recovery.recover(agentId, this)
      
      if (success) {
        // Clear cache to ensure fresh state
        this.stateCache.delete(agentId)
        this.snapshotCache.delete(agentId)
      }

      return success
    } catch (error) {
      console.error(`Failed to recover agent ${agentId}:`, error)
      throw error
    }
  }

  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Clear cache
      this.stateCache.clear()
      this.snapshotCache.clear()
      
      // Cleanup storage
      await this.storage.cleanup()
    } catch (error) {
      console.error('Failed to cleanup StateManager:', error)
      throw error
    }
  }

  private generateChecksum(state: IAgentState): string {
    // Simple checksum generation - in production, use a more robust method
    const stateString = JSON.stringify(state)
    let hash = 0
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(16)
  }
}