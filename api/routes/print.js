// routes/library.js - 后端库管理路由
import { createClient } from '@supabase/supabase-js';

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
}

function getSupabaseClient() {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: { persistSession: false, autoRefreshToken: false }
        }
    );
    return supabase;
}

// 验证 token
async function verifyToken(token) {
    try {
        if (!token) return { valid: false, error: '缺少 token' };

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

// 获取带注解的笔记辅助函数
async function getNoteWithAnnotations(supabase, noteId) {
    const { data: note, error: noteError } = await supabase
        .from('book_notes')
        .select('*')
        .eq('id', noteId)
        .single();

    if (noteError) throw noteError;

    const { data: annotations, error: annError } = await supabase
        .from('note_annotations')
        .select('*')
        .eq('note_id', noteId)
        .order('display_order', { ascending: true });

    if (annError) throw annError;

    return {
        ...note,
        annotations: annotations || []
    };
}

// 获取带注解的笔记列表
async function getNotesWithAnnotations(supabase, bookId) {
    const { data: notes, error: notesError } = await supabase
        .from('book_notes')
        .select('*')
        .eq('book_id', bookId)
        .order('page_start', { ascending: true, nullsFirst: false });

    if (notesError) throw notesError;

    if (!notes || notes.length === 0) return [];

    // 批量获取所有注解
    const noteIds = notes.map(n => n.id);
    const { data: allAnnotations, error: annError } = await supabase
        .from('note_annotations')
        .select('*')
        .in('note_id', noteIds)
        .order('display_order', { ascending: true });

    if (annError) throw annError;

    // 组织注解映射
    const annotationMap = {};
    (allAnnotations || []).forEach(ann => {
        if (!annotationMap[ann.note_id]) {
            annotationMap[ann.note_id] = [];
        }
        annotationMap[ann.note_id].push(ann);
    });

    // 为每个笔记添加对应的注解
    return notes.map(note => ({
        ...note,
        annotations: annotationMap[note.id] || []
    }));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

export async function handlePrintRoute(pathname, req, res) {
    const supabase = getSupabaseClient();
    const token = req.headers.authorization?.replace('Bearer ', '');

    console.log('📚 Library 路由处理:', pathname, req.method);

    // ======================== 统计信息 API ========================
    // POST /api/library/books-stats
    if (pathname === '/api/library/books-stats' && req.method === 'POST') {
        console.log('📊 处理 books-stats 请求');
        try {
            const { bookIds } = await readBody(req);
            console.log('📋 请求的 bookIds:', bookIds);

            // 获取用户 ID
            let userId = null;
            if (token) {
                const auth = await verifyToken(token);
                if (auth.valid) {
                    userId = auth.user.id;
                }
            }

            // 获取计数数据
            const { data: wantCounts } = await supabase
                .from('book_wants')
                .select('book_id')
                .in('book_id', bookIds);

            const { data: readingCounts } = await supabase
                .from('book_readings')
                .select('book_id')
                .in('book_id', bookIds);

            const { data: noteCounts } = await supabase
                .from('book_notes')
                .select('book_id')
                .in('book_id', bookIds);

            // 统计数据
            const wantCountMap = {};
            const readingCountMap = {};
            const noteCountMap = {};

            (wantCounts || []).forEach(item => {
                wantCountMap[item.book_id] = (wantCountMap[item.book_id] || 0) + 1;
            });

            (readingCounts || []).forEach(item => {
                readingCountMap[item.book_id] = (readingCountMap[item.book_id] || 0) + 1;
            });

            (noteCounts || []).forEach(item => {
                noteCountMap[item.book_id] = (noteCountMap[item.book_id] || 0) + 1;
            });

            // 获取用户个人状态
            const userWantSet = new Set();
            const userReadingSet = new Set();

            if (userId) {
                const { data: userWants } = await supabase
                    .from('book_wants')
                    .select('book_id')
                    .eq('user_id', userId)
                    .in('book_id', bookIds);

                const { data: userReadings } = await supabase
                    .from('book_readings')
                    .select('book_id')
                    .eq('user_id', userId)
                    .in('book_id', bookIds);

                (userWants || []).forEach(w => userWantSet.add(w.book_id));
                (userReadings || []).forEach(r => userReadingSet.add(r.book_id));
            }

            // 构建响应
            const result = {};
            bookIds.forEach(bookId => {
                result[bookId] = {
                    wantCount: wantCountMap[bookId] || 0,
                    readCount: readingCountMap[bookId] || 0,
                    noteCount: noteCountMap[bookId] || 0,
                    userWants: userWantSet.has(bookId),
                    userReadings: userReadingSet.has(bookId)
                };
            });

            console.log('✅ 返回统计数据:', result);
            return sendJson(res, 200, result);
        } catch (error) {
            console.error('获取统计信息失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 笔记列表 API ========================
    // GET /api/library/books/:bookId/notes-with-annotations
    if (pathname.startsWith('/api/library/books/') && pathname.endsWith('/notes-with-annotations')) {
        const bookId = pathname.match(/\/books\/([^/]+)\/notes-with-annotations/)[1];

        try {
            const notes = await getNotesWithAnnotations(supabase, bookId);
            return sendJson(res, 200, notes);
        } catch (error) {
            console.error('加载笔记失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 用户笔记 API ========================
    // GET /api/library/books/:bookId/user-notes
    if (pathname.startsWith('/api/library/books/') && pathname.endsWith('/user-notes')) {
        const bookId = pathname.match(/\/books\/([^/]+)\/user-notes/)[1];

        if (!token) {
            return sendJson(res, 401, { error: '未授权' });
        }

        try {
            const auth = await verifyToken(token);
            if (!auth.valid) {
                return sendJson(res, 401, { error: auth.error });
            }

            // 获取用户笔记
            const { data: notes, error: notesError } = await supabase
                .from('book_notes')
                .select('*')
                .eq('book_id', bookId)
                .eq('user_id', auth.user.id)
                .order('created_at', { ascending: false });

            if (notesError) throw notesError;

            if (!notes || notes.length === 0) {
                return sendJson(res, 200, []);
            }

            // 获取注解
            const noteIds = notes.map(n => n.id);
            const { data: allAnnotations } = await supabase
                .from('note_annotations')
                .select('*')
                .in('note_id', noteIds)
                .order('display_order', { ascending: true });

            const annotationMap = {};
            (allAnnotations || []).forEach(ann => {
                if (!annotationMap[ann.note_id]) {
                    annotationMap[ann.note_id] = [];
                }
                annotationMap[ann.note_id].push(ann);
            });

            const result = notes.map(note => ({
                ...note,
                annotations: annotationMap[note.id] || []
            }));

            return sendJson(res, 200, result);
        } catch (error) {
            console.error('加载用户笔记失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 创建笔记 ========================
    // POST /api/library/notes
    if (pathname === '/api/library/notes' && req.method === 'POST') {
        if (!token) {
            return sendJson(res, 401, { error: '未授权' });
        }

        try {
            const auth = await verifyToken(token);
            if (!auth.valid) {
                return sendJson(res, 401, { error: auth.error });
            }

            const { book_id, content, page_start, page_end } = await readBody(req);

            const { data: note, error } = await supabase
                .from('book_notes')
                .insert([{
                    user_id: auth.user.id,
                    book_id,
                    content,
                    page_start,
                    page_end
                }])
                .select();

            if (error) throw error;

            return sendJson(res, 201, note[0]);
        } catch (error) {
            console.error('创建笔记失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 删除笔记 ========================
    // DELETE /api/library/notes/:noteId
    if (pathname.startsWith('/api/library/notes/') && req.method === 'DELETE') {
        const noteId = pathname.match(/\/notes\/([^/]+)$/)[1];

        if (!token) {
            return sendJson(res, 401, { error: '未授权' });
        }

        try {
            const auth = await verifyToken(token);
            if (!auth.valid) {
                return sendJson(res, 401, { error: auth.error });
            }

            // 验证权限
            const { data: note, error: noteError } = await supabase
                .from('book_notes')
                .select('user_id')
                .eq('id', noteId)
                .single();

            if (noteError) throw noteError;

            if (note.user_id !== auth.user.id) {
                return sendJson(res, 403, { error: '没有权限删除此笔记' });
            }

            // 删除注解
            await supabase
                .from('note_annotations')
                .delete()
                .eq('note_id', noteId);

            // 删除笔记
            const { error: deleteError } = await supabase
                .from('book_notes')
                .delete()
                .eq('id', noteId);

            if (deleteError) throw deleteError;

            return sendJson(res, 200, { success: true });
        } catch (error) {
            console.error('删除笔记失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 切换想读状态 ========================
    // POST /api/library/toggle-want
    if (pathname === '/api/library/toggle-want' && req.method === 'POST') {
        if (!token) {
            return sendJson(res, 401, { error: '未授权' });
        }

        try {
            const auth = await verifyToken(token);
            if (!auth.valid) {
                return sendJson(res, 401, { error: auth.error });
            }

            const { bookId } = await readBody(req);

            // 检查是否已经在读
            const { data: existingReading } = await supabase
                .from('book_readings')
                .select('id')
                .eq('user_id', auth.user.id)
                .eq('book_id', bookId)
                .maybeSingle();

            if (existingReading) {
                await supabase
                    .from('book_readings')
                    .delete()
                    .eq('id', existingReading.id);
            }

            // 切换想读状态
            const { data: existingWant } = await supabase
                .from('book_wants')
                .select('id')
                .eq('user_id', auth.user.id)
                .eq('book_id', bookId)
                .maybeSingle();

            if (existingWant) {
                await supabase
                    .from('book_wants')
                    .delete()
                    .eq('id', existingWant.id);
            } else {
                await supabase
                    .from('book_wants')
                    .insert([{ user_id: auth.user.id, book_id: bookId }]);
            }

            return sendJson(res, 200, { success: true });
        } catch (error) {
            console.error('切换想读失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    // ======================== 切换在读状态 ========================
    // POST /api/library/toggle-reading
    if (pathname === '/api/library/toggle-reading' && req.method === 'POST') {
        if (!token) {
            return sendJson(res, 401, { error: '未授权' });
        }

        try {
            const auth = await verifyToken(token);
            if (!auth.valid) {
                return sendJson(res, 401, { error: auth.error });
            }

            const { bookId } = await readBody(req);

            // 检查是否已经想读
            const { data: existingWant } = await supabase
                .from('book_wants')
                .select('id')
                .eq('user_id', auth.user.id)
                .eq('book_id', bookId)
                .maybeSingle();

            if (existingWant) {
                await supabase
                    .from('book_wants')
                    .delete()
                    .eq('id', existingWant.id);
            }

            // 切换在读状态
            const { data: existingReading } = await supabase
                .from('book_readings')
                .select('id')
                .eq('user_id', auth.user.id)
                .eq('book_id', bookId)
                .maybeSingle();

            if (existingReading) {
                await supabase
                    .from('book_readings')
                    .delete()
                    .eq('id', existingReading.id);
            } else {
                await supabase
                    .from('book_readings')
                    .insert([{ user_id: auth.user.id, book_id: bookId }]);
            }

            return sendJson(res, 200, { success: true });
        } catch (error) {
            console.error('切换在读失败:', error);
            return sendJson(res, 500, { error: error.message });
        }
    }

    return null; // 没有匹配的路由
}