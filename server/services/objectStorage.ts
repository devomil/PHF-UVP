// Based on blueprint:javascript_object_storage
import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
// Track presigned uploads: objectId -> { userId, expiresAt }
const presignedUploads = new Map<string, { userId: string; expiresAt: number }>();

// Clean up expired presigned uploads every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [objectId, data] of Array.from(presignedUploads.entries())) {
    if (now > data.expiresAt) {
      presignedUploads.delete(objectId);
    }
  }
}, 5 * 60 * 1000);

export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(userId: string): Promise<{ uploadUrl: string; objectPath: string }> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Track this presigned upload with userId and expiration
    const ttlSec = 900; // 15 minutes
    presignedUploads.set(objectId, {
      userId,
      expiresAt: Date.now() + ttlSec * 1000,
    });

    // Sign URL for PUT method with TTL
    const uploadUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec,
    });

    return {
      uploadUrl,
      objectPath: fullPath,
    };
  }

  // Verifies that the object was presigned for the given userId
  verifyPresignedUpload(objectPath: string, userId: string): boolean {
    // Extract objectId from path like "/objects/uploads/833e6620-718c-4287-aae8-d54a144383d5"
    const match = objectPath.match(/\/objects\/uploads\/([a-f0-9-]+)/);
    if (!match) {
      return false;
    }

    const objectId = match[1];
    const presignData = presignedUploads.get(objectId);
    
    if (!presignData) {
      // Object ID not found in presigned uploads
      return false;
    }

    if (Date.now() > presignData.expiresAt) {
      // Presigned upload has expired
      presignedUploads.delete(objectId);
      return false;
    }

    // Verify the userId matches
    return presignData.userId === userId;
  }

  // Gets the object entity file from the object path.
  // Supports two formats:
  // 1. /objects/uploads/uuid - needs private dir prepended
  // 2. /objects/replit-objstore-xxx/.private/uploads/uuid - already has full path
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let objectEntityPath: string;
    
    // Check if the path already contains the bucket name (replit-objstore-xxx)
    if (entityId.startsWith("replit-objstore-")) {
      // Path already has full bucket path, use as-is with leading slash
      objectEntityPath = `/${entityId}`;
    } else {
      // Legacy format: prepend the private object dir
      let entityDir = this.getPrivateObjectDir();
      if (!entityDir.endsWith("/")) {
        entityDir = `${entityDir}/`;
      }
      objectEntityPath = `${entityDir}${entityId}`;
    }
    
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    // Handle different path formats:
    // - /objects/... : use getObjectEntityFile
    // - /replit-objstore-xxx/... : direct bucket path, parse and access directly
    let objectFile;
    if (normalizedPath.startsWith("/objects/")) {
      objectFile = await this.getObjectEntityFile(normalizedPath);
    } else if (normalizedPath.startsWith("/replit-objstore-")) {
      // Direct bucket path - parse and access
      const { bucketName, objectName } = parseObjectPath(normalizedPath);
      const bucket = objectStorageClient.bucket(bucketName);
      objectFile = bucket.file(objectName);
      const [exists] = await objectFile.exists();
      if (!exists) {
        console.warn(`[ObjectStorage] File not found for ACL update: ${normalizedPath}`);
        return normalizedPath;
      }
    } else {
      console.warn(`[ObjectStorage] Unknown path format for ACL: ${normalizedPath}`);
      return normalizedPath;
    }
    
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  // Checks if an object has public visibility (can be accessed without authentication)
  async isObjectPublic(objectFile: File): Promise<boolean> {
    try {
      const aclPolicy = await getObjectAclPolicy(objectFile);
      return aclPolicy?.visibility === "public";
    } catch (error) {
      // If we can't get the ACL policy, assume it's not public
      return false;
    }
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

export async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
