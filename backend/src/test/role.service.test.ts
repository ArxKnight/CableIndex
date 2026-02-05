import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import UserModel from '../models/User.js';
import RoleService from '../services/RoleService.js';
import { setupTestDatabase, cleanupTestDatabase } from './setup.js';

describe('Role Service', () => {
  let userModel: UserModel;
  let roleService: RoleService;
  let testUserId: number;

  beforeEach(async () => {
    await setupTestDatabase({ runMigrations: true, seedData: false });
    userModel = new UserModel();
    roleService = new RoleService();

    const testUser = await userModel.create({
      email: 'test@example.com',
      full_name: 'Test User',
      password: 'TestPassword123!',
      role: 'USER',
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    await cleanupTestDatabase();
  });

  it('assignRole updates the stored role', async () => {
    const success = await roleService.assignRole(testUserId, 'ADMIN');
    expect(success).toBe(true);

    const role = await roleService.getUserRole(testUserId);
    expect(role).toBe('ADMIN');
  });

  it('getUserRole returns null for unknown user', async () => {
    const role = await roleService.getUserRole(999999);
    expect(role).toBeNull();
  });

  it('hasRole respects role hierarchy', async () => {
    expect(await roleService.hasRole(testUserId, 'USER')).toBe(true);
    expect(await roleService.hasRole(testUserId, 'ADMIN')).toBe(false);

    await roleService.assignRole(testUserId, 'ADMIN');
    expect(await roleService.hasRole(testUserId, 'USER')).toBe(true);
    expect(await roleService.hasRole(testUserId, 'ADMIN')).toBe(true);
    expect(await roleService.hasRole(testUserId, 'GLOBAL_ADMIN')).toBe(false);
  });

  it('getAllUsersWithRoles returns users (paged)', async () => {
    await userModel.create({
      email: 'admin@example.com',
      full_name: 'Admin User',
      password: 'AdminPassword123!',
      role: 'ADMIN',
    });

    const users = await roleService.getAllUsersWithRoles(50, 0);
    expect(users.length).toBe(2);
    const admin = users.find(u => u.email === 'admin@example.com');
    expect(admin?.role).toBe('ADMIN');
  });

  it('countUsersByRole returns counts for known roles', async () => {
    await userModel.create({
      email: 'admin@example.com',
      full_name: 'Admin User',
      password: 'AdminPassword123!',
      role: 'ADMIN',
    });

    const counts = await roleService.countUsersByRole();
    expect(counts.USER).toBe(1);
    expect(counts.ADMIN).toBe(1);
    expect(counts.GLOBAL_ADMIN).toBe(0);
  });
});