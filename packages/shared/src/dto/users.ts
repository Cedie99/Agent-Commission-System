import { z } from 'zod';
import { ROLE_CODES, type RoleCode } from '../enums';

const password = z.string().min(8, 'Use at least 8 characters').max(200);

/** POST /users (Admin). The password is a temporary one the person gets from the Admin. */
export const CreateUserDto = z.object({
  email: z.string().trim().toLowerCase().email(),
  password,
  roles: z.array(z.enum(ROLE_CODES)).min(1, 'Pick at least one role'),
  personId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type CreateUserDto = z.infer<typeof CreateUserDto>;

/** PUT /users/:id (Admin). The password changes only through POST /users/:id/password. */
export const UpdateUserDto = CreateUserDto.omit({ password: true });
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

/** POST /users/:id/password (Admin). */
export const ResetPasswordDto = z.object({ password });
export type ResetPasswordDto = z.infer<typeof ResetPasswordDto>;

/** A sign-in account. Never carries the password hash. */
export interface UserView {
  id: string;
  email: string;
  roles: RoleCode[];
  personId: string | null;
  personCode: string | null;
  personName: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
