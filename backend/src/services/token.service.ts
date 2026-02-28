import crypto from 'crypto';
import { prisma } from '../lib/db.js';
import { NotFoundError, BadRequestError, AppError } from '../utils/errors.js';

const TOKEN_PREFIX = 'ntez_';
const TOKEN_BYTE_LENGTH = 32; // 32 bytes = 256 bits of entropy

/**
 * Generate a random API token with ntez_ prefix
 * Uses base64url encoding for uniform distribution (no modulo bias)
 * Returns the raw token (shown to user once, never stored)
 */
export function generateToken(): string {
  const bytes = crypto.randomBytes(TOKEN_BYTE_LENGTH);
  return TOKEN_PREFIX + bytes.toString('base64url');
}

/**
 * SHA-256 hash a raw token for storage
 * Tokens are high-entropy random strings, so SHA-256 is sufficient (no need for bcrypt)
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Create a new API token for a user
 * Returns the raw token (must be shown to user immediately — cannot be retrieved later)
 */
export async function createApiToken(
  userId: string,
  data: { name: string; scopes: string[]; expiresIn?: string | null }
) {
  // Enforce per-user active token cap
  const MAX_ACTIVE_TOKENS = 20;
  const activeCount = await prisma.apiToken.count({
    where: { userId, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS) {
    throw new AppError('Maximum number of active API tokens (20) reached. Revoke an existing token first.', 409);
  }

  const raw = generateToken();
  const hash = hashToken(raw);
  const prefix = raw.substring(0, 9); // "ntez_xxxx" for display

  let expiresAt: Date | null = null;
  if (data.expiresIn) {
    const now = new Date();
    switch (data.expiresIn) {
      case '30d':
        expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
    }
  }

  const token = await prisma.apiToken.create({
    data: {
      userId,
      name: data.name,
      tokenHash: hash,
      prefix,
      scopes: data.scopes,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  return {
    ...token,
    rawToken: raw, // Only returned at creation time
  };
}

/**
 * Validate a raw API token
 * Returns userId and scopes if valid, throws if invalid/expired/revoked
 */
export async function validateApiToken(raw: string): Promise<{
  userId: string;
  username: string;
  role: string;
  scopes: string[];
}> {
  if (!raw.startsWith(TOKEN_PREFIX)) {
    throw new Error('Invalid token format');
  }

  const hash = hashToken(raw);

  const token = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  if (!token) {
    throw new Error('Invalid token');
  }

  if (token.revokedAt) {
    throw new Error('Token has been revoked');
  }

  if (token.expiresAt && token.expiresAt < new Date()) {
    throw new Error('Token has expired');
  }

  if (!token.user.isActive) {
    throw new Error('User account is inactive');
  }

  // Update lastUsedAt (fire and forget — don't block the request)
  prisma.apiToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {
    // Silently ignore lastUsedAt update failures
  });

  return {
    userId: token.user.id,
    username: token.user.username,
    role: token.user.role,
    scopes: token.scopes,
  };
}

/**
 * List all API tokens for a user (masked — never exposes raw token or hash)
 */
export async function listApiTokens(userId: string) {
  return prisma.apiToken.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      revokedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Revoke an API token (atomic — single updateMany with revokedAt: null condition)
 */
export async function revokeApiToken(tokenId: string, userId: string) {
  // Atomic: only updates if token exists, belongs to user, AND is not already revoked
  const result = await prisma.apiToken.updateMany({
    where: { id: tokenId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    // Distinguish "not found" from "already revoked"
    const token = await prisma.apiToken.findFirst({
      where: { id: tokenId, userId },
      select: { revokedAt: true },
    });

    if (!token) {
      throw new NotFoundError('Token not found');
    }
    throw new BadRequestError('Token is already revoked');
  }

  // Return the updated token
  return prisma.apiToken.findUnique({
    where: { id: tokenId },
    select: {
      id: true,
      name: true,
      revokedAt: true,
    },
  });
}
