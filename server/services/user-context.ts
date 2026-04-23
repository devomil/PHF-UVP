import { AsyncLocalStorage } from 'node:async_hooks';

interface UserContextStore {
  userId: string;
}

export const userContextStorage = new AsyncLocalStorage<UserContextStore>();

export function getCurrentUserId(): string | undefined {
  return userContextStorage.getStore()?.userId;
}

export function runWithUserContext<T>(userId: string, fn: () => T): T {
  return userContextStorage.run({ userId }, fn);
}
