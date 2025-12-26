
import { getSupabaseClient } from '../config/supabase.js';

// ==================== 辅助函数 ====================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode);
  res.end(JSON.stringify(data, null, 2));
}


async function verifyToken(token) {
  try {
    if (!token) {
      return { valid: false, error: '缺少 token' };
    }

    const supabase = getSupabaseClient(); 
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return { valid: false, error: 'Token 无效或已过期' };
    }

    return { valid: true, user };
  } catch (error) {
    console.error('Token 验证失败:', error);
    return { valid: false, error: error.message };
  }
}
export async function handleBooksRoute(pathname, req, res) {
  const method = req.method;
  
  // 1. 获取书籍计数（批量）
  if (pathname === '/api/books/counts' && method === 'POST') {
    try {
   
      const { bookIds } = body;
      
      if (!bookIds || !Array.isArray(bookIds)) {
        return sendJson(res, 400, { error: '缺少或无效的 bookIds 参数' });
      }
      
      const supabase = getSupabaseClient();
      
      // 并行获取所有计数
      const [wantCounts, readingCounts, noteCounts] = await Promise.all([
        supabase
          .from('book_wants')
          .select('book_id')
          .in('book_id', bookIds),
        supabase
          .from('book_readings')
          .select('book_id')
          .in('book_id', bookIds),
        supabase
          .from('book_notes')
          .select('book_id')
          .in('book_id', bookIds)
      ]);
      
      // 统计计数
      const counts = {};
      bookIds.forEach(bookId => {
        counts[bookId] = {
          want: (wantCounts.data?.filter(item => item.book_id === bookId).length || 0),
          read: (readingCounts.data?.filter(item => item.book_id === bookId).length || 0),
          note: (noteCounts.data?.filter(item => item.book_id === bookId).length || 0)
        };
      });
      
      return sendJson(res, 200, { counts });
      
    } catch (error) {
      console.error('获取书籍计数失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }
  
  // 2. 获取用户书籍状态（批量）
  if (pathname === '/api/books/user-status' && method === 'POST') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return sendJson(res, 401, { error: '未授权：缺少 token' });
      }
      
       
      const { bookIds } = body;
      
      if (!bookIds || !Array.isArray(bookIds)) {
        return sendJson(res, 400, { error: '缺少或无效的 bookIds 参数' });
      }
      
      const supabase = getSupabaseClient();
      
      // 验证用户
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return sendJson(res, 401, { error: 'Token 无效或已过期' });
      }
      
      // 并行获取用户状态
      const [userWants, userReadings] = await Promise.all([
        supabase
          .from('book_wants')
          .select('book_id')
          .eq('user_id', user.id)
          .in('book_id', bookIds),
        supabase
          .from('book_readings')
          .select('book_id')
          .eq('user_id', user.id)
          .in('book_id', bookIds)
      ]);
      
      const userStatus = {};
      bookIds.forEach(bookId => {
        userStatus[bookId] = {
          wanted: userWants.data?.some(item => item.book_id === bookId) || false,
          reading: userReadings.data?.some(item => item.book_id === bookId) || false
        };
      });
      
      return sendJson(res, 200, { userStatus });
      
    } catch (error) {
      console.error('获取用户状态失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }
  
  // 3. 获取书籍笔记（批量）
  if (pathname === '/api/books/notes/batch' && method === 'POST') {
    try {
       
      const { bookIds } = body;
      
      if (!bookIds || !Array.isArray(bookIds)) {
        return sendJson(res, 400, { error: '缺少或无效的 bookIds 参数' });
      }
      
      const supabase = getSupabaseClient();
      
      // 获取所有书籍的笔记
      const { data: allNotes, error } = await supabase
        .from('book_notes')
        .select('*')
        .in('book_id', bookIds)
        .order('page_start', { ascending: true, nullsFirst: false });
      
      if (error) {
        return sendJson(res, 400, { error: error.message });
      }
      
      // 按书籍ID分组
      const notesByBook = {};
      bookIds.forEach(bookId => {
        notesByBook[bookId] = allNotes?.filter(note => note.book_id === bookId) || [];
      });
      
      return sendJson(res, 200, { notes: notesByBook });
      
    } catch (error) {
      console.error('批量获取笔记失败:', error);
      return sendJson(res, 500, { error: error.message });
    }
  }
  
  return null;
}

