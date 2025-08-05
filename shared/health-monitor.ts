/**
 * Health Monitor - System-wide health checking and monitoring
 * Monitors all components and provides self-healing capabilities
 */

import { EventEmitter } from 'events';
import { createLogger } from '@rusty-butter/logger';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('health-monitor');

export interface ComponentHealth {
  name: string;
  type: 'monitor' | 'tool' | 'orchestrator' | 'external';
  status: 'healthy' | 'degraded' | 'failing' | 'offline';
  lastCheck: Date;
  lastHealthy: Date;
  errorCount: number;
  responseTime?: number;
  metadata: {
    pid?: number;
    port?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    uptime?: number;
    version?: string;
  };
  issues: string[];
}

export interface HealthCheckConfig {
  interval: number; // milliseconds
  timeout: number; // milliseconds
  retryCount: number;
  autoRestart: boolean;
  alertThresholds: {
    errorRate: number; // errors per minute
    responseTime: number; // milliseconds
    memoryUsage: number; // MB
    cpuUsage: number; // percentage
  };
}

export interface HealthAlert {
  id: string;
  component: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  metadata?: any;
}

export class HealthMonitor extends EventEmitter {
  private components: Map<string, ComponentHealth> = new Map();
  private config: HealthCheckConfig;
  private checkInterval?: NodeJS.Timeout;
  private alerts: Map<string, HealthAlert> = new Map();
  private isRunning = false;

  constructor(config?: Partial<HealthCheckConfig>) {
    super();
    this.config = {
      interval: 30000, // 30 seconds
      timeout: 5000, // 5 seconds
      retryCount: 3,
      autoRestart: true,
      alertThresholds: {
        errorRate: 10, // 10 errors per minute
        responseTime: 5000, // 5 seconds
        memoryUsage: 1024, // 1GB
        cpuUsage: 80, // 80%
      },
      ...config,
    };

    logger.info('Health Monitor initialized');
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(
    name: string,
    type: ComponentHealth['type'],
    checkConfig?: {
      endpoint?: string;
      pid?: number;
      port?: number;
      healthCheckCommand?: string;
    }
  ): void {
    const health: ComponentHealth = {
      name,
      type,
      status: 'offline',
      lastCheck: new Date(),
      lastHealthy: new Date(),
      errorCount: 0,
      metadata: {
        pid: checkConfig?.pid,
        port: checkConfig?.port,
      },
      issues: [],
    };

    this.components.set(name, health);
    logger.info(`Registered component for health monitoring: ${name} (${type})`);
  }

  /**
   * Start health monitoring
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }

    this.isRunning = true;
    
    // Initial health check
    this.performHealthChecks();
    
    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.interval);

    logger.info(`Health monitoring started (interval: ${this.config.interval}ms)`);
    this.emit('started');
  }

  /**
   * Stop health monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }

    logger.info('Health monitoring stopped');
    this.emit('stopped');
  }

  /**
   * Perform health checks on all registered components
   */
  private async performHealthChecks(): Promise<void> {
    logger.debug(`Performing health checks on ${this.components.size} components`);

    const checkPromises = Array.from(this.components.keys()).map(componentName =>
      this.checkComponentHealth(componentName)
    );

    try {
      await Promise.allSettled(checkPromises);
    } catch (error) {
      logger.error('Error during health checks:', error);
    }

    // Emit overall health status
    this.emitHealthStatus();
  }

  /**
   * Check health of a specific component
   */
  private async checkComponentHealth(componentName: string): Promise<void> {
    const component = this.components.get(componentName);
    if (!component) return;

    const startTime = Date.now();
    let newStatus: ComponentHealth['status'] = 'offline';
    const issues: string[] = [];

    try {
      switch (component.type) {
        case 'monitor':
        case 'orchestrator':
          newStatus = await this.checkProcessHealth(component);
          break;
        case 'tool':
          newStatus = await this.checkToolHealth(component);
          break;
        case 'external':
          newStatus = await this.checkExternalHealth(component);
          break;
      }

      const responseTime = Date.now() - startTime;
      
      // Update component health
      component.lastCheck = new Date();
      component.responseTime = responseTime;
      
      if (newStatus === 'healthy') {
        component.lastHealthy = new Date();
        component.errorCount = Math.max(0, component.errorCount - 1); // Slowly decrease error count
      } else {
        component.errorCount++;
        issues.push(`Component unhealthy: ${newStatus}`);
      }

      // Check response time threshold
      if (responseTime > this.config.alertThresholds.responseTime) {
        issues.push(`High response time: ${responseTime}ms`);
        newStatus = newStatus === 'healthy' ? 'degraded' : newStatus;
      }

      component.status = newStatus;
      component.issues = issues;

      // Generate alerts if needed
      await this.checkAlertConditions(component);

    } catch (error) {
      component.errorCount++;
      component.status = 'failing';
      component.issues = [`Health check failed: ${error}`];
      
      logger.error(`Health check failed for ${componentName}:`, error);
      
      await this.generateAlert(componentName, 'error', `Health check failed: ${error}`);
    }
  }

  /**
   * Check health of a process-based component (monitor/orchestrator)
   */
  private async checkProcessHealth(component: ComponentHealth): Promise<ComponentHealth['status']> {
    if (!component.metadata.pid) {
      return 'offline';
    }

    try {
      // Check if process is running
      process.kill(component.metadata.pid, 0); // Signal 0 doesn't kill, just checks existence
      
      // Get process stats if available
      const stats = await this.getProcessStats(component.metadata.pid);
      if (stats) {
        component.metadata.memoryUsage = stats.memory;
        component.metadata.cpuUsage = stats.cpu;
        component.metadata.uptime = stats.uptime;
      }

      return 'healthy';
    } catch (error) {
      return 'offline';
    }
  }

  /**
   * Check health of a tool server
   */
  private async checkToolHealth(component: ComponentHealth): Promise<ComponentHealth['status']> {
    if (!component.metadata.port) {
      return 'offline';
    }

    try {
      // Simple TCP connection check
      const { createConnection } = await import('net');
      
      return new Promise<ComponentHealth['status']>((resolve) => {
        const socket = createConnection(component.metadata.port!, 'localhost');
        
        socket.on('connect', () => {
          socket.end();
          resolve('healthy');
        });
        
        socket.on('error', () => {
          resolve('offline');
        });
        
        setTimeout(() => {
          socket.destroy();
          resolve('offline');
        }, this.config.timeout);
      });
    } catch (error) {
      return 'offline';
    }
  }

  /**
   * Check health of external dependencies
   */
  private async checkExternalHealth(component: ComponentHealth): Promise<ComponentHealth['status']> {
    // This would check external services like databases, APIs, etc.
    // For now, just return healthy as a placeholder
    return 'healthy';
  }

  /**
   * Get process statistics
   */
  private async getProcessStats(pid: number): Promise<{ memory: number; cpu: number; uptime: number } | null> {
    try {
      // Read process stats from /proc on Linux
      const statPath = `/proc/${pid}/stat`;
      const statusPath = `/proc/${pid}/status`;
      
      try {
        const statusContent = await fs.readFile(statusPath, 'utf8');
        const memoryMatch = statusContent.match(/VmRSS:\s+(\d+)\s+kB/);
        const memory = memoryMatch ? parseInt(memoryMatch[1]) / 1024 : 0; // Convert to MB
        
        return {
          memory,
          cpu: 0, // CPU calculation is more complex, placeholder for now
          uptime: Date.now() / 1000, // Placeholder
        };
      } catch {
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if component needs alerts
   */
  private async checkAlertConditions(component: ComponentHealth): Promise<void> {
    const now = Date.now();
    const thresholds = this.config.alertThresholds;

    // Check error rate (errors per minute)
    const timeSinceLastHealthy = now - component.lastHealthy.getTime();
    const errorRate = (component.errorCount / (timeSinceLastHealthy / 60000)) || 0;

    if (errorRate > thresholds.errorRate) {
      await this.generateAlert(
        component.name,
        'warning',
        `High error rate: ${errorRate.toFixed(2)} errors/min`
      );
    }

    // Check memory usage
    if (component.metadata.memoryUsage && component.metadata.memoryUsage > thresholds.memoryUsage) {
      await this.generateAlert(
        component.name,
        'warning',
        `High memory usage: ${component.metadata.memoryUsage}MB`
      );
    }

    // Check CPU usage
    if (component.metadata.cpuUsage && component.metadata.cpuUsage > thresholds.cpuUsage) {
      await this.generateAlert(
        component.name,
        'warning',
        `High CPU usage: ${component.metadata.cpuUsage}%`
      );
    }

    // Check if component has been offline for too long
    if (component.status === 'offline' && timeSinceLastHealthy > 5 * 60 * 1000) { // 5 minutes
      await this.generateAlert(
        component.name,
        'critical',
        `Component offline for ${Math.round(timeSinceLastHealthy / 60000)} minutes`
      );
      
      // Auto-restart if enabled
      if (this.config.autoRestart) {
        await this.attemptRestart(component);
      }
    }
  }

  /**
   * Generate a health alert
   */
  private async generateAlert(
    componentName: string,
    severity: HealthAlert['severity'],
    message: string,
    metadata?: any
  ): Promise<void> {
    const alertId = `${componentName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alert: HealthAlert = {
      id: alertId,
      component: componentName,
      severity,
      message,
      timestamp: new Date(),
      acknowledged: false,
      metadata,
    };

    this.alerts.set(alertId, alert);
    
    logger[severity === 'critical' ? 'error' : severity === 'error' ? 'error' : 'warn'](
      `[${componentName}] ${message}`,
      metadata
    );

    this.emit('alert', alert);
  }

  /**
   * Attempt to restart a failed component
   */
  private async attemptRestart(component: ComponentHealth): Promise<void> {
    logger.info(`Attempting to restart component: ${component.name}`);
    
    try {
      // This would contain restart logic specific to each component type
      // For now, just emit an event that the orchestrator can handle
      this.emit('restart-requested', {
        componentName: component.name,
        componentType: component.type,
        reason: 'health-check-failure',
      });
      
      await this.generateAlert(
        component.name,
        'info',
        'Restart requested due to health check failure'
      );
    } catch (error) {
      logger.error(`Failed to restart component ${component.name}:`, error);
      
      await this.generateAlert(
        component.name,
        'error',
        `Restart failed: ${error}`
      );
    }
  }

  /**
   * Emit overall health status
   */
  private emitHealthStatus(): void {
    const components = Array.from(this.components.values());
    const totalComponents = components.length;
    const healthyComponents = components.filter(c => c.status === 'healthy').length;
    const degradedComponents = components.filter(c => c.status === 'degraded').length;
    const failingComponents = components.filter(c => c.status === 'failing').length;
    const offlineComponents = components.filter(c => c.status === 'offline').length;

    const overallStatus = offlineComponents > 0 || failingComponents > 0 
      ? 'unhealthy' 
      : degradedComponents > 0 
        ? 'degraded' 
        : 'healthy';

    this.emit('health-status', {
      overall: overallStatus,
      components: {
        total: totalComponents,
        healthy: healthyComponents,
        degraded: degradedComponents,
        failing: failingComponents,
        offline: offlineComponents,
      },
      timestamp: new Date(),
    });
  }

  /**
   * Get current health status of all components
   */
  getHealthStatus(): {
    overall: string;
    components: ComponentHealth[];
    alerts: HealthAlert[];
  } {
    const components = Array.from(this.components.values());
    const alerts = Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const overallStatus = components.some(c => c.status === 'offline' || c.status === 'failing')
      ? 'unhealthy'
      : components.some(c => c.status === 'degraded')
        ? 'degraded'
        : 'healthy';

    return {
      overall: overallStatus,
      components,
      alerts,
    };
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      logger.info(`Alert acknowledged: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Clear old alerts
   */
  clearOldAlerts(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    
    for (const [alertId, alert] of this.alerts) {
      if (alert.timestamp.getTime() < cutoff) {
        this.alerts.delete(alertId);
      }
    }
  }
}