export enum ObjectPermission {
  READ = 'read',
  WRITE = 'write',
  ADMIN = 'admin',
}

export interface ObjectAclPolicy {
  owner: string;
  permissions: Array<{
    userId: string;
    access: ObjectPermission;
  }>;
}

export function canAccessObject(
  policy: ObjectAclPolicy | null,
  userId: string,
  requiredAccess: ObjectPermission = ObjectPermission.READ
): boolean {
  if (!policy) return true;
  if (policy.owner === userId) return true;
  const perm = policy.permissions.find(p => p.userId === userId);
  if (!perm) return false;
  if (requiredAccess === ObjectPermission.READ) return true;
  if (requiredAccess === ObjectPermission.WRITE) return perm.access === ObjectPermission.WRITE || perm.access === ObjectPermission.ADMIN;
  return perm.access === ObjectPermission.ADMIN;
}

export function getObjectAclPolicy(metadata: Record<string, string> | undefined): ObjectAclPolicy | null {
  if (!metadata?.['x-acl-policy']) return null;
  try {
    return JSON.parse(metadata['x-acl-policy']);
  } catch {
    return null;
  }
}

export function setObjectAclPolicy(policy: ObjectAclPolicy): Record<string, string> {
  return {
    'x-acl-policy': JSON.stringify(policy),
  };
}
