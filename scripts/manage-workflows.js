#!/usr/bin/env node

/**
 * GitHub Actions Workflow Management Tool
 * 
 * This utility provides functionality to manage GitHub Actions workflows:
 * - List workflow runs with various filters
 * - Cancel running workflows
 * - Delete completed/failed workflow runs
 * - Cleanup old workflow runs
 * 
 * Usage:
 *   node manage-workflows.js list [--status=<status>]
 *   node manage-workflows.js cleanup [--days=<days>] [--dry-run]
 *   node manage-workflows.js cancel-failed [--dry-run]
 *   node manage-workflows.js delete-old [--days=<days>] [--dry-run]
 * 
 * Environment Variables:
 *   GITHUB_TOKEN - GitHub Personal Access Token (required)
 *   GITHUB_OWNER - Repository owner (default: OmniQuestMedia)
 *   GITHUB_REPO - Repository name (default: RedRoomRewards)
 *   MAX_AGE_DAYS - Maximum age for workflow runs in days (default: 30)
 *   DRY_RUN - Whether to perform dry-run (default: true)
 */

import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// Parse args early to check if help is requested
const earlyArgs = process.argv.slice(2);
const isHelpCommand = earlyArgs.includes('help') || earlyArgs.includes('--help') || earlyArgs.includes('-h');

// Configuration
const config = {
  token: process.env.GITHUB_TOKEN,
  owner: process.env.GITHUB_OWNER || 'OmniQuestMedia',
  repo: process.env.GITHUB_REPO || 'RedRoomRewards',
  maxAgeDays: parseInt(process.env.MAX_AGE_DAYS || '30', 10),
  dryRun: process.env.DRY_RUN === 'true'
};

// Validate configuration (skip for help command)
if (!config.token && !isHelpCommand) {
  console.error('❌ Error: GITHUB_TOKEN environment variable is required');
  console.error('   Please create a .env file based on .env.example');
  process.exit(1);
}

// Initialize Octokit
const octokit = new Octokit({
  auth: config.token
});

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';
  const options = {};
  
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value === undefined ? true : value;
    }
  });
  
  return { command, options };
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

/**
 * Calculate age in days
 */
function getAgeDays(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * List all workflow runs with optional filtering
 */
async function listWorkflowRuns(options = {}) {
  console.log(`\n📋 Listing workflow runs for ${config.owner}/${config.repo}`);
  
  const status = options.status || 'all';
  const params = {
    owner: config.owner,
    repo: config.repo,
    per_page: 100
  };
  
  if (status !== 'all') {
    params.status = status;
  }
  
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo(params);
    
    console.log(`\nTotal runs: ${data.total_count}`);
    console.log(`Showing: ${data.workflow_runs.length} runs\n`);
    
    // Group by status
    const grouped = {};
    data.workflow_runs.forEach(run => {
      const status = run.status === 'completed' ? run.conclusion : run.status;
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(run);
    });
    
    // Display summary
    console.log('Status Summary:');
    Object.entries(grouped).forEach(([status, runs]) => {
      const icon = getStatusIcon(status);
      console.log(`  ${icon} ${status}: ${runs.length} runs`);
    });
    
    // Display detailed list
    console.log('\nDetailed List:');
    data.workflow_runs.slice(0, 20).forEach(run => {
      const status = run.status === 'completed' ? run.conclusion : run.status;
      const icon = getStatusIcon(status);
      const age = getAgeDays(run.created_at);
      console.log(`  ${icon} #${run.run_number} - ${run.name}`);
      console.log(`     Status: ${status} | Age: ${age} days | Created: ${formatDate(run.created_at)}`);
      console.log(`     URL: ${run.html_url}`);
    });
    
    if (data.workflow_runs.length > 20) {
      console.log(`\n... and ${data.workflow_runs.length - 20} more runs`);
    }
    
  } catch (error) {
    console.error('❌ Error listing workflow runs:', error.message);
    process.exit(1);
  }
}

/**
 * Get status icon
 */
function getStatusIcon(status) {
  const icons = {
    'success': '✅',
    'failure': '❌',
    'cancelled': '🚫',
    'skipped': '⏭️',
    'in_progress': '🔄',
    'queued': '⏳',
    'waiting': '⏸️',
    'timed_out': '⏱️'
  };
  return icons[status] || '❔';
}

/**
 * Cancel all running workflows (useful for failed builds)
 */
async function cancelRunningWorkflows(options = {}) {
  const dryRun = options['dry-run'] !== undefined ? options['dry-run'] : config.dryRun;
  
  console.log(`\n🛑 Cancelling running workflows for ${config.owner}/${config.repo}`);
  if (dryRun) {
    console.log('   [DRY RUN MODE - No actual changes will be made]');
  }
  
  try {
    // Get in_progress and queued runs
    const statuses = ['in_progress', 'queued', 'waiting'];
    let totalCancelled = 0;
    
    for (const status of statuses) {
      const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
        owner: config.owner,
        repo: config.repo,
        status: status,
        per_page: 100
      });
      
      console.log(`\nFound ${data.workflow_runs.length} runs with status: ${status}`);
      
      for (const run of data.workflow_runs) {
        console.log(`  🛑 Cancelling: #${run.run_number} - ${run.name} (${run.id})`);
        
        if (!dryRun) {
          try {
            await octokit.rest.actions.cancelWorkflowRun({
              owner: config.owner,
              repo: config.repo,
              run_id: run.id
            });
            console.log(`     ✅ Successfully cancelled`);
            totalCancelled++;
          } catch (error) {
            console.log(`     ❌ Failed to cancel: ${error.message}`);
          }
        }
      }
    }
    
    console.log(`\n${dryRun ? '(Would cancel)' : 'Cancelled'} ${totalCancelled} workflow runs`);
    
  } catch (error) {
    console.error('❌ Error cancelling workflows:', error.message);
    process.exit(1);
  }
}

/**
 * Delete old or failed workflow runs
 */
async function deleteWorkflowRuns(options = {}) {
  const dryRun = options['dry-run'] !== undefined ? options['dry-run'] : config.dryRun;
  const maxAgeDays = parseInt(options.days || config.maxAgeDays, 10);
  const statusFilter = options.status || 'all'; // all, failure, cancelled, completed
  
  console.log(`\n🗑️  Deleting workflow runs for ${config.owner}/${config.repo}`);
  console.log(`   Max age: ${maxAgeDays} days`);
  console.log(`   Status filter: ${statusFilter}`);
  if (dryRun) {
    console.log('   [DRY RUN MODE - No actual deletions will be made]');
  }
  
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner: config.owner,
      repo: config.repo,
      per_page: 100
    });
    
    let totalDeleted = 0;
    let totalSkipped = 0;
    
    for (const run of data.workflow_runs) {
      const ageDays = getAgeDays(run.created_at);
      const status = run.status === 'completed' ? run.conclusion : run.status;
      
      // Check if run should be deleted
      let shouldDelete = false;
      
      // Filter by age
      if (ageDays > maxAgeDays) {
        // Filter by status if specified
        if (statusFilter === 'all') {
          shouldDelete = true;
        } else if (statusFilter === status) {
          shouldDelete = true;
        } else if (statusFilter === 'failure' && (status === 'failure' || status === 'cancelled' || status === 'timed_out')) {
          shouldDelete = true;
        } else if (statusFilter === 'completed' && run.status === 'completed') {
          shouldDelete = true;
        }
      }
      
      if (shouldDelete) {
        const icon = getStatusIcon(status);
        console.log(`  🗑️  ${icon} #${run.run_number} - ${run.name}`);
        console.log(`     Status: ${status} | Age: ${ageDays} days`);
        
        if (!dryRun) {
          try {
            await octokit.rest.actions.deleteWorkflowRun({
              owner: config.owner,
              repo: config.repo,
              run_id: run.id
            });
            console.log(`     ✅ Deleted`);
            totalDeleted++;
          } catch (error) {
            console.log(`     ❌ Failed to delete: ${error.message}`);
          }
        } else {
          totalDeleted++;
        }
      } else {
        totalSkipped++;
      }
    }
    
    console.log(`\n${dryRun ? '(Would delete)' : 'Deleted'} ${totalDeleted} workflow runs`);
    console.log(`Skipped ${totalSkipped} workflow runs`);
    
    if (dryRun) {
      console.log('\n💡 To actually delete, run with: --dry-run=false');
    }
    
  } catch (error) {
    console.error('❌ Error deleting workflow runs:', error.message);
    process.exit(1);
  }
}

/**
 * Comprehensive cleanup: cancel running, delete old
 */
async function cleanupWorkflows(options = {}) {
  console.log('\n🧹 Starting comprehensive workflow cleanup...\n');
  
  // First, cancel any running workflows
  await cancelRunningWorkflows(options);
  
  // Then delete old completed/failed runs
  await deleteWorkflowRuns(options);
  
  console.log('\n✨ Cleanup complete!\n');
}

/**
 * Main function
 */
async function main() {
  const { command, options } = parseArgs();
  
  console.log('\n🔧 GitHub Actions Workflow Manager');
  console.log(`   Repository: ${config.owner}/${config.repo}\n`);
  
  switch (command) {
    case 'list':
      await listWorkflowRuns(options);
      break;
    
    case 'cleanup':
      await cleanupWorkflows(options);
      break;
    
    case 'cancel-failed':
    case 'cancel':
      await cancelRunningWorkflows(options);
      break;
    
    case 'delete-old':
    case 'delete':
      await deleteWorkflowRuns(options);
      break;
    
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.error('   Run with --help for usage information');
      process.exit(1);
  }
}

/**
 * Show help text
 */
function showHelp() {
  console.log(`
Usage: node manage-workflows.js <command> [options]

Commands:
  list              List all workflow runs
  cleanup           Cancel running workflows and delete old runs
  cancel            Cancel all running/queued workflows
  delete            Delete old workflow runs based on age/status
  help              Show this help message

Options:
  --status=<status>    Filter by status (for list command)
                       Values: all, failure, success, cancelled, in_progress
  
  --days=<number>      Number of days for age filter (default: 30)
  --dry-run[=false]    Perform dry-run without making changes (default: true)

Examples:
  # List all workflow runs
  node manage-workflows.js list

  # List only failed runs
  node manage-workflows.js list --status=failure

  # Delete workflow runs older than 7 days (dry-run)
  node manage-workflows.js delete --days=7

  # Actually delete old runs (not dry-run)
  node manage-workflows.js delete --days=30 --dry-run=false

  # Cancel all running workflows
  node manage-workflows.js cancel --dry-run=false

  # Full cleanup: cancel running + delete old
  node manage-workflows.js cleanup --days=30 --dry-run=false

Environment Variables:
  See .env.example for configuration options
`);
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
