import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as userService from '../services/user.service.js';
import { AppError } from '../utils/errors.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.middleware.js';
import {
  createUserSchema,
  updateUserSchema,
  adminResetPasswordSchema,
} from '../utils/validation.schemas.js';

// Param schemas
const userIdParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

// Query schemas
const listUsersQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

export async function usersRoutes(fastify: FastifyInstance) {
  // All routes require authentication and admin role
  fastify.addHook('preHandler', authenticateToken);
  fastify.addHook('preHandler', requireAdmin);

  // List all users
  fastify.get(
    '/users',
    {
      preHandler: validateQuery(listUsersQuerySchema),
    },
    async (request, reply) => {
      try {
        const query = request.query as z.infer<typeof listUsersQuerySchema>;
        const users = await userService.listUsers(query.includeInactive);

        return {
          users,
          total: users.length,
        };
      } catch (error) {
        fastify.log.error(error);
        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to list users',
        });
      }
    }
  );

  // Get user statistics
  fastify.get('/users/stats', async (_request, reply) => {
    try {
      const stats = await userService.getUserStats();
      return stats;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get user statistics',
      });
    }
  });

  // Get system info
  fastify.get('/system/info', async (_request, reply) => {
    try {
      const systemInfo = await userService.getSystemInfo();
      return systemInfo;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to get system information',
      });
    }
  });

  // Get single user by ID
  fastify.get(
    '/users/:id',
    {
      preHandler: validateParams(userIdParamSchema),
    },
    async (request, reply) => {
      try {
        const params = request.params as z.infer<typeof userIdParamSchema>;
        const user = await userService.getUserById(params.id);

        return { user };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to get user',
        });
      }
    }
  );

  // Create new user
  fastify.post(
    '/users',
    {
      preHandler: validateBody(createUserSchema),
    },
    async (request, reply) => {
      try {
        const result = await userService.createUser(request.body as any);

        // If service account, result includes apiToken
        if ('apiToken' in result) {
          const { apiToken, ...user } = result;
          return reply
            .header('Cache-Control', 'no-store')
            .status(201)
            .send({
              message: 'Service account created successfully. Store the API token securely — it cannot be retrieved again.',
              user,
              apiToken,
            });
        }

        return reply.status(201).send({
          message: 'User created successfully',
          user: result,
        });
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error) {
          if (error.message.includes('already exists')) {
            return reply.status(409).send({
              error: 'Conflict',
              message: error.message,
            });
          }
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to create user',
        });
      }
    }
  );

  // Update user
  fastify.patch(
    '/users/:id',
    {
      preHandler: [
        validateParams(userIdParamSchema),
        validateBody(updateUserSchema),
      ],
    },
    async (request, reply) => {
      try {
        const params = request.params as z.infer<typeof userIdParamSchema>;
        const user = await userService.updateUser(params.id, request.body as any);

        return {
          message: 'User updated successfully',
          user,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to update user',
        });
      }
    }
  );

  // Delete user (soft delete)
  fastify.delete(
    '/users/:id',
    {
      preHandler: validateParams(userIdParamSchema),
    },
    async (request, reply) => {
      try {
        const params = request.params as z.infer<typeof userIdParamSchema>;

        // Prevent deleting yourself
        if (request.user && request.user.userId === params.id) {
          return reply.status(400).send({
            error: 'Bad Request',
            message: 'Cannot delete your own account',
          });
        }

        const user = await userService.deleteUser(params.id);

        return {
          message: 'User deactivated successfully',
          user,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to delete user',
        });
      }
    }
  );

  // Reset user password
  fastify.post(
    '/users/:id/reset-password',
    {
      preHandler: [
        validateParams(userIdParamSchema),
        validateBody(adminResetPasswordSchema),
      ],
    },
    async (request, reply) => {
      try {
        const params = request.params as z.infer<typeof userIdParamSchema>;
        const body = request.body as z.infer<typeof adminResetPasswordSchema>;

        const user = await userService.resetUserPassword(params.id, body.newPassword);

        return {
          message: 'Password reset successfully. User must change password on next login.',
          user,
        };
      } catch (error) {
        fastify.log.error(error);

        if (error instanceof AppError) {
          return reply.status(error.statusCode).send({
            error: error.name,
            message: error.message,
          });
        }

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.status(404).send({
            error: 'Not Found',
            message: error.message,
          });
        }

        return reply.status(500).send({
          error: 'Internal Server Error',
          message: 'Failed to reset password',
        });
      }
    }
  );
}
