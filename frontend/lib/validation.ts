import { z } from 'zod';

// Defect validation schemas
export const createDefectSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  description: z.string().min(1, 'Description is required').max(5000, 'Description must be less than 5000 characters'),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED']),
  priority: z.number().int().min(1).max(4),
  projectId: z.string().min(1, 'Project is required'),
  assignedToId: z.string().optional(),
});

export const updateDefectSchema = createDefectSchema.partial();

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(2000, 'Comment must be less than 2000 characters'),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
});

export type CreateDefectInput = z.infer<typeof createDefectSchema>;
export type UpdateDefectInput = z.infer<typeof updateDefectSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

