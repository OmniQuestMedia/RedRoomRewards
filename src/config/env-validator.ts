/**
 * Environment Variable Validation
 * 
 * Validates that all required environment variables are set with appropriate values.
 * Enforces security requirements for secrets and credentials.
 * 
 * SECURITY: Prevents application from starting with missing or insecure configuration.
 */

export interface EnvValidationRule {
  /** Environment variable name */
  name: string;
  
  /** Is this variable required? */
  required: boolean;
  
  /** Minimum length for the value (for secrets) */
  minLength?: number;
  
  /** Pattern the value must match (regex) */
  pattern?: RegExp;
  
  /** Description of the variable (for error messages) */
  description: string;
  
  /** Is this a secret that should not be logged? */
  isSecret?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate environment variables against a set of rules
 */
export function validateEnvironment(rules: EnvValidationRule[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const rule of rules) {
    const value = process.env[rule.name];
    
    // Check if required variable is missing
    if (rule.required && !value) {
      errors.push(
        `SECURITY ERROR: Required environment variable ${rule.name} is not set. ` +
        `Description: ${rule.description}`
      );
      continue;
    }
    
    // Skip further validation if optional and not set
    if (!value) {
      continue;
    }
    
    // Check minimum length (important for secrets)
    if (rule.minLength && value.length < rule.minLength) {
      errors.push(
        `SECURITY ERROR: Environment variable ${rule.name} is too short. ` +
        `Minimum length: ${rule.minLength}, current length: ${value.length}. ` +
        `Description: ${rule.description}`
      );
    }
    
    // Check pattern match
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(
        `VALIDATION ERROR: Environment variable ${rule.name} does not match required pattern. ` +
        `Description: ${rule.description}`
      );
    }
    
    // Warning for common insecure values
    if (rule.isSecret && isInsecureSecret(value)) {
      warnings.push(
        `SECURITY WARNING: Environment variable ${rule.name} appears to use an insecure default value. ` +
        `Please use a cryptographically random secret. Description: ${rule.description}`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a secret value is insecure (common defaults, test values, etc.)
 */
function isInsecureSecret(value: string): boolean {
  const insecurePatterns = [
    /^(changeme|password|secret|test|admin|default|demo)/i,
    /^(123|abc|qwerty)/i,
    /^(key|token|pass)$/i,
  ];
  
  return insecurePatterns.some(pattern => pattern.test(value));
}

/**
 * Assert that environment is valid, throw error if not
 */
export function assertValidEnvironment(rules: EnvValidationRule[]): void {
  const result = validateEnvironment(rules);
  
  // Log warnings (non-blocking)
  for (const warning of result.warnings) {
    // Use console.warn here as this is a startup check before logger is initialized
    console.warn(warning);
  }
  
  // Throw error for validation failures (blocking)
  if (!result.valid) {
    const errorMessage = [
      '',
      '═══════════════════════════════════════════════════════════',
      '  ENVIRONMENT VALIDATION FAILED',
      '═══════════════════════════════════════════════════════════',
      '',
      ...result.errors,
      '',
      'Application cannot start with invalid environment configuration.',
      'Please fix the above errors and restart.',
      '═══════════════════════════════════════════════════════════',
      '',
    ].join('\n');
    
    throw new Error(errorMessage);
  }
}

/**
 * Common validation rules for RedRoomRewards
 */
export const COMMON_ENV_RULES: EnvValidationRule[] = [
  {
    name: 'NODE_ENV',
    required: true,
    pattern: /^(development|test|production)$/,
    description: 'Application environment (development, test, or production)',
  },
  {
    name: 'MONGODB_URI',
    required: true,
    minLength: 10,
    description: 'MongoDB connection string',
    isSecret: true,
  },
  {
    name: 'JWT_SECRET',
    required: true,
    minLength: 32,
    description: 'JWT signing secret (minimum 256 bits / 32 characters)',
    isSecret: true,
  },
  {
    name: 'QUEUE_AUTH_SECRET',
    required: true,
    minLength: 32,
    description: 'Queue authorization token secret (minimum 256 bits / 32 characters)',
    isSecret: true,
  },
];

/**
 * Validate environment on module load (fail-fast for security)
 * Only in production - allow flexibility in development/test
 */
if (process.env.NODE_ENV === 'production') {
  assertValidEnvironment(COMMON_ENV_RULES);
}
