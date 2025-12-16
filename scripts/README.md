# GitHub Actions Workflow Manager

A comprehensive utility for managing GitHub Actions workflows in the RedRoomRewards repository. This tool allows you to list, cancel, and delete workflow runs programmatically.

## Features

- **List Workflows**: View all workflow runs with status filtering and summary statistics
- **Cancel Running Workflows**: Stop in-progress or queued workflows
- **Delete Old Runs**: Remove workflow runs based on age and status
- **Comprehensive Cleanup**: Combined cancel + delete operation
- **Dry-Run Mode**: Preview changes before applying them
- **Detailed Logging**: Clear output with status icons and timestamps

## Prerequisites

- Node.js 18+ (with ES modules support)
- GitHub Personal Access Token with `repo` and `workflow` scopes

## Setup

1. **Install dependencies:**

   ```bash
   cd scripts
   npm install
   ```

2. **Create environment configuration:**

   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` file with your credentials:**

   ```bash
   GITHUB_TOKEN=ghp_your_token_here
   GITHUB_OWNER=OmniQuestMedia
   GITHUB_REPO=RedRoomRewards
   MAX_AGE_DAYS=30
   DRY_RUN=true
   ```

4. **Generate GitHub Token:**
   - Go to: https://github.com/settings/tokens
   - Click "Generate new token (classic)"
   - Select scopes: `repo` and `workflow`
   - Copy token to `.env` file

## Usage

### List Workflow Runs

View all workflow runs with status summary:

```bash
npm run list
# or
node manage-workflows.js list
```

Filter by specific status:

```bash
node manage-workflows.js list --status=failure
node manage-workflows.js list --status=success
node manage-workflows.js list --status=in_progress
```

### Cancel Running Workflows

Cancel all running, queued, or waiting workflows:

```bash
# Dry-run (preview only)
npm run cancel-failed
node manage-workflows.js cancel

# Actually cancel
node manage-workflows.js cancel --dry-run=false
```

### Delete Old Workflow Runs

Delete workflow runs older than specified days:

```bash
# Dry-run: preview deletion of runs older than 30 days
npm run delete-old
node manage-workflows.js delete --days=30

# Actually delete runs older than 7 days
node manage-workflows.js delete --days=7 --dry-run=false

# Delete only failed runs older than 14 days
node manage-workflows.js delete --days=14 --status=failure --dry-run=false
```

### Comprehensive Cleanup

Cancel running workflows AND delete old runs:

```bash
# Dry-run
npm run cleanup
node manage-workflows.js cleanup --days=30

# Actually perform cleanup
node manage-workflows.js cleanup --days=30 --dry-run=false
```

## Command Reference

### Commands

| Command | Description |
|---------|-------------|
| `list` | List all workflow runs with filtering |
| `cancel` | Cancel running/queued workflows |
| `delete` | Delete old workflow runs |
| `cleanup` | Combined cancel + delete operation |
| `help` | Show help information |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--status=<status>` | Filter by status (list command) | `all` |
| `--days=<number>` | Age filter in days | `30` |
| `--dry-run[=false]` | Preview mode without changes | `true` |

### Status Values

- `all` - All workflow runs
- `success` - Successfully completed
- `failure` - Failed runs
- `cancelled` - Manually cancelled
- `in_progress` - Currently running
- `queued` - Waiting to run
- `timed_out` - Exceeded time limit
- `skipped` - Skipped runs

## Examples

### Example 1: Check Current Workflow Status

```bash
node manage-workflows.js list
```

Output:
```
📋 Listing workflow runs for OmniQuestMedia/RedRoomRewards

Total runs: 45
Showing: 45 runs

Status Summary:
  ✅ success: 30 runs
  ❌ failure: 10 runs
  🚫 cancelled: 5 runs

Detailed List:
  ✅ #123 - Super-Linter
     Status: success | Age: 2 days | Created: 12/14/2025, 3:45:00 PM
     URL: https://github.com/OmniQuestMedia/RedRoomRewards/actions/runs/...
  ...
```

### Example 2: Preview Cleanup Operation

```bash
node manage-workflows.js cleanup --days=30
```

This will show what would be cancelled and deleted without making changes.

### Example 3: Perform Actual Cleanup

```bash
node manage-workflows.js cleanup --days=30 --dry-run=false
```

**⚠️ Warning**: This will actually cancel running workflows and delete old runs. Use with caution!

### Example 4: Delete Only Failed Runs

```bash
node manage-workflows.js delete --days=14 --status=failure --dry-run=false
```

This removes failed workflow runs older than 14 days.

## Safety Features

1. **Dry-Run by Default**: All destructive operations default to dry-run mode
2. **Clear Feedback**: Detailed output shows exactly what will be changed
3. **Status Icons**: Visual indicators for workflow states
4. **Age Calculation**: Shows how old each workflow run is
5. **Error Handling**: Graceful error messages and recovery

## Common Use Cases

### Cleanup Failed CI Runs

After fixing a bug that caused multiple CI failures:

```bash
node manage-workflows.js delete --status=failure --days=7 --dry-run=false
```

### Stop All Running Workflows

During an emergency or when deploying fixes:

```bash
node manage-workflows.js cancel --dry-run=false
```

### Regular Maintenance

Keep repository clean by removing old runs monthly:

```bash
node manage-workflows.js cleanup --days=30 --dry-run=false
```

### Audit Workflow History

Review workflow run patterns:

```bash
node manage-workflows.js list --status=failure
```

## Troubleshooting

### Authentication Error

```
❌ Error: GITHUB_TOKEN environment variable is required
```

**Solution**: Ensure `.env` file exists with valid `GITHUB_TOKEN`

### Permission Denied

```
❌ Error: Resource not accessible by integration
```

**Solution**: Verify token has `repo` and `workflow` scopes

### Rate Limiting

The GitHub API has rate limits. If you encounter rate limit errors:
- Wait for the rate limit to reset
- Use more specific filters to reduce API calls
- Consider running operations in smaller batches

## Security Considerations

- **Never commit `.env` file** - It contains sensitive tokens
- **Use token with minimal scopes** - Only `repo` and `workflow` are needed
- **Rotate tokens regularly** - Generate new tokens periodically
- **Review before executing** - Always run with `--dry-run` first

## Integration with CI/CD

This tool can be integrated into CI/CD pipelines or cron jobs for automated cleanup:

```yaml
# .github/workflows/cleanup-old-runs.yml
name: Cleanup Old Workflow Runs

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd scripts
          npm install
      
      - name: Run cleanup
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd scripts
          node manage-workflows.js cleanup --days=30 --dry-run=false
```

## Contributing

When modifying this tool:

1. Maintain backward compatibility with existing commands
2. Add comprehensive error handling
3. Update this README with new features
4. Test in dry-run mode thoroughly before releasing
5. Follow the repository's TypeScript/Node.js conventions

## License

This tool is part of the RedRoomRewards repository and follows the same license.

## Support

For issues or questions:
- Check GitHub Actions documentation: https://docs.github.com/en/actions
- Review Octokit REST API docs: https://octokit.github.io/rest.js/
- Open an issue in the RedRoomRewards repository
