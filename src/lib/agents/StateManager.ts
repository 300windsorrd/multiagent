import {
  ILogger,
  IMonitoringService,
  IErrorHandler
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface IStateManager {
  getAgentState(agentId: string): Promise<any>
  setAgentState(agentId: string, state: any): Promise<boolean>
  updateAgentState(agentId: string, updates: any): Promise<boolean>
  deleteAgentState(agentId: string): Promise<boolean>
  getStateHistory(agentId: string, limit?: number): Promise<any[]>
  createStateSnapshot(agentId: string, description?: string): Promise<string>
  getStateSnapshots(agentId: string): Promise<any[]>
  restoreStateFromSnapshot(agentId: string, snapshotId: string): Promise<boolean>
  addStateValidator(agentId: string, validator: any): Promise<void>
  removeStateValidator(agentId: string, validatorName: string): Promise<void>
  exportState(agentId: string): Promise<string>
  importState(agentId: string, stateData: string): Promise<boolean>
  getAllAgentStates(): Promise<Record<string, any>>
  getStateStats(agentId?: string): Promise<any>
}

export class StateManager extends EventEmitter implements IStateManager {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private agentStates: Map<string, AgentState> = new Map()
  private stateHistory: Map<string, StateHistoryEntry[]> = new Map()
  private stateSnapshots: Map<string, StateSnapshot[]> = new Map()
  private stateValidators: Map<string, StateValidator[]> = new Map()
  private maxHistorySize: number = 1000
  private maxSnapshots: number = 10
  private autoSaveInterval: number = 60000 // 1 minute
  private autoSaveTimer: NodeJS.Timeout | null = null

  constructor(
    logger: ILogger,
    monitoringService: IMonitoringService,
    errorHandler: IErrorHandler
  ) {
    super()
    this.logger = logger
    this.monitoringService = monitoringService
    this.errorHandler = errorHandler
    this.startAutoSave()
  }

  async getAgentState(agentId: string): Promise<AgentState | null> {
    try {
      const state = this.agentStates.get(agentId)
      
      if (!state) {
        this.logger.debug(`State not found for agent ${agentId}`, { agentId })
        return null
      }

      this.logger.debug(`State retrieved for agent ${agentId}`, { agentId })
      return state
    } catch (error) {
      this.logger.error(`Failed to get state for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async setAgentState(agentId: string, state: AgentState): Promise<boolean> {
    try {
      this.logger.info(`Setting state for agent ${agentId}`, { agentId, state })

      // Validate state
      const validation = await this.validateState(agentId, state)
      if (!validation.valid) {
        this.logger.error(`State validation failed for agent ${agentId}`, undefined, {
          agentId,
          errors: validation.errors
        })
        return false
      }

      const existingState = this.agentStates.get(agentId)
      
      // Create state object
      const fullState: AgentState = {
        ...state,
        id: uuidv4(),
        agentId,
        version: existingState ? existingState.version + 1 : 1,
        createdAt: existingState ? existingState.createdAt : new Date(),
        updatedAt: new Date()
      }

      // Store state
      this.agentStates.set(agentId, fullState)

      // Add to history
      await this.addToHistory(agentId, fullState)

      this.logger.info(`State set successfully for agent ${agentId}`, {
        agentId,
        version: fullState.version
      })

      // Record metric
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'STATE' as any,
        name: 'state_updates',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { version: fullState.version }
      })

      // Emit event
      this.emit('stateSet', { agentId, state: fullState })

      return true
    } catch (error) {
      this.logger.error(`Failed to set state for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async updateAgentState(agentId: string, updates: Partial<AgentState>): Promise<boolean> {
    try {
      this.logger.info(`Updating state for agent ${agentId}`, { agentId, updates })

      const existingState = this.agentStates.get(agentId)
      if (!existingState) {
        this.logger.warn(`State not found for agent ${agentId}`, { agentId })
        return false
      }

      // Merge updates with existing state
      const updatedState: AgentState = {
        ...existingState,
        ...updates,
        id: uuidv4(),
        version: existingState.version + 1,
        updatedAt: new Date()
      }

      // Validate updated state
      const validation = await this.validateState(agentId, updatedState)
      if (!validation.valid) {
        this.logger.error(`State validation failed for agent ${agentId}`, undefined, {
          agentId,
          errors: validation.errors
        })
        return false
      }

      // Store updated state
      this.agentStates.set(agentId, updatedState)

      // Add to history
      await this.addToHistory(agentId, updatedState)

      this.logger.info(`State updated successfully for agent ${agentId}`, {
        agentId,
        version: updatedState.version
      })

      // Record metric
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'STATE' as any,
        name: 'state_updates',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { version: updatedState.version }
      })

      // Emit event
      this.emit('stateUpdated', { agentId, state: updatedState })

      return true
    } catch (error) {
      this.logger.error(`Failed to update state for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async deleteAgentState(agentId: string): Promise<boolean> {
    try {
      this.logger.info(`Deleting state for agent ${agentId}`, { agentId })

      const state = this.agentStates.get(agentId)
      if (!state) {
        this.logger.warn(`State not found for agent ${agentId}`, { agentId })
        return false
      }

      // Remove state
      this.agentStates.delete(agentId)

      this.logger.info(`State deleted successfully for agent ${agentId}`, { agentId })

      // Emit event
      this.emit('stateDeleted', { agentId, state })

      return true
    } catch (error) {
      this.logger.error(`Failed to delete state for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async getStateHistory(agentId: string, limit?: number): Promise<StateHistoryEntry[]> {
    try {
      const history = this.stateHistory.get(agentId) || []
      
      // Sort by timestamp (newest first)
      const sortedHistory = [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      // Apply limit
      if (limit && limit > 0) {
        return sortedHistory.slice(0, limit)
      }

      return sortedHistory
    } catch (error) {
      this.logger.error(`Failed to get state history for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async createStateSnapshot(agentId: string, description?: string): Promise<string> {
    try {
      this.logger.info(`Creating state snapshot for agent ${agentId}`, { agentId, description })

      const state = this.agentStates.get(agentId)
      if (!state) {
        throw new Error(`State not found for agent ${agentId}`)
      }

      const snapshot: StateSnapshot = {
        id: uuidv4(),
        agentId,
        state: { ...state },
        description: description || `Snapshot at ${new Date().toISOString()}`,
        createdAt: new Date()
      }

      // Add to snapshots
      if (!this.stateSnapshots.has(agentId)) {
        this.stateSnapshots.set(agentId, [])
      }
      
      const snapshots = this.stateSnapshots.get(agentId)!
      snapshots.push(snapshot)

      // Keep only recent snapshots
      if (snapshots.length > this.maxSnapshots) {
        snapshots.splice(0, snapshots.length - this.maxSnapshots)
      }

      this.logger.info(`State snapshot created successfully for agent ${agentId}`, {
        agentId,
        snapshotId: snapshot.id,
        description
      })

      // Record metric
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'STATE' as any,
        name: 'state_snapshots',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { snapshotId: snapshot.id }
      })

      // Emit event
      this.emit('stateSnapshotCreated', { agentId, snapshot })

      return snapshot.id
    } catch (error) {
      this.logger.error(`Failed to create state snapshot for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async getStateSnapshots(agentId: string): Promise<StateSnapshot[]> {
    try {
      const snapshots = this.stateSnapshots.get(agentId) || []
      
      // Sort by creation date (newest first)
      return [...snapshots].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    } catch (error) {
      this.logger.error(`Failed to get state snapshots for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async restoreStateFromSnapshot(agentId: string, snapshotId: string): Promise<boolean> {
    try {
      this.logger.info(`Restoring state from snapshot for agent ${agentId}`, { agentId, snapshotId })

      const snapshots = this.stateSnapshots.get(agentId)
      if (!snapshots) {
        this.logger.warn(`No snapshots found for agent ${agentId}`, { agentId })
        return false
      }

      const snapshot = snapshots.find(s => s.id === snapshotId)
      if (!snapshot) {
        this.logger.warn(`Snapshot ${snapshotId} not found for agent ${agentId}`, { agentId, snapshotId })
        return false
      }

      // Restore state
      const restoredState: AgentState = {
        ...snapshot.state,
        id: uuidv4(),
        version: (this.agentStates.get(agentId)?.version || 0) + 1,
        updatedAt: new Date()
      }

      // Set restored state
      const success = await this.setAgentState(agentId, restoredState)
      
      if (success) {
        this.logger.info(`State restored successfully from snapshot for agent ${agentId}`, {
          agentId,
          snapshotId,
          version: restoredState.version
        })

        // Record metric
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'STATE' as any,
          name: 'state_restores',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { snapshotId }
        })

        // Emit event
        this.emit('stateRestored', { agentId, snapshot, state: restoredState })
      }

      return success
    } catch (error) {
      this.logger.error(`Failed to restore state from snapshot for agent ${agentId}`, error as Error, { agentId, snapshotId })
      return false
    }
  }

  async addStateValidator(agentId: string, validator: StateValidator): Promise<void> {
    try {
      this.logger.info(`Adding state validator for agent ${agentId}`, { agentId })

      if (!this.stateValidators.has(agentId)) {
        this.stateValidators.set(agentId, [])
      }
      
      const validators = this.stateValidators.get(agentId)!
      validators.push(validator)

      this.logger.info(`State validator added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add state validator for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeStateValidator(agentId: string, validatorName: string): Promise<void> {
    try {
      this.logger.info(`Removing state validator for agent ${agentId}`, { agentId })

      const validators = this.stateValidators.get(agentId)
      if (validators) {
        const index = validators.findIndex(v => v.name === validatorName)
        if (index !== -1) {
          validators.splice(index, 1)
          this.logger.info(`State validator removed successfully for agent ${agentId}`, { agentId })
        } else {
          this.logger.warn(`State validator not found for agent ${agentId}`, { agentId, validatorName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove state validator for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async exportState(agentId: string): Promise<string> {
    try {
      const state = await this.getAgentState(agentId)
      if (!state) {
        throw new Error(`State not found for agent ${agentId}`)
      }

      const exportData = {
        agentId,
        state,
        exportedAt: new Date()
      }

      return JSON.stringify(exportData, null, 2)
    } catch (error) {
      this.logger.error(`Failed to export state for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async importState(agentId: string, stateData: string): Promise<boolean> {
    try {
      this.logger.info(`Importing state for agent ${agentId}`, { agentId })

      const parsedData = JSON.parse(stateData)
      
      if (!parsedData.state) {
        throw new Error('Invalid state data: missing state field')
      }

      const success = await this.setAgentState(agentId, parsedData.state)
      
      if (success) {
        this.logger.info(`State imported successfully for agent ${agentId}`, { agentId })
      }

      return success
    } catch (error) {
      this.logger.error(`Failed to import state for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async getAllAgentStates(): Promise<Record<string, AgentState>> {
    try {
      const states: Record<string, AgentState> = {}
      
      for (const [agentId, state] of this.agentStates.entries()) {
        states[agentId] = state
      }

      return states
    } catch (error) {
      this.logger.error('Failed to get all agent states', error as Error)
      throw error
    }
  }

  async getStateStats(agentId?: string): Promise<StateStats> {
    try {
      let totalStates = 0
      let totalHistoryEntries = 0
      let totalSnapshots = 0
      let statesByAgent: Record<string, number> = {}

      if (agentId) {
        // Get stats for specific agent
        totalStates = this.agentStates.has(agentId) ? 1 : 0
        totalHistoryEntries = this.stateHistory.get(agentId)?.length || 0
        totalSnapshots = this.stateSnapshots.get(agentId)?.length || 0
        statesByAgent[agentId] = totalStates
      } else {
        // Get stats for all agents
        totalStates = this.agentStates.size
        
        for (const history of this.stateHistory.values()) {
          totalHistoryEntries += history.length
        }
        
        for (const snapshots of this.stateSnapshots.values()) {
          totalSnapshots += snapshots.length
        }
        
        for (const agentId of this.agentStates.keys()) {
          statesByAgent[agentId] = 1
        }
      }

      return {
        totalStates,
        totalHistoryEntries,
        totalSnapshots,
        statesByAgent
      }
    } catch (error) {
      this.logger.error('Failed to get state stats', error as Error, { agentId })
      throw error
    }
  }

  private async validateState(agentId: string, state: AgentState): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      // Get validators for this agent
      const validators = this.stateValidators.get(agentId) || []

      // Run all validators
      for (const validator of validators) {
        try {
          const result = await validator.validate(state)
          if (!result.valid) {
            errors.push(...result.errors)
          }
        } catch (error) {
          errors.push(`Validator ${validator.name} failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      return {
        valid: errors.length === 0,
        errors
      }
    } catch (error) {
      this.logger.error(`Failed to validate state for agent ${agentId}`, error as Error, { agentId })
      return {
        valid: false,
        errors: ['Validation failed due to internal error']
      }
    }
  }

  private async addToHistory(agentId: string, state: AgentState): Promise<void> {
    try {
      if (!this.stateHistory.has(agentId)) {
        this.stateHistory.set(agentId, [])
      }
      
      const history = this.stateHistory.get(agentId)!
      
      const historyEntry: StateHistoryEntry = {
        id: uuidv4(),
        agentId,
        state: { ...state },
        timestamp: new Date(),
        action: 'UPDATE'
      }
      
      history.push(historyEntry)
      
      // Keep only recent history
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    } catch (error) {
      this.logger.error(`Failed to add state to history for agent ${agentId}`, error as Error, { agentId })
    }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      await this.autoSaveStates()
    }, this.autoSaveInterval)
  }

  private async autoSaveStates(): Promise<void> {
    try {
      this.logger.debug('Auto-saving agent states')
      
      // Emit auto-save event
      this.emit('autoSave', { states: Array.from(this.agentStates.values()) })
    } catch (error) {
      this.logger.error('Failed to auto-save states', error as Error)
    }
  }

  // Cleanup
  destroy(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer)
      this.autoSaveTimer = null
    }
  }

  // Utility methods
  getAgentCount(): number {
    return this.agentStates.size
  }

  hasAgentState(agentId: string): boolean {
    return this.agentStates.has(agentId)
  }

  getStateVersion(agentId: string): number {
    return this.agentStates.get(agentId)?.version || 0
  }

  getLastUpdateTime(agentId: string): Date | null {
    return this.agentStates.get(agentId)?.updatedAt || null
  }
}

interface AgentState {
  id: string
  agentId: string
  data: any
  metadata?: any
  version: number
  createdAt: Date
  updatedAt: Date
}

interface StateHistoryEntry {
  id: string
  agentId: string
  state: AgentState
  timestamp: Date
  action: 'CREATE' | 'UPDATE' | 'DELETE'
}

interface StateSnapshot {
  id: string
  agentId: string
  state: AgentState
  description: string
  createdAt: Date
}

interface StateValidator {
  name: string
  validate: (state: AgentState) => Promise<{ valid: boolean; errors: string[] }>
}

interface StateStats {
  totalStates: number
  totalHistoryEntries: number
  totalSnapshots: number
  statesByAgent: Record<string, number>
}