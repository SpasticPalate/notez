# Git Hooks for Notez

## Overview

This directory contains git hooks that enforce workflow rules defined in `.claude/CLAUDE.md`.

## Available Hooks

### pre-commit

**Purpose**: Prevents direct commits to the `main` branch

**Enforcement**:
- Blocks any commit attempt when on `main` branch
- Displays error message with instructions
- Enforces feature branch workflow

**Error Message**:
```
❌ COMMIT BLOCKED: Cannot commit directly to main branch!

From CLAUDE.md:
  'CRITICAL: You are FORBIDDEN from committing directly to the main branch.'

Please create a feature branch:
  git checkout -b feature/your-feature-name

Then commit your changes to the feature branch.
```

## Installation

### Option 1: Configure Git to Use .githooks Directory (Recommended)

```bash
git config core.hooksPath .githooks
```

This applies to your local repository only and persists across git operations.

### Option 2: Copy Individual Hooks

```bash
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Note**: Needs to be done on each clone of the repository.

## Verification

Test that the hook is working:

```bash
# Ensure you're on main branch
git checkout main

# Try to commit (should be blocked)
echo "test" > test.txt
git add test.txt
git commit -m "Test commit"
```

Expected output:
```
❌ COMMIT BLOCKED: Cannot commit directly to main branch!
```

## Bypassing Hooks (Emergency Only)

In rare emergency situations, you can bypass hooks with:

```bash
git commit --no-verify -m "Emergency fix"
```

**⚠️ WARNING**: Only use in true emergencies. This defeats the purpose of the hooks and should be documented in your commit message.

## Troubleshooting

### Hook Not Running

**Check if hooks path is configured:**
```bash
git config core.hooksPath
```

Expected output: `.githooks`

**Check if hook is executable:**
```bash
ls -la .githooks/pre-commit
```

Expected output should include `x` permission (e.g., `-rwxr-xr-x`)

**Make hook executable if needed:**
```bash
chmod +x .githooks/pre-commit
```

### Hook Running on Wrong Branch

The hook only blocks commits to `main`. If you're on a feature branch, commits work normally.

Verify your current branch:
```bash
git branch --show-current
```

## Adding New Hooks

1. Create the hook script in `.githooks/` directory
2. Make it executable: `chmod +x .githooks/hook-name`
3. Test the hook thoroughly
4. Document it in this README
5. Commit to repository

## Related Documentation

- `.claude/CLAUDE.md` - Complete workflow rules and guidelines
- [Git Hooks Documentation](https://git-scm.com/docs/githooks)
