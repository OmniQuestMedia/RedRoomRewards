/**
 * Ledger Transaction Controller
 * 
 * REST API controller for ledger transaction operations with full idempotency support.
 * Demonstrates integration of the idempotency framework for financial transactions.
 * 
 * @module api/src/modules/ledger/controllers
 */

import { Controller, Post, Get, Body, Param, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { Idempotent } from '../guards/idempotency.guard';
import { IIdempotencyService } from '../types/idempotency.types';
import { createIdempotencyService } from '../services/idempotency.service';

/**
 * Request interface for creating a ledger transaction
 */
export interface CreateTransactionRequest {
  /** Unique idempotency key (UUID) */
  idempotencyKey: string;
  
  /** User or model account ID */
  accountId: string;
  
  /** Account type */
  accountType: 'user' | 'model';
  
  /** Transaction amount */
  amount: number;
  
  /** Transaction type */
  type: 'credit' | 'debit';
  
  /** Balance state affected */
  balanceState: 'available' | 'escrow' | 'earned';
  
  /** Reason code */
  reason: string;
  
  /** Request ID for tracing */
  requestId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Response interface for transaction creation
 */
export interface TransactionResponse {
  /** Transaction ID */
  transactionId: string;
  
  /** Entry ID */
  entryId: string;
  
  /** Account ID */
  accountId: string;
  
  /** Transaction amount */
  amount: number;
  
  /** Transaction type */
  type: string;
  
  /** Balance before */
  balanceBefore: number;
  
  /** Balance after */
  balanceAfter: number;
  
  /** Timestamp */
  timestamp: string;
  
  /** Idempotency key used */
  idempotencyKey: string;
}

/**
 * Ledger Transaction Controller
 * 
 * Provides endpoints for creating and querying ledger transactions
 * with built-in idempotency protection.
 */
@Controller('api/ledger/transactions')
export class LedgerTransactionController {
  private readonly idempotencyService: IIdempotencyService;

  constructor() {
    this.idempotencyService = createIdempotencyService();
  }

  /**
   * Create a new ledger transaction
   * 
   * This endpoint is protected by idempotency checks to prevent
   * duplicate transactions. The idempotency key MUST be a valid UUID.
   * 
   * @param body - Transaction request data
   * @param headers - Request headers (must include Idempotency-Key)
   * @returns Transaction response with created entry details
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Idempotent({ operationType: 'ledger_transaction', required: true })
  async createTransaction(
    @Body() body: CreateTransactionRequest,
    @Headers('idempotency-key') idempotencyKey?: string
  ): Promise<TransactionResponse> {
    // Note: Idempotency validation is handled by guard/middleware
    // This handler only executes for new (non-duplicate) requests
    
    // Validate request
    this.validateTransactionRequest(body);

    // In a real implementation, this would call the ledger service
    // For now, return a mock response demonstrating the structure
    const response: TransactionResponse = {
      transactionId: `txn-${Date.now()}`,
      entryId: `entry-${Date.now()}`,
      accountId: body.accountId,
      amount: body.amount,
      type: body.type,
      balanceBefore: 0, // Would be fetched from wallet service
      balanceAfter: body.amount,
      timestamp: new Date().toISOString(),
      idempotencyKey: body.idempotencyKey,
    };

    // Store result for future duplicate requests
    await this.idempotencyService.storeResult({
      idempotencyKey: body.idempotencyKey,
      operationType: 'ledger_transaction',
      result: response,
      statusCode: 201,
    });

    return response;
  }

  /**
   * Get transaction by ID
   * 
   * @param transactionId - Transaction identifier
   * @returns Transaction details
   */
  @Get(':transactionId')
  async getTransaction(@Param('transactionId') transactionId: string): Promise<TransactionResponse> {
    // Mock implementation
    return {
      transactionId,
      entryId: `entry-${transactionId}`,
      accountId: 'user-123',
      amount: 100,
      type: 'credit',
      balanceBefore: 0,
      balanceAfter: 100,
      timestamp: new Date().toISOString(),
      idempotencyKey: 'stored-key',
    };
  }

  /**
   * Validate transaction request
   * 
   * @param request - Request to validate
   * @throws Error if validation fails
   */
  private validateTransactionRequest(request: CreateTransactionRequest): void {
    if (!request.accountId) {
      throw new Error('accountId is required');
    }

    if (!request.accountType || !['user', 'model'].includes(request.accountType)) {
      throw new Error('accountType must be "user" or "model"');
    }

    if (typeof request.amount !== 'number' || request.amount <= 0) {
      throw new Error('amount must be a positive number');
    }

    if (!request.type || !['credit', 'debit'].includes(request.type)) {
      throw new Error('type must be "credit" or "debit"');
    }

    if (!request.balanceState || !['available', 'escrow', 'earned'].includes(request.balanceState)) {
      throw new Error('balanceState must be "available", "escrow", or "earned"');
    }

    if (!request.idempotencyKey) {
      throw new Error('idempotencyKey is required');
    }

    // Validate UUID format
    const validation = this.idempotencyService.validateUuid(request.idempotencyKey);
    if (!validation.isValid) {
      throw new Error(`Invalid idempotencyKey: ${validation.errorMessage}`);
    }
  }
}
