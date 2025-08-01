import {
  ILogger,
  IMonitoringService,
  IErrorHandler
} from './types'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

interface IConfigurationManager {
  getConfiguration(agentId: string): Promise<any>
  setConfiguration(agentId: string, config: any): Promise<boolean>
  updateConfiguration(agentId: string, updates: any): Promise<boolean>
  deleteConfiguration(agentId: string): Promise<boolean>
  createConfigurationTemplate(template: any): Promise<string>
  getConfigurationTemplate(templateName: string): Promise<any>
  applyConfigurationTemplate(agentId: string, templateName: string, overrides?: any): Promise<boolean>
  getConfigurationHistory(agentId: string, limit?: number): Promise<any[]>
  addConfigurationValidator(agentId: string, validator: any): Promise<void>
  removeConfigurationValidator(agentId: string, validatorName: string): Promise<void>
  exportConfiguration(agentId: string): Promise<string>
  importConfiguration(agentId: string, configData: string): Promise<boolean>
  getAllConfigurations(): Promise<Record<string, any>>
  getConfigurationStats(agentId?: string): Promise<any>
}

export class ConfigurationManager extends EventEmitter implements IConfigurationManager {
  private logger: ILogger
  private monitoringService: IMonitoringService
  private errorHandler: IErrorHandler
  private configurations: Map<string, AgentConfiguration> = new Map()
  private configurationTemplates: Map<string, ConfigurationTemplate> = new Map()
  private configurationHistory: Map<string, ConfigurationHistoryEntry[]> = new Map()
  private configurationValidators: Map<string, ConfigurationValidator[]> = new Map()
  private maxHistorySize: number = 1000
  private autoSaveInterval: number = 30000 // 30 seconds
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

  async getConfiguration(agentId: string): Promise<AgentConfiguration | null> {
    try {
      const config = this.configurations.get(agentId)
      
      if (!config) {
        this.logger.debug(`Configuration not found for agent ${agentId}`, { agentId })
        return null
      }

      this.logger.debug(`Configuration retrieved for agent ${agentId}`, { agentId })
      return config
    } catch (error) {
      this.logger.error(`Failed to get configuration for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async setConfiguration(agentId: string, config: AgentConfiguration): Promise<boolean> {
    try {
      this.logger.info(`Setting configuration for agent ${agentId}`, { agentId, config })

      // Validate configuration
      const validation = await this.validateConfiguration(agentId, config)
      if (!validation.valid) {
        this.logger.error(`Configuration validation failed for agent ${agentId}`, undefined, {
          agentId,
          errors: validation.errors
        })
        return false
      }

      const existingConfig = this.configurations.get(agentId)
      
      // Create configuration object
      const fullConfig: AgentConfiguration = {
        ...config,
        id: uuidv4(),
        agentId,
        version: existingConfig ? existingConfig.version + 1 : 1,
        createdAt: existingConfig ? existingConfig.createdAt : new Date(),
        updatedAt: new Date()
      }

      // Store configuration
      this.configurations.set(agentId, fullConfig)

      // Add to history
      await this.addToHistory(agentId, fullConfig)

      this.logger.info(`Configuration set successfully for agent ${agentId}`, {
        agentId,
        version: fullConfig.version
      })

      // Record metric
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'CONFIGURATION' as any,
        name: 'configuration_updates',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { version: fullConfig.version }
      })

      // Emit event
      this.emit('configurationSet', { agentId, configuration: fullConfig })

      return true
    } catch (error) {
      this.logger.error(`Failed to set configuration for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async updateConfiguration(agentId: string, updates: Partial<AgentConfiguration>): Promise<boolean> {
    try {
      this.logger.info(`Updating configuration for agent ${agentId}`, { agentId, updates })

      const existingConfig = this.configurations.get(agentId)
      if (!existingConfig) {
        this.logger.warn(`Configuration not found for agent ${agentId}`, { agentId })
        return false
      }

      // Merge updates with existing configuration
      const updatedConfig: AgentConfiguration = {
        ...existingConfig,
        ...updates,
        id: uuidv4(),
        version: existingConfig.version + 1,
        updatedAt: new Date()
      }

      // Validate updated configuration
      const validation = await this.validateConfiguration(agentId, updatedConfig)
      if (!validation.valid) {
        this.logger.error(`Configuration validation failed for agent ${agentId}`, undefined, {
          agentId,
          errors: validation.errors
        })
        return false
      }

      // Store updated configuration
      this.configurations.set(agentId, updatedConfig)

      // Add to history
      await this.addToHistory(agentId, updatedConfig)

      this.logger.info(`Configuration updated successfully for agent ${agentId}`, {
        agentId,
        version: updatedConfig.version
      })

      // Record metric
      await this.monitoringService.recordMetric(agentId, {
        id: uuidv4(),
        agentId,
        type: 'CONFIGURATION' as any,
        name: 'configuration_updates',
        value: 1,
        unit: 'count',
        timestamp: new Date(),
        metadata: { version: updatedConfig.version }
      })

      // Emit event
      this.emit('configurationUpdated', { agentId, configuration: updatedConfig })

      return true
    } catch (error) {
      this.logger.error(`Failed to update configuration for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async deleteConfiguration(agentId: string): Promise<boolean> {
    try {
      this.logger.info(`Deleting configuration for agent ${agentId}`, { agentId })

      const config = this.configurations.get(agentId)
      if (!config) {
        this.logger.warn(`Configuration not found for agent ${agentId}`, { agentId })
        return false
      }

      // Remove configuration
      this.configurations.delete(agentId)

      this.logger.info(`Configuration deleted successfully for agent ${agentId}`, { agentId })

      // Emit event
      this.emit('configurationDeleted', { agentId, configuration: config })

      return true
    } catch (error) {
      this.logger.error(`Failed to delete configuration for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async createConfigurationTemplate(template: ConfigurationTemplate): Promise<string> {
    try {
      this.logger.info(`Creating configuration template ${template.name}`, { template })

      const fullTemplate: ConfigurationTemplate = {
        ...template,
        id: uuidv4(),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Store template
      this.configurationTemplates.set(template.name, fullTemplate)

      this.logger.info(`Configuration template created successfully`, {
        templateName: template.name,
        templateId: fullTemplate.id
      })

      // Emit event
      this.emit('templateCreated', { template: fullTemplate })

      return fullTemplate.id
    } catch (error) {
      this.logger.error(`Failed to create configuration template ${template.name}`, error as Error, { template })
      throw error
    }
  }

  async getConfigurationTemplate(templateName: string): Promise<ConfigurationTemplate | null> {
    try {
      const template = this.configurationTemplates.get(templateName)
      
      if (!template) {
        this.logger.debug(`Configuration template not found: ${templateName}`, { templateName })
        return null
      }

      this.logger.debug(`Configuration template retrieved: ${templateName}`, { templateName })
      return template
    } catch (error) {
      this.logger.error(`Failed to get configuration template ${templateName}`, error as Error, { templateName })
      throw error
    }
  }

  async applyConfigurationTemplate(agentId: string, templateName: string, overrides?: any): Promise<boolean> {
    try {
      this.logger.info(`Applying configuration template ${templateName} to agent ${agentId}`, { agentId, templateName, overrides })

      const template = this.configurationTemplates.get(templateName)
      if (!template) {
        this.logger.warn(`Configuration template not found: ${templateName}`, { templateName })
        return false
      }

      // Create configuration from template
      const config: AgentConfiguration = {
        id: uuidv4(),
        agentId,
        name: template.name,
        version: 1,
        settings: { ...template.defaultSettings, ...overrides },
        metadata: template.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Validate configuration
      const validation = await this.validateConfiguration(agentId, config)
      if (!validation.valid) {
        this.logger.error(`Configuration validation failed for agent ${agentId}`, undefined, {
          agentId,
          errors: validation.errors
        })
        return false
      }

      // Set configuration
      const success = await this.setConfiguration(agentId, config)
      
      if (success) {
        this.logger.info(`Configuration template applied successfully to agent ${agentId}`, {
          agentId,
          templateName
        })

        // Record metric
        await this.monitoringService.recordMetric(agentId, {
          id: uuidv4(),
          agentId,
          type: 'CONFIGURATION' as any,
          name: 'template_applied',
          value: 1,
          unit: 'count',
          timestamp: new Date(),
          metadata: { templateName }
        })

        // Emit event
        this.emit('templateApplied', { agentId, templateName, configuration: config })
      }

      return success
    } catch (error) {
      this.logger.error(`Failed to apply configuration template ${templateName} to agent ${agentId}`, error as Error, { agentId, templateName })
      return false
    }
  }

  async getConfigurationHistory(agentId: string, limit?: number): Promise<ConfigurationHistoryEntry[]> {
    try {
      const history = this.configurationHistory.get(agentId) || []
      
      // Sort by timestamp (newest first)
      const sortedHistory = [...history].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

      // Apply limit
      if (limit && limit > 0) {
        return sortedHistory.slice(0, limit)
      }

      return sortedHistory
    } catch (error) {
      this.logger.error(`Failed to get configuration history for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async addConfigurationValidator(agentId: string, validator: ConfigurationValidator): Promise<void> {
    try {
      this.logger.info(`Adding configuration validator for agent ${agentId}`, { agentId })

      if (!this.configurationValidators.has(agentId)) {
        this.configurationValidators.set(agentId, [])
      }
      
      const validators = this.configurationValidators.get(agentId)!
      validators.push(validator)

      this.logger.info(`Configuration validator added successfully for agent ${agentId}`, { agentId })
    } catch (error) {
      this.logger.error(`Failed to add configuration validator for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async removeConfigurationValidator(agentId: string, validatorName: string): Promise<void> {
    try {
      this.logger.info(`Removing configuration validator for agent ${agentId}`, { agentId })

      const validators = this.configurationValidators.get(agentId)
      if (validators) {
        const index = validators.findIndex(v => v.name === validatorName)
        if (index !== -1) {
          validators.splice(index, 1)
          this.logger.info(`Configuration validator removed successfully for agent ${agentId}`, { agentId })
        } else {
          this.logger.warn(`Configuration validator not found for agent ${agentId}`, { agentId, validatorName })
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove configuration validator for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async exportConfiguration(agentId: string): Promise<string> {
    try {
      const config = await this.getConfiguration(agentId)
      if (!config) {
        throw new Error(`Configuration not found for agent ${agentId}`)
      }

      const exportData = {
        agentId,
        configuration: config,
        exportedAt: new Date()
      }

      return JSON.stringify(exportData, null, 2)
    } catch (error) {
      this.logger.error(`Failed to export configuration for agent ${agentId}`, error as Error, { agentId })
      throw error
    }
  }

  async importConfiguration(agentId: string, configData: string): Promise<boolean> {
    try {
      this.logger.info(`Importing configuration for agent ${agentId}`, { agentId })

      const parsedData = JSON.parse(configData)
      
      if (!parsedData.configuration) {
        throw new Error('Invalid configuration data: missing configuration field')
      }

      const success = await this.setConfiguration(agentId, parsedData.configuration)
      
      if (success) {
        this.logger.info(`Configuration imported successfully for agent ${agentId}`, { agentId })
      }

      return success
    } catch (error) {
      this.logger.error(`Failed to import configuration for agent ${agentId}`, error as Error, { agentId })
      return false
    }
  }

  async getAllConfigurations(): Promise<Record<string, AgentConfiguration>> {
    try {
      const configs: Record<string, AgentConfiguration> = {}
      
      for (const [agentId, config] of this.configurations.entries()) {
        configs[agentId] = config
      }

      return configs
    } catch (error) {
      this.logger.error('Failed to get all configurations', error as Error)
      throw error
    }
  }

  async getConfigurationStats(agentId?: string): Promise<ConfigurationStats> {
    try {
      let totalConfigurations = 0
      let totalTemplates = 0
      let configurationsByAgent: Record<string, number> = {}
      let totalHistoryEntries = 0

      if (agentId) {
        // Get stats for specific agent
        totalConfigurations = this.configurations.has(agentId) ? 1 : 0
        totalHistoryEntries = this.configurationHistory.get(agentId)?.length || 0
        configurationsByAgent[agentId] = totalConfigurations
      } else {
        // Get stats for all agents
        totalConfigurations = this.configurations.size
        totalTemplates = this.configurationTemplates.size
        
        for (const history of this.configurationHistory.values()) {
          totalHistoryEntries += history.length
        }
        
        for (const agentId of this.configurations.keys()) {
          configurationsByAgent[agentId] = 1
        }
      }

      return {
        totalConfigurations,
        totalTemplates,
        totalHistoryEntries,
        configurationsByAgent
      }
    } catch (error) {
      this.logger.error('Failed to get configuration stats', error as Error, { agentId })
      throw error
    }
  }

  private async validateConfiguration(agentId: string, config: AgentConfiguration): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    try {
      // Get validators for this agent
      const validators = this.configurationValidators.get(agentId) || []

      // Run all validators
      for (const validator of validators) {
        try {
          const result = await validator.validate(config)
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
      this.logger.error(`Failed to validate configuration for agent ${agentId}`, error as Error, { agentId })
      return {
        valid: false,
        errors: ['Validation failed due to internal error']
      }
    }
  }

  private async addToHistory(agentId: string, config: AgentConfiguration): Promise<void> {
    try {
      if (!this.configurationHistory.has(agentId)) {
        this.configurationHistory.set(agentId, [])
      }
      
      const history = this.configurationHistory.get(agentId)!
      
      const historyEntry: ConfigurationHistoryEntry = {
        id: uuidv4(),
        agentId,
        configuration: { ...config },
        timestamp: new Date(),
        action: 'UPDATE'
      }
      
      history.push(historyEntry)
      
      // Keep only recent history
      if (history.length > this.maxHistorySize) {
        history.splice(0, history.length - this.maxHistorySize)
      }
    } catch (error) {
      this.logger.error(`Failed to add configuration to history for agent ${agentId}`, error as Error, { agentId })
    }
  }

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      await this.autoSaveConfigurations()
    }, this.autoSaveInterval)
  }

  private async autoSaveConfigurations(): Promise<void> {
    try {
      this.logger.debug('Auto-saving agent configurations')
      
      // Emit auto-save event
      this.emit('autoSave', { configurations: Array.from(this.configurations.values()) })
    } catch (error) {
      this.logger.error('Failed to auto-save configurations', error as Error)
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
    return this.configurations.size
  }

  getTemplateCount(): number {
    return this.configurationTemplates.size
  }

  hasConfiguration(agentId: string): boolean {
    return this.configurations.has(agentId)
  }

  getConfigurationVersion(agentId: string): number {
    return this.configurations.get(agentId)?.version || 0
  }

  getLastUpdateTime(agentId: string): Date | null {
    return this.configurations.get(agentId)?.updatedAt || null
  }
}

interface AgentConfiguration {
  id: string
  agentId: string
  name: string
  version: number
  settings: any
  metadata?: any
  createdAt: Date
  updatedAt: Date
}

interface ConfigurationTemplate {
  id: string
  name: string
  description?: string
  defaultSettings: any
  metadata?: any
  createdAt: Date
  updatedAt: Date
}

interface ConfigurationHistoryEntry {
  id: string
  agentId: string
  configuration: AgentConfiguration
  timestamp: Date
  action: 'CREATE' | 'UPDATE' | 'DELETE'
}

interface ConfigurationValidator {
  name: string
  validate: (config: AgentConfiguration) => Promise<{ valid: boolean; errors: string[] }>
}

interface ConfigurationStats {
  totalConfigurations: number
  totalTemplates: number
  totalHistoryEntries: number
  configurationsByAgent: Record<string, number>
}