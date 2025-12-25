/**
 * config/database.js
 * PostgreSQL 连接池配置
 */

import { Pool } from 'pg';

let connectionPool = null;

export function getPool() {
  if (!connectionPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL 环境变量未设置');
    }

    connectionPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 20
    });

    connectionPool.on('error', (err) => {
      console.error('❌ 连接池错误:', err);
    });

    console.log('✅ 数据库连接池已初始化');
  }

  return connectionPool;
}

export async function closePool() {
  if (connectionPool) {
    await connectionPool.end();
    connectionPool = null;
    console.log('✅ 数据库连接池已关闭');
  }
}