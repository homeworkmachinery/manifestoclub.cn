import { Pool } from 'pg';

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, params = [] } = req.body;

  try {
    const client = await getPool().connect();
    const result = await client.query(query, params);
    client.release();

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ error: error.message });
  }
}