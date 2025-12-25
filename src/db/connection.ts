/**
 * Database Connection and Configuration
 * 
 * Central module for MongoDB connection management
 */

import mongoose from 'mongoose';

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
    console.log('MongoDB connected successfully');
    return mongoose;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}

/**
 * Get connection status
 */
export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
