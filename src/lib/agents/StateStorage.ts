import { IAgentState, StateSnapshot } from './types'
import { PrismaClient } from '@prisma/client'

export interface IStateStorage {
  initialize(): Promise<void>
  saveState(agentId: string, state: IAgentState): Promise<void>
  loadState(agentId: string): Promise<IAgentState | null>
  deleteState(agentId: string): Promise<boolean>
  saveSnapshot(agentId: string, snapshot: StateSnapshot): Promise<void>
  loadSnapshots(agentId: string): Promise<StateSnapshot[]>
  createBackup(agentId: string, state: IAgentState): Promise<string>
  restoreBackup(agentId: string, backupId: string): Promise<IAgentState | null>
  cleanup(): Promise<void>
}

export class StateStorage implements IStateStorage {
  private prisma: PrismaClient
  private initialized = false

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Test database connection
      await this.prisma.$connect()
      this.initialized = true
    } catch (error) {
      console.error('Failed to initialize StateStorage:', error)
      throw error
    }
  }

  public async saveState(agentId: string, state: IAgentState): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // Check if agent exists
      const agent = await this.prisma.agent.findUnique({
        where: { id: agentId }
      })

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`)
      }

      // Create or update agent state
      await this.prisma.agentState.upsert({
        where: { agentId },
        update: {
          state: state.state,
          context: state.context,
          metadata: state.metadata,
          updatedAt: new Date()
        },
        create: {
          agentId,
          state: state.state,
          context: state.context,
          metadata: state.metadata
        }
      })
    } catch (error) {
      console.error(`Failed to save state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async loadState(agentId: string): Promise<IAgentState | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const agentState = await this.prisma.agentState.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' }
      })

      if (!agentState) {
        return null
      }

      return {
        id: agentState.id,
        state: agentState.state as Record<string, any>,
        context: (agentState.context as Record<string, any>) || {},
        metadata: (agentState.metadata as Record<string, any>) || {},
        lastUpdated: agentState.updatedAt
      }
    } catch (error) {
      console.error(`Failed to load state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async deleteState(agentId: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      await this.prisma.agentState.deleteMany({
        where: { agentId }
      })
      
      return true
    } catch (error) {
      console.error(`Failed to delete state for agent ${agentId}:`, error)
      throw error
    }
  }

  public async saveSnapshot(agentId: string, snapshot: StateSnapshot): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      // First, save the state
      await this.saveState(agentId, snapshot.state)

      // Get the saved state record
      const agentState = await this.prisma.agentState.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' }
      })

      if (!agentState) {
        throw new Error(`Failed to save state for snapshot creation`)
      }

      // Create the snapshot
      await this.prisma.stateSnapshot.create({
        data: {
          agentId,
          stateId: agentState.id,
          version: snapshot.version,
          checksum: snapshot.checksum,
          reason: snapshot.metadata?.reason || 'Manual snapshot',
          metadata: snapshot.metadata
        }
      })
    } catch (error) {
      console.error(`Failed to save snapshot for agent ${agentId}:`, error)
      throw error
    }
  }

  public async loadSnapshots(agentId: string): Promise<StateSnapshot[]> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const snapshots = await this.prisma.stateSnapshot.findMany({
        where: { agentId },
        include: {
          state: true
        },
        orderBy: { createdAt: 'desc' }
      })

      return snapshots.map(snapshot => ({
        id: snapshot.id,
        agentId: snapshot.agentId,
        state: {
          id: snapshot.state.id,
          state: snapshot.state.state as Record<string, any>,
          context: (snapshot.state.context as Record<string, any>) || {},
          metadata: (snapshot.state.metadata as Record<string, any>) || {},
          lastUpdated: snapshot.state.updatedAt
        },
        version: snapshot.version,
        timestamp: snapshot.createdAt,
        checksum: snapshot.checksum,
        metadata: (snapshot.metadata as Record<string, any>) || {}
      }))
    } catch (error) {
      console.error(`Failed to load snapshots for agent ${agentId}:`, error)
      throw error
    }
  }

  public async createBackup(agentId: string, state: IAgentState): Promise<string> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const backupId = `${agentId}_${Date.now()}_backup`
      
      // First, save the state
      await this.saveState(agentId, state)

      // Get the saved state record
      const agentState = await this.prisma.agentState.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' }
      })

      if (!agentState) {
        throw new Error(`Failed to save state for backup creation`)
      }

      // Create the backup
      await this.prisma.stateBackup.create({
        data: {
          agentId,
          stateId: agentState.id,
          backupId,
          metadata: {
            createdAt: new Date(),
            reason: 'Automatic backup'
          }
        }
      })
      
      return backupId
    } catch (error) {
      console.error(`Failed to create backup for agent ${agentId}:`, error)
      throw error
    }
  }

  public async restoreBackup(agentId: string, backupId: string): Promise<IAgentState | null> {
    if (!this.initialized) {
      await this.initialize()
    }

    try {
      const backup = await this.prisma.stateBackup.findUnique({
        where: { backupId },
        include: {
          state: true
        }
      })

      if (!backup) {
        return null
      }

      // Update the backup restore timestamp
      await this.prisma.stateBackup.update({
        where: { id: backup.id },
        data: { restoredAt: new Date() }
      })

      // Return the restored state
      return {
        id: backup.state.id,
        state: backup.state.state as Record<string, any>,
        context: (backup.state.context as Record<string, any>) || {},
        metadata: (backup.state.metadata as Record<string, any>) || {},
        lastUpdated: backup.state.updatedAt
      }
    } catch (error) {
      console.error(`Failed to restore backup ${backupId} for agent ${agentId}:`, error)
      throw error
    }
  }

  public async cleanup(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      await this.prisma.$disconnect()
      this.initialized = false
    } catch (error) {
      console.error('Failed to cleanup StateStorage:', error)
      throw error
    }
  }
}