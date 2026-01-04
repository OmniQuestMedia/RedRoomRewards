/**
 * Database Connection and Configuration
 * 
 * Central module for MongoDB connection management
 */

import mongoose from 'mongoose';
import { MetricsLogger } from '../metrics/logger';
import { AlertSeverity } from '../metrics/types';

export interface DatabaseConfig {
  uri: string;
  options?: mongoose.ConnectOptions;
}

/**
 * Connect to MongoDB
 */
export async function connectDatabase(config: DatabaseConfig): Promise<typeof mongoose> {
  const options: mongoose.ConnectOptions = {
    ...config.options,
  };

  try {
    await mongoose.connect(config.uri, options);
    
    // Log connection success (no sensitive data)
    MetricsLogger.logAlert({
      severity: AlertSeverity.INFO,
      message: 'MongoDB connected successfully',
      metricType: 'database_connection',
      timestamp: new Date(),
      metadata: {
        readyState: mongoose.connection.readyState,
      },
    });
    
    return mongoose;
  } catch (error) {
    // Log connection error (no sensitive data in error message)
    MetricsLogger.logAlert({
      severity: AlertSeverity.CRITICAL,
      message: 'MongoDB connection error',
      metricType: 'database_connection_error',
      timestamp: new Date(),
      metadata: {
        errorType: error instanceof Error ? error.name : 'Unknown',
        // Do not log full error details which may contain connection strings
      },
    });
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  
  MetricsLogger.logAlert({
    severity: AlertSeverity.INFO,
    message: 'MongoDB disconnected',
    metricType: 'database_disconnection',
    timestamp: new Date(),
  });
}

/**
 * Get connection status
 */
export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
