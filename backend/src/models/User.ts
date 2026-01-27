import Database from 'better-sqlite3';
import connection from '../database/connection.js';
import { User, UserRole } from '../types/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';

export interface CreateUserData {
  email: string;
  full_name: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserData {
  email?: string;
  full_name?: string;
  role?: UserRole;
}

export class UserModel {
  private get db(): Database.Database {
    return connection.getConnection();
  }

  /**
   * Create a new user
   */
  async create(userData: CreateUserData): Promise<User> {
    const { email, full_name, password, role = 'user' } = userData;
    
    // Hash the password
    const password_hash = await hashPassword(password);
    
    const stmt = this.db.prepare(`
      INSERT INTO users (email, full_name, password_hash, role)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(email, full_name, password_hash, role);
    
    if (!result.lastInsertRowid) {
      throw new Error('Failed to create user');
    }
    
    return this.findById(Number(result.lastInsertRowid))!;
  }

  /**
   * Find user by ID
   */
  findById(id: number): User | null {
    const stmt = this.db.prepare(`
      SELECT id, email, full_name, password_hash, role, created_at, updated_at
      FROM users 
      WHERE id = ?
    `);
    
    return stmt.get(id) as User | null;
  }

  /**
   * Find user by email
   */
  findByEmail(email: string): User | null {
    const stmt = this.db.prepare(`
      SELECT id, email, full_name, password_hash, role, created_at, updated_at
      FROM users 
      WHERE email = ? COLLATE NOCASE
    `);
    
    return stmt.get(email) as User | null;
  }

  /**
   * Verify user credentials
   */
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = this.findByEmail(email);
    if (!user) {
      return null;
    }

    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return null;
    }

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

    if (userData.full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(userData.full_name);
    }

    if (userData.role !== undefined) {
      updates.push('role = ?');
      values.push(userData.role);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = ?
    `);

    const result = stmt.run(...values);
    
    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Update user password
   */
  async updatePassword(id: number, newPassword: string): Promise<boolean> {
    const password_hash = await hashPassword(newPassword);
    
    const stmt = this.db.prepare(`
      UPDATE users 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(password_hash, id);
    return result.changes > 0;
  }

  /**
   * Delete user
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get all users (admin only)
   */
  findAll(limit: number = 50, offset: number = 0): User[] {
    const stmt = this.db.prepare(`
      SELECT id, email, full_name, password_hash, role, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    
    return stmt.all(limit, offset) as User[];
  }

  /**
   * Count total users
   */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  /**
   * Check if email exists
   */
  emailExists(email: string, excludeId?: number): boolean {
    let stmt;
    let params: any[];

    if (excludeId) {
      stmt = this.db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?');
      params = [email, excludeId];
    } else {
      stmt = this.db.prepare('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE');
      params = [email];
    }

    return stmt.get(...params) !== undefined;
  }
}

export default UserModel;