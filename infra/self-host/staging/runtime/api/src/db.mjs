import pg from "pg";

export function createDbPool(config) {
  const pool = new pg.Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: config.database.max,
    idleTimeoutMillis: config.database.idleTimeoutMillis,
    connectionTimeoutMillis: config.database.connectionTimeoutMillis,
  });

  pool.on("error", (error) => {
    console.error({
      event: "postgres_pool_error",
      message: error instanceof Error ? error.message : "unknown postgres pool error",
    });
  });

  return pool;
}

export async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      console.error({
        event: "postgres_rollback_failed",
        message: rollbackError instanceof Error ? rollbackError.message : "unknown rollback error",
      });
    }
    throw error;
  } finally {
    client.release();
  }
}
