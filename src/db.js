const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sanctions (
      id                    TEXT PRIMARY KEY,
      name                  TEXT,
      type                  TEXT,
      flag                  TEXT,
      owner                 TEXT,
      sanctioning_authority TEXT[],
      imo_number            TEXT,
      registration_number   TEXT,
      sanction_date         TEXT,
      source_dataset        TEXT[],
      fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Returns the most recent fetched_at timestamp, or null if table is empty */
async function getLastFetchedAt() {
  const { rows } = await pool.query('SELECT MAX(fetched_at) AS ts FROM sanctions');
  return rows[0].ts ? new Date(rows[0].ts) : null;
}

/** Replaces all rows with new records in batches */
async function upsertRecords(records) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sanctions');

    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const values = [];
      const placeholders = batch.map((r, j) => {
        const base = j * 10;
        values.push(
          r.id, r.name, r.type, r.flag, r.owner,
          r.sanctioningAuthority, r.imoNumber,
          r.registrationNumber, r.sanctionDate,
          r.sourceDataset
        );
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10})`;
      });
      await client.query(
        `INSERT INTO sanctions
           (id,name,type,flag,owner,sanctioning_authority,imo_number,registration_number,sanction_date,source_dataset)
         VALUES ${placeholders.join(',')}`,
        values
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Reads all records from DB */
async function getAllRecords() {
  const { rows } = await pool.query(
    `SELECT id, name, type, flag, owner,
            sanctioning_authority AS "sanctioningAuthority",
            imo_number            AS "imoNumber",
            registration_number   AS "registrationNumber",
            sanction_date         AS "sanctionDate",
            source_dataset        AS "sourceDataset",
            fetched_at            AS "fetchedAt"
     FROM sanctions`
  );
  return rows;
}

module.exports = { initSchema, getLastFetchedAt, upsertRecords, getAllRecords };
