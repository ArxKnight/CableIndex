import connection from '../database/connection.js';
import { DatabaseAdapter } from '../database/adapters/base.js';
import { User, UserRole } from '../types/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { normalizeUsername } from '../utils/username.js';

export interface CreateUserData {
  email: string;
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  email?: string;
  username?: string;
  role?: UserRole;
}

export class UserModel {
  private get adapter(): DatabaseAdapter {
    return connection.getAdapter();
  }

  private normalizeUser(user: User): User {
    return {
      ...user,
      username: normalizeUsername((user as any).username),
    };
  }

  /**
   * Create a new user
   */
  async create(userData: CreateUserData): Promise<User> {
    const { email, username, password, role = 'USER' } = userData;
    const normalizedUsername = normalizeUsername(username);
    
    // Hash the password
    const password_hash = await hashPassword(password);
    
    const result = await this.adapter.execute(
      `INSERT INTO users (email, username, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [email, normalizedUsername, password_hash, role]
    );
    
    if (!result.insertId) {
      throw new Error('Failed to create user');
    }
    
    return (await this.findById(Number(result.insertId)))!;
  }

  /**
   * Find user by ID
   */
  async findById(id: number): Promise<User | null> {
    const rows = await this.adapter.query(
      `SELECT id, email, username, password_hash, role, is_active, created_at, updated_at
       FROM users 
       WHERE id = ?`,
      [id]
    );
    
    return rows.length > 0 ? this.normalizeUser(rows[0] as User) : null;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.adapter.query(
      `SELECT id, email, username, password_hash, role, is_active, created_at, updated_at
       FROM users WHERE email = ?`,
      [email]
    );
    
    return rows.length > 0 ? this.normalizeUser(rows[0] as User) : null;
  }

  /**
   * Verify user credentials
   */
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    console.log(`🔍 Verifying credentials for: ${email}`);
    const user = await this.findByEmail(email);
    if (!user) {
      console.warn(`⚠️  User not found in database: ${email}`);
      return null;
    }

    const isActive = user.is_active === undefined ? true : Boolean(user.is_active);
    if (!isActive) {
      console.warn(`⚠️  Inactive user attempted login: ${email}`);
      return null;
    }

    console.log(`✓ User found: ${user.email} (ID: ${user.id})`);
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      console.warn(`✗ Password mismatch for user: ${email}`);
      console.log(`📋 User password_hash exists: ${!!user.password_hash}`);
      console.log(`📋 Password hash length: ${user.password_hash?.length}`);
      return null;
    }

    console.log(`✓ Credentials verified for: ${email}`);
    return user;
  }

  /**
   * Update user
   */
  async update(id: number, userData: UpdateUserData): Promise<User | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (userData.email !== undefined) {
      updates.push('email = ?');
      values.push(userData.email);
    }

    if (userData.username !== undefined) {
      const normalizedUsername = normalizeUsername(userData.username);
      updates.push('username = ?');
      values.push(normalizedUsername);
    }

    if (userData.role !== undefined) {
      updates.push('role = ?');
      values.push(userData.role);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = await this.adapter.execute(
      `UPDATE users 
       SET ${updates.join(', ')}
       WHERE id = ?`,
      values
    );
    
    if (result.affectedRows === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Update user password
   */
  async updatePassword(id: number, newPassword: string): Promise<boolean> {
    const password_hash = await hashPassword(newPassword);

    const result = await this.adapter.execute(
      `UPDATE users SET password_hash = ? WHERE id = ?`,
      [password_hash, id]
    );

    return result.affectedRows > 0;
  }

  /**
   * Delete user
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.adapter.execute('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  /**
   * Get all users (admin only)
   */
  async findAll(limit: number = 50, offset: number = 0): Promise<User[]> {
    const safeLimit = parseInt(String(limit), 10) || 50;
    const safeOffset = parseInt(String(offset), 10) || 0;
    const finalLimit = Math.max(0, safeLimit);
    const finalOffset = Math.max(0, safeOffset);

    const rows = await this.adapter.query(
      `SELECT id, email, username, password_hash, role, is_active, created_at, updated_at
       FROM users 
       ORDER BY created_at DESC
       LIMIT ${finalLimit} OFFSET ${finalOffset}`
    );
    
    return rows as User[];
  }

  /**
   * Count total users
   */
  async count(): Promise<number> {
    const rows = await this.adapter.query('SELECT COUNT(*) as count FROM users');
    return rows[0].count;
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeId?: number): Promise<boolean> {
    let rows;
    if (excludeId) {
      rows = await this.adapter.query(
        'SELECT 1 FROM users WHERE email = ? AND id != ?',
        [email, excludeId]
      );
    } else {
      rows = await this.adapter.query(
        'SELECT 1 FROM users WHERE email = ?',
        [email]
      );
    }

    return rows.length > 0;
  }
}

export default UserModel;