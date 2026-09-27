import crypto from "node:crypto";
import { Pool, type QueryResultRow } from "pg";

export type ApiService = "gemini" | "humanizer" | "plagiarism" | "hallucination" | "references";

export class ApiKeyUnavailableError extends Error {
  readonly code = "API_KEY_UNAVAILABLE";
  readonly service: ApiService;
  constructor(service: ApiService, message?: string) {
    super(message ?? `Aucune clé API active n'est configurée pour le service "${service}".`);
    this.name = "ApiKeyUnavailableError";
    this.service = service;
  }
}

export class ApiKeyConfigurationError extends Error {
  readonly code = "API_KEY_CONFIGURATION_ERROR";
}

let pool: Pool | undefined;
let poolError: string | undefined;

function getPool() {
  if (poolError) throw new ApiKeyConfigurationError(poolError);
  if (pool) return pool;
  const connectionString =
    process.env.DATABASE_URL?.trim() ||
    process.env.DIRECT_DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    process.env.NEON_DATABASE_URL?.trim();
  if (!connectionString) {
    poolError = "DATABASE_URL/DIRECT_DATABASE_URL is not configured.";
    throw new ApiKeyConfigurationError(poolError);
  }
  try {
    pool = new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
      application_name: "oligens-detector-api-keys",
    });
    pool.on("error", error => console.error("[api-keys-db] idle error", error));
    return pool;
  } catch (error) {
    poolError = error instanceof Error ? error.message : "Database initialization failed.";
    throw new ApiKeyConfigurationError(poolError);
  }
}

async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  return getPool().query<T>(sql, values);
}

function encryptionKey() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ApiKeyConfigurationError(
      "API_KEY_ENCRYPTION_SECRET doit contenir au moins 32 caractères.",
    );
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptApiKey(value: string) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptApiKey(value: string) {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Format de clé chiffrée invalide.");
  const key = encryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export async function getActiveApiKey(service: ApiService) {
  const result = await query<{
    id: string;
    encrypted_api_key: string;
  }>(
    `SELECT id::text AS id, encrypted_api_key
     FROM api_service_keys
     WHERE service_name=$1 AND is_active=TRUE
     ORDER BY priority ASC, updated_at DESC, created_at ASC
     LIMIT 1`,
    [service],
  );

  const row = result.rows[0];
  if (!row) throw new ApiKeyUnavailableError(service);

  try {
    const value = decryptApiKey(row.encrypted_api_key).trim();
    if (!value) throw new Error("Clé vide.");
    await query(
      "UPDATE api_service_keys SET usage_count=usage_count+1,last_used_at=NOW() WHERE id=$1",
      [row.id],
    );
    return { key: value, id: row.id };
  } catch (error) {
    await query(
      "UPDATE api_service_keys SET failure_count=failure_count+1,last_failure_at=NOW() WHERE id=$1",
      [row.id],
    ).catch(updateError => console.error("[api-keys] failure counter", updateError));
    throw new ApiKeyUnavailableError(service, `La clé active du service "${service}" ne peut pas être déchiffrée.`);
  }
}

export async function getActiveApiKeys(service: ApiService) {
  const result = await query<{ id: string; encrypted_api_key: string }>(
    `SELECT id::text AS id, encrypted_api_key
     FROM api_service_keys
     WHERE service_name=$1 AND is_active=TRUE
     ORDER BY priority ASC, updated_at DESC, created_at ASC`,
    [service],
  );
  const keys: Array<{ id: string; key: string }> = [];
  for (const row of result.rows) {
    try {
      const key = decryptApiKey(row.encrypted_api_key).trim();
      if (key) keys.push({ id: row.id, key });
    } catch (error) {
      console.error("[api-keys] unable to decrypt configured key", { service, id: row.id, error: error instanceof Error ? error.message : error });
    }
  }
  if (!keys.length) throw new ApiKeyUnavailableError(service);
  return keys;
}

export function isApiKeyUnavailable(error: unknown): error is ApiKeyUnavailableError {
  return error instanceof ApiKeyUnavailableError || (error instanceof Error && (error as Error & { code?: string }).code === "API_KEY_UNAVAILABLE");
}

export function isRetryableProviderError(status: number, message: string) {
  return status === 401 || status === 403 || status === 429 ||
    /invalid.*key|api key|quota|resource exhausted|rate limit|permission/i.test(message);
}
