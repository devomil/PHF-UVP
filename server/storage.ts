import { db } from "./db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<any>;
  getUserByEmail(email: string): Promise<any>;
  createUser(data: any): Promise<any>;
  updateUser(id: string, data: any): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || null;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || null;
  }

  async createUser(data: any) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async updateUser(id: string, data: any) {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user;
  }
}

export const storage = new DatabaseStorage();
