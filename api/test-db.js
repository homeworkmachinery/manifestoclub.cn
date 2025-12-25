// src/pages/api/test-db.js
// 测试 Supabase Pooler 连接（正确位置）

import { Pool } from 'pg';

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('🚀 收到测试请求');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '已设置' : '❌ 未设置');

  // 检查环境变量
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 未设置');
    return res.status(400).json({
      status: 'error',
      message: '❌ DATABASE_URL 环境变量未设置',
      hint: '请在 .env.local 中添加 DATABASE_URL',
      dbUrl: process.env.DATABASE_URL
    });
  }

  try {
    console.log('📡 正在连接 Pooler...');
    console.log('主机:', process.env.DATABASE_URL.split('@')[1]?.split(':')[0] || 'unknown');
    
    // 创建连接池
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 20,  // 最大连接数
      min: 2    // 最小连接数
    });

    console.log('⏳ 正在获取客户端...');
    
    // 获取客户端
    const client = await pool.connect();
    console.log('✅ 客户端连接成功');

    // 执行简单查询
    console.log('🔍 执行查询：SELECT NOW(), version()');
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    
    console.log('✅ 查询成功');
    console.log('结果:', result.rows[0]);

    // 释放客户端
    client.release();

    // 关闭连接池
    await pool.end();
    console.log('✅ 连接池已关闭');

    // 返回成功响应
    return res.status(200).json({
      status: 'success',
      message: '✅ Pooler 连接成功！',
      data: {
        currentTime: result.rows[0].current_time,
        dbVersion: result.rows[0].db_version,
        host: process.env.DATABASE_URL.split('@')[1]?.split(':')[0],
        port: 5432,
        connectionType: 'Pooler (aws-1-ap-southeast-1)'
      }
    });

  } catch (error) {
    console.error('❌ 连接失败');
    console.error('错误代码:', error.code);
    console.error('错误信息:', error.message);
    console.error('完整错误:', error);
    
    // 分析错误并提供有用的提示
    let hint = '';
    let troubleshoot = [];
    
    if (error.code === 'ECONNREFUSED') {
      hint = '连接被拒绝 - 主机可能不存在或端口错误';
      troubleshoot = [
        '检查 DATABASE_URL 中的主机地址',
        '检查 DATABASE_URL 中的端口（应该是 5432）',
        '检查网络连接'
      ];
    } else if (error.code === 'ENOTFOUND') {
      hint = '无法找到主机 - DNS 解析失败';
      troubleshoot = [
        '检查主机名是否正确',
        '检查网络连接',
        '尝试 ping 主机地址'
      ];
    } else if (error.code === 'ETIMEDOUT') {
      hint = '连接超时 - 网络不通';
      troubleshoot = [
        '检查网络连接',
        '检查防火墙设置',
        '检查 VPN 连接'
      ];
    } else if (error.message.includes('password authentication failed')) {
      hint = '密码认证失败 - 密码错误';
      troubleshoot = [
        '检查 DATABASE_URL 中的用户名',
        '检查 DATABASE_URL 中的密码',
        '确保密码中的特殊字符已正确编码'
      ];
    } else if (error.message.includes('FATAL')) {
      hint = '数据库致命错误 - 可能是用户名、数据库名或权限问题';
      troubleshoot = [
        '检查用户名是否正确（应该是 postgres.diydajlvfdvujiogryte）',
        '检查数据库名称是否正确（应该是 postgres）',
        '检查用户权限'
      ];
    }

    return res.status(500).json({
      status: 'error',
      message: '❌ Pooler 连接失败',
      error: {
        code: error.code,
        message: error.message,
        hint: hint
      },
      troubleshooting: troubleshoot,
      dbUrlPreview: process.env.DATABASE_URL?.slice(0, 50) + '...' || 'not set'
    });
  } // 缺少的闭合括号在这里
}