'use strict';

/* ══════════════════════════════════════════════════════════════
   نووا گیم — script.js v6.0
   تغییرات نسخه ۶:
   - فیکس باگ فرمت (ZWSP)
   - seed کاربران تستی همیشه‌حاضر
   - آیکون thumbs (بدون ایموجی)
   - لوگو کلیک به خانه
   - فیکس باگ ریپلای تودرتوی گروه
   - تب‌های PM (دریافت/ارسال/گروهی)
   - پیام سراسری
   - حذف PM از نوار بالا
   ══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   ۱. ابزارهای پایه
   ══════════════════════════════════════════════════════════════ */
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : v; } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* حافظه پر یا غیرفعال */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    json(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
};

function faNum(n) { return String(n == null ? 0 : n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function stripHtml(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; }

function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'همین الان';
    if (d < 3600) return faNum(Math.floor(d / 60)) + ' دقیقه پیش';
    if (d < 86400) return faNum(Math.floor(d / 3600)) + ' ساعت پیش';
    if (d < 604800) return faNum(Math.floor(d / 86400)) + ' روز پیش';
    try { return new Date(ts).toLocaleDateString('fa-IR'); } catch (e) { return ''; }
}

/* منشن — امن‌تر: فقط بعد از ابتدا/فاصله/کاراکتر باز */
function parseMentions(t) {
    if (!t) return '';
    return t.replace(/(^|[\s(>])@([a-zA-Z][a-zA-Z0-9_]{2,19})\b/g,
        (m, pre, u) => pre + '<span class="mention" data-username="' +
                       u.toLowerCase() + '">@' + u + '</span>');
}

/* fileToBase64 با validation نوع فایل */
async function uploadImage(file) {
    if (!file) throw new Error('فایلی انتخاب نشد');
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error('فقط عکس (PNG / JPG / GIF / WebP) مجاز است');
    if (file.size > 3 * 1024 * 1024) throw new Error('حجم فایل زیاده (بیشتر از ۳ مگابایت)');
    return API.upload(file);
}

/* آیکون‌های SVG — thumbs بدون ایموجی */
const ICON = {
    thumbUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
    thumbDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>'
};

/* ─── Toast با صف ─── */
const _toastQueue = [];
let _toastActive = false;
let _toastTimer;
function toast(msg, d) {
    _toastQueue.push({ msg, d: d || 2200 });
    if (!_toastActive) _showNextToast();
}
function _showNextToast() {
    if (!_toastQueue.length) { _toastActive = false; return; }
    _toastActive = true;
    const { msg, d } = _toastQueue.shift();
    const el = $('#toast');
    if (!el) { _toastActive = false; return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(_showNextToast, 250);
    }, d);
}

const isLowEnd = () => {
    try {
        return (navigator.hardwareConcurrency || 4) <= 4 ||
               (navigator.deviceMemory || 4) <= 2;
    } catch (e) { return false; }
};

/* ══════════════════════════════════════════════════════════════
   ۲. موتور ویرایش — Range-based + ZWSP fix
   ══════════════════════════════════════════════════════════════ */

const EMOJI_RE = /\p{Extended_Pictographic}/u;

function splitByEmoji(text) {
    if (!text) return [{ text: '', emoji: false }];
    const parts = [];
    let last = 0;
    const re = /\p{Extended_Pictographic}/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index), emoji: false });
        let end = m.index + m[0].length;
        while (end < text.length) {
            const code = text.codePointAt(end);
            if (code === 0xFE0F || code === 0x200D) { end += (code === 0x200D ? 2 : 1); continue; }
            if (code >= 0x1F3FB && code <= 0x1F3FF) { end += 2; continue; }
            break;
        }
        parts.push({ text: text.slice(m.index, end), emoji: true });
        last = end;
        re.lastIndex = end;
    }
    if (last < text.length) parts.push({ text: text.slice(last), emoji: false });
    return parts.length ? parts : [{ text, emoji: false }];
}

function wrapNodesWithoutEmoji(node, makeWrapper) {
    const frag = document.createDocumentFragment();
    const children = Array.from(node.childNodes);
    for (const child of children) {
        if (child.nodeType === 3) {
            const parts = splitByEmoji(child.textContent);
            for (const part of parts) {
                if (!part.text) continue;
                if (part.emoji) {
                    frag.appendChild(document.createTextNode(part.text));
                } else {
                    const w = makeWrapper();
                    w.textContent = part.text;
                    frag.appendChild(w);
                }
            }
        } else if (child.nodeType === 1) {
            const tagName = child.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') {
                frag.appendChild(child.cloneNode(true));
                continue;
            }
            const clone = child.cloneNode(false);
            const inner = wrapNodesWithoutEmoji(child, makeWrapper);
            clone.appendChild(inner);
            frag.appendChild(clone);
        } else {
            frag.appendChild(child.cloneNode(true));
        }
    }
    return frag;
}

/* ═══ اعمال استایل + ZWSP برای جلوگیری از ادامه فرمت ═══ */
function applyToSelection(makeWrapper) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const editable = node && node.closest('[contenteditable="true"]');
    if (!editable) return false;
    if (!editable.contains(range.commonAncestorContainer) &&
        !editable.contains(range.startContainer)) return false;

    const frag = range.extractContents();
    const wrapped = wrapNodesWithoutEmoji(frag, makeWrapper);
    const children = Array.from(wrapped.childNodes);
    range.insertNode(wrapped);

    /* FIX: بعد از insert، caret را بیرون wrapper با ZWSP قرار بده
       این مانع می‌شود که کاربر ادامه متن را با همان فرمت بنویسد */
    if (children.length) {
        const lastChild = children[children.length - 1];
        if (lastChild.parentNode) {
            const spacer = document.createTextNode('\u200B');
            lastChild.parentNode.insertBefore(spacer, lastChild.nextSibling);
            try {
                const nr = document.createRange();
                nr.setStart(spacer, 1);
                nr.collapse(true);
                sel.removeAllRanges();
                sel.addRange(nr);
            } catch (e) { /* ignore */ }
        }
    }
    return true;
}

/* پاک کردن ZWSPهایی که تنها محتوای یک textNode هستند */
function cleanupZWSP(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toRemove = [];
    let n;
    while ((n = walker.nextNode())) {
        if (n.textContent === '\u200B') toRemove.push(n);
    }
    /* فقط بعد از بسته شدن ادیتور یا blur پاک می‌کنیم تا caret نشکند */
    toRemove.forEach(node => {
        if (node.parentNode) node.parentNode.removeChild(node);
    });
}

const Ed = {
    bold() { return applyToSelection(() => { const s = document.createElement('strong'); s.style.fontWeight = '800'; return s; }); },
    italic() { return applyToSelection(() => { const s = document.createElement('em'); s.style.fontStyle = 'italic'; return s; }); },
    underline() { return applyToSelection(() => { const s = document.createElement('u'); s.style.textDecoration = 'underline'; return s; }); },
    color(color) { return applyToSelection(() => { const s = document.createElement('span'); s.style.color = color; return s; }); },
    rainbow() { return applyToSelection(() => { const s = document.createElement('span'); s.className = 'rainbow-text'; return s; }); },
    spoiler() {
        return applyToSelection(() => {
            const s = document.createElement('span');
            s.className = 'spoiler';
            return s;
        });
    },
    link() { return applyToSelection(() => { const s = document.createElement('a'); s.style.color = 'var(--accent)'; s.style.textDecoration = 'underline'; return s; }); },
    code() { return applyToSelection(() => { const s = document.createElement('code'); return s; }); }
};

/* ══════════════════════════════════════════════════════════════
   ۳. DB
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   ۳. ارتباط با سرور — API + کش state (جایگزین localStorage)
   ══════════════════════════════════════════════════════════════ */
const API = {
    async call(method, url, body) {
        let r;
        try {
            r = await fetch(url, {
                method, credentials: 'same-origin',
                headers: Object.assign({ 'X-Requested-With': 'nova' }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
        } catch (e) { throw new Error('ارتباط با سرور برقرار نشد'); }
        let data = null;
        try { data = await r.json(); } catch (_) {}
        if (!r.ok) {
            const err = new Error((data && data.error) || 'خطا در ارتباط با سرور');
            err.status = r.status;
            throw err;
        }
        return data;
    },
    get(u) { return API.call('GET', u); },
    post(u, b) { return API.call('POST', u, b === undefined ? {} : b); },
    put(u, b) { return API.call('PUT', u, b); },
    patch(u, b) { return API.call('PATCH', u, b); },
    del(u) { return API.call('DELETE', u); },
    async upload(blob) {
        let r;
        try {
            r = await fetch('/api/upload', {
                method: 'POST', credentials: 'same-origin', body: blob,
                headers: { 'X-Requested-With': 'nova', 'Content-Type': blob.type || 'application/octet-stream' }
            });
        } catch (e) { throw new Error('ارتباط با سرور برقرار نشد'); }
        let data = null;
        try { data = await r.json(); } catch (_) {}
        if (!r.ok) throw new Error((data && data.error) || 'آپلود ناموفق بود');
        return data.url;
    }
};

const ST = {
    me: null, users: [], posts: [], groups: [], activity: [], actLikes: {}, actComments: [],
    notifs: [], pm: [], blocks: {}, broadcast: null, pending: [], gmsgs: {}
};

const DB = {
    getUsers() { return ST.users; },
    getPosts() { return ST.posts; },
    getGroups() { return ST.groups; },
    getNotifs() { return ST.notifs; },
    getPM() { return ST.pm; },
    getActivity() { return ST.activity; },
    getActivityLikes() { return ST.actLikes; },
    getActivityComments() { return ST.actComments; },
    getBlocks() { return ST.blocks; },
    getPending() { return ST.pending; },
    getBroadcast() { return ST.broadcast; }
};

function applyState(d) {
    Object.keys(d).forEach(k => { ST[k] = d[k]; });
    if (!d.pending && d.posts) ST.pending = [];
    if (ST.me) {
        const i = ST.users.findIndex(u => u.id === ST.me.id);
        if (i > -1) ST.users[i] = Object.assign({}, ST.users[i], ST.me);
    }
    S.user = ST.me;
}

/* parts: users, posts, groups, activity, private, broadcast — خالی = همه */
async function sync(parts) {
    const qs = parts && parts.length ? '?parts=' + parts.join(',') : '';
    applyState(await API.get('/api/state' + qs));
}

/* اجرای یک عملیات سروری + همگام‌سازی + نمایش خطا */
async function act(fn, parts) {
    try {
        const r = await fn();
        if (parts !== false) await sync(parts);
        return r === undefined ? true : r;
    } catch (e) {
        if (e.status === 401 && S.user) {
            try { await sync(); updateAuthUI(); } catch (_) {}
        }
        toast(e.message || 'خطا');
        return false;
    }
}

async function loadGroupMessages(gid) {
    try { ST.gmsgs[gid] = (await API.get('/api/groups/' + gid + '/messages')).messages; }
    catch (e) { ST.gmsgs[gid] = []; }
}

/* حرف اول امن برای آواتار (escape شده) */
function ini(s, fb) {
    const ch = Array.from(String(s == null || s === '' ? (fb || '?') : s))[0] || '?';
    return esc(ch.toUpperCase());
}

/* ─── رویدادهای زنده (SSE) ─── */
let _es = null, _evParts = new Set(), _evGid = null, _evTimer = null;
function connectEvents() {
    closeEvents();
    if (typeof EventSource === 'undefined') return;
    try {
        _es = new EventSource('/api/events');
        _es.onmessage = e => {
            let ev; try { ev = JSON.parse(e.data); } catch (_) { return; }
            (ev.parts || []).forEach(p => _evParts.add(p));
            if (ev.gid) _evGid = ev.gid;
            clearTimeout(_evTimer);
            _evTimer = setTimeout(runLiveRefresh, 350);
        };
    } catch (e) { /* ignore */ }
}
function closeEvents() { if (_es) { try { _es.close(); } catch (_) {} _es = null; } }

function isTyping() {
    const a = document.activeElement;
    if (a && a.isContentEditable && a.textContent.replace(/\u200B/g, '').trim()) return true;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.type !== 'checkbox' && a.type !== 'radio' && a.value) return true;
    const rm = $('#replyModal');
    if (rm && !rm.hidden) return true;
    const ef = $('#editorFullscreen');
    if (ef && !ef.hidden) return true;
    return false;
}

async function runLiveRefresh() {
    const parts = Array.from(_evParts).filter(p => p !== 'group');
    const gid = _evGid;
    _evParts.clear(); _evGid = null;
    try {
        if (parts.length) await sync(parts);
        if (S.page === 'group' && gid && S.pageData === gid) await loadGroupMessages(gid);
    } catch (e) { return; }
    rerenderCurrent();
}

function rerenderCurrent() {
    updateAuthUI();
    renderBroadcast();
    if (isTyping()) return;
    const p = S.page;
    const pmFocused = document.activeElement && document.activeElement.id === 'pmInput';
    if (p === 'home') renderHome();
    else if (p === 'post') renderPostPage(S.pageData);
    else if (p === 'groups') renderGroupsPage();
    else if (p === 'group') renderGroupPage(S.pageData);
    else if (p === 'pm' && S.user) {
        renderPMChatList();
        if (S.pmActiveUser) {
            renderPMConversation(S.pmActiveUser);
            if (pmFocused) { const i = $('#pmInput'); if (i) i.focus(); }
            const unread = DB.getPM().some(m => m.from === S.pmActiveUser && m.to === S.user.id && !m.read);
            if (unread) API.post('/api/pm/read', { from: S.pmActiveUser }).catch(() => {});
        }
    }
    else if (p === 'users') renderUsersPage();
    else if (p === 'activity') renderActivityPage();
    else if (p === 'profile') renderProfilePage(S.pageData);
    const panel = $('#userPanel');
    if (panel && panel.classList.contains('on') && S.user) {
        const active = document.querySelector('.up-tab.active');
        if (active && active.dataset.tab !== 'profile') renderUserPanelBody(active.dataset.tab);
    }
}

/* وقتی تب دوباره فعال شد داده‌ها را تازه کن */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ST.users.length) {
        sync().then(rerenderCurrent).catch(() => {});
    }
});

async function openGroupPage(gid) {
    const box = $('#groupContent');
    if (box) box.innerHTML = '<div class="empty-state"><p>در حال بارگذاری…</p></div>';
    try { await sync(['groups']); } catch (e) {}
    await loadGroupMessages(gid);
    if (S.page === 'group' && S.pageData === gid) renderGroupPage(gid);
}

function markActivePMRead() {
    if (!S.user || !S.pmActiveUser) return;
    const unread = ST.pm.some(m => m.from === S.pmActiveUser && m.to === S.user.id && !m.read);
    if (!unread) return;
    const from = S.pmActiveUser;
    API.post('/api/pm/read', { from }).then(() => sync(['private'])).then(() => { updateBadges(); if (S.page === 'pm') renderPMChatList(); }).catch(() => {});
}

function refreshStaffPanels() {
    const vis = id => { const p = $(id); return p && !p.hidden; };
    if (vis('#adminPanel')) renderAdminTab(S.adminTab);
    if (vis('#editorPanel')) renderEditorTab(S.editorTab);
    if (vis('#authorPanel')) renderAuthorTab(S.authorTab);
}

/* گزینه‌های «انتخاب سردبیر/پین» فقط برای سردبیر و مدیر */
function applyEditorRoleUI() {
    const staff = !!S.user && (S.user.role === 'editor' || S.user.role === 'admin');
    ['#editorChoice', '#editorPinned'].forEach(id => {
        const el = $(id);
        const grp = el && (el.closest('.form-group') || el.parentElement);
        if (grp) grp.hidden = !staff;
    });
}

/* داده‌های localStorage نسخه‌ی قدیمی همین مرورگر (برای انتقال) */
function collectLegacyLocal() {
    const g = (k, fb) => store.json('nova.' + k, fb);
    const users = g('users', []);
    if (!users.length) return null;
    return {
        users, posts: g('posts', []), groups: g('groups', []), pm: g('pm', []), notifs: g('notifs', []),
        activity: g('activity', []), blocks: g('blocks', {}), pending: g('pending', []),
        actLikes: g('actLikes', {}), actComments: g('actComments', []), broadcast: g('broadcast', null)
    };
}

/* ══════════════════════════════════════════════════════════════
   ۴. State
   ══════════════════════════════════════════════════════════════ */
const S = {
    theme: store.get('nova.theme', 'light'),
    user: null,
    page: 'home',
    pageData: null,
    postFilter: 'all',
    timeFilter: 'day',
    groupFilter: 'all',
    adminTab: 'stats',
    editorTab: 'myposts',
    authorTab: 'myposts',
    cropMode: null, cropTarget: null, cropImg: null,
    cropZoom: 1, cropRotate: 0,
    editingPostId: null,
    pmActiveUser: null,
    pmTab: 'received', /* received | sent | groups */
    replyContext: null,
    _submitting: false
};

const _sessionViews = new Set();

/* ══════════════════════════════════════════════════════════════
   ۶. تم
   ══════════════════════════════════════════════════════════════ */
function applyTheme(theme) {
    let final = theme;
    if (theme === 'auto') {
        const h = new Date().getHours();
        final = (h >= 7 && h < 19) ? 'light' : 'dark';
    }
    document.documentElement.dataset.theme = final;
    S.theme = theme;
    store.set('nova.theme', theme);

    const icon = $('#themeIcon');
    if (icon) {
        if (theme === 'light') {
            icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
        } else if (theme === 'dark') {
            icon.innerHTML = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
        } else {
            icon.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>';
        }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = final === 'dark' ? '#0e1116' : '#f5f3ee';
}

function flipTheme() {
    const order = ['light', 'dark', 'auto'];
    const idx = order.indexOf(S.theme);
    const next = order[(idx + 1) % order.length];
    applyTheme(next);
    toast({ light: 'حالت روز', dark: 'حالت شب', auto: 'حالت خودکار' }[next]);
}
setInterval(() => { if (S.theme === 'auto') applyTheme('auto'); }, 60000);

/* ══════════════════════════════════════════════════════════════
   ۷. کاربر
   ══════════════════════════════════════════════════════════════ */
function getCurrentUser() { return ST.me || null; }
function getUserById(id) { return ST.users.find(u => u.id === id) || null; }

function badgesHtml(u) {
    if (!u) return '';
    let html = '';
    if (u.role === 'admin') html += '<svg class="badge-icon badge-crown-admin" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>';
    if (u.role === 'editor') html += '<svg class="badge-icon badge-tick-editor" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5L22 9.5l-5 4.5L18.5 22 12 18l-6.5 4L7 14 2 9.5l7-1z"/></svg>';
    if (u.tick === 'blue') html += '<svg class="badge-icon badge-tick-blue" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.5 14.5l-4-4L8 11l2.5 2.5L16 8l1.5 1.5-7 7z"/></svg>';
    if (u.tick === 'gold') html += '<svg class="badge-icon badge-tick-gold" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.5 14.5l-4-4L8 11l2.5 2.5L16 8l1.5 1.5-7 7z"/></svg>';
    return html ? '<span class="name-badge">' + html + '</span>' : '';
}

function updateAuthUI() {
    const u = S.user;
    const loginBtn = $('#loginBtn'), userBtn = $('#userBtn');
    const navAvatar = $('#navAvatar');
    const drawerUser = $('#drawerUser'), drawerAvatar = $('#drawerAvatar');
    const drawerName = $('#drawerName'), drawerUsername = $('#drawerUsername');
    const drawerLoginBtn = $('#drawerLoginBtn'), drawerNewPost = $('#drawerNewPost');
    const drawerAdminBtn = $('#drawerAdminBtn'), drawerEditorBtn = $('#drawerEditorBtn');
    const drawerAuthorBtn = $('#drawerAuthorBtn');
    const heroNewPost = $('#heroNewPost'), createGroupBtn = $('#createGroupBtn');

    if (!loginBtn || !userBtn) return;

    if (u) {
        loginBtn.hidden = true;
        userBtn.hidden = false;
        const initial = ini(u.displayName, 'U');
        if (navAvatar) navAvatar.innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="">' : initial;
        if (drawerUser) drawerUser.hidden = false;
        if (drawerAvatar) drawerAvatar.innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="">' : initial;
        if (drawerName) drawerName.innerHTML = esc(u.displayName) + badgesHtml(u);
        if (drawerUsername) drawerUsername.textContent = '@' + u.username;
        if (drawerLoginBtn) drawerLoginBtn.hidden = true;

        const canPost = u.role === 'admin' || u.role === 'editor' || u.role === 'author';
        if (drawerNewPost) drawerNewPost.hidden = !canPost;
        if (heroNewPost) heroNewPost.hidden = !canPost;
        if (createGroupBtn) createGroupBtn.hidden = u.role !== 'admin';
        if (drawerAdminBtn) drawerAdminBtn.hidden = u.role !== 'admin';
        if (drawerEditorBtn) drawerEditorBtn.hidden = !(u.role === 'admin' || u.role === 'editor');
        if (drawerAuthorBtn) drawerAuthorBtn.hidden = !(u.role === 'admin' || u.role === 'editor' || u.role === 'author');
    } else {
        loginBtn.hidden = false;
        userBtn.hidden = true;
        if (drawerUser) drawerUser.hidden = true;
        if (drawerLoginBtn) drawerLoginBtn.hidden = false;
        if (drawerNewPost) drawerNewPost.hidden = true;
        if (heroNewPost) heroNewPost.hidden = true;
        if (createGroupBtn) createGroupBtn.hidden = true;
        if (drawerAdminBtn) drawerAdminBtn.hidden = true;
        if (drawerEditorBtn) drawerEditorBtn.hidden = true;
        if (drawerAuthorBtn) drawerAuthorBtn.hidden = true;
    }
    updateBadges();
    /* بعد از ورود، بنر را دوباره ارزیابی کن */
    renderBroadcast();
}

function updateBadges() {
    if (!S.user) return;
    const notifCount = $('#notifCount'), msgCount = $('#msgCount');
    const friendCount = $('#friendCount'), navDot = $('#navNotifDot');
    const notifs = DB.getNotifs().filter(n => n.userId === S.user.id && !n.read);
    const msgs = DB.getPM().filter(m => m.to === S.user.id && !m.read);
    const reqs = (S.user.friendRequests || []).length;

    if (notifCount) { notifCount.hidden = notifs.length === 0; notifCount.textContent = faNum(notifs.length); }
    if (msgCount) { msgCount.hidden = msgs.length === 0; msgCount.textContent = faNum(msgs.length); }
    if (friendCount) { friendCount.hidden = reqs === 0; friendCount.textContent = faNum(reqs); }
    if (navDot) navDot.hidden = (notifs.length === 0 && msgs.length === 0);
}

async function logoutUser() {
    try { await API.post('/api/logout'); } catch (e) { /* ignore */ }
    store.del('nova.draft.content'); store.del('nova.draft.title'); store.del('nova.draft.ts');
    S.user = null; ST.me = null;
    try { await sync(); } catch (e) {}
    closeEvents(); connectEvents();
    updateAuthUI();
    closeUserPanel();
    toast('خارج شدی');
    if (['pm', 'groups', 'group'].includes(S.page)) showPage('home'); else rerenderCurrent();
}

/* ══════════════════════════════════════════════════════════════
   ۸. Blocks
   ══════════════════════════════════════════════════════════════ */
function isBlocked(ownerId, targetId) {
    const b = DB.getBlocks();
    return !!(b[ownerId] && b[ownerId].indexOf(targetId) > -1);
}
function hasBlockedMe(meId, otherId) { return isBlocked(otherId, meId); }
async function blockUser(tid) {
    if (!S.user || tid === S.user.id) return false;
    const ok = await act(() => API.post('/api/blocks/' + tid), ['private', 'users']);
    if (ok) toast('بلاک شد');
    return !!ok;
}
async function unblockUser(tid) {
    if (!S.user) return false;
    const ok = await act(() => API.del('/api/blocks/' + tid), ['private']);
    if (ok) toast('رفع بلاک شد');
    return !!ok;
}

/* ══════════════════════════════════════════════════════════════
   ۹. Router
   ══════════════════════════════════════════════════════════════ */
function showPage(page, data) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    S.page = page;
    S.pageData = data || null;
    window.scrollTo(0, 0);

    const titles = {
        home: 'نووا گیم', post: 'پست', groups: 'گروه‌ها', group: 'چت',
        pm: 'پیام‌ها', users: 'کاربران', activity: 'فعالیت‌ها',
        about: 'درباره ما', cinema: 'سینما', games: 'بازی', profile: 'پروفایل'
    };
    document.title = (titles[page] || 'نووا گیم') + ' | Nova Game';

    if (page === 'home') renderHome();
    if (page === 'post') renderPostPage(data, true);
    if (page === 'groups') renderGroupsPage();
    S.groupAll = null;
    if (page === 'group') openGroupPage(data);
    if (page === 'pm') { renderPMPage(); markActivePMRead(); }
    if (page === 'users') renderUsersPage();
    if (page === 'activity') renderActivityPage();
    if (page === 'profile') renderProfilePage(data);
}

/* ══════════════════════════════════════════════════════════════
   ۱۰. Home
   ══════════════════════════════════════════════════════════════ */
function renderHome() {
    renderPosts();
    renderTrending();
    renderHomeGroups();
}

function getFilteredPosts() {
    let posts = DB.getPosts().filter(p => p.status === 'published');
    if (S.postFilter === 'editor') posts = posts.filter(p => p.editorChoice === true);
    else if (S.postFilter === 'discussed') posts.sort((a, b) => ((b.comments || []).length) - ((a.comments || []).length));
    else if (S.postFilter === 'popular') posts.sort((a, b) => (b.views || 0) - (a.views || 0));
    else posts.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
    });
    return posts;
}

function renderPosts() {
    const grid = $('#postsGrid');
    if (!grid) return;
    const posts = getFilteredPosts();
    if (!posts.length) {
        grid.innerHTML = '<div class="empty-state"><h3>هنوز پستی نیست</h3><p>وقتی اولین پست منتشر بشه، اینجا نشون داده می‌شه</p></div>';
        return;
    }
    grid.innerHTML = '';
    posts.slice(0, 9).forEach(p => grid.appendChild(createPostCard(p)));
}

function createPostCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';
    const catLabel = { news: 'خبر', review: 'نقد', guide: 'راهنما', cinema: 'سینما', game: 'بازی' }[post.category] || 'خبر';
    const coverHtml = post.cover ? '<img src="' + post.cover + '" alt="" loading="lazy" decoding="async">' : '';
    const pinHtml = post.pinned ? '<span class="post-card-pin">پین</span>' : '';
    card.innerHTML =
        '<div class="post-card-cover" style="' + (post.cover ? '' : 'background:linear-gradient(135deg,var(--accent),var(--accent-2));') + '">' +
            coverHtml + '<span class="post-card-badge">' + catLabel + '</span>' + pinHtml +
        '</div>' +
        '<div class="post-card-body">' +
            '<h3 class="post-card-title">' + esc(post.title) + '</h3>' +
            '<p class="post-card-excerpt">' + esc(post.excerpt || stripHtml(post.content).slice(0, 120)) + '</p>' +
            '<div class="post-card-meta">' +
                '<span>' + timeAgo(post.createdAt) + '</span><span>·</span>' +
                '<span>' + faNum(post.views || 0) + ' بازدید</span>' +
            '</div>' +
        '</div>';
    card.addEventListener('click', () => showPage('post', post.id));
    return card;
}

function renderTrending() {
    const grid = $('#trendingGrid');
    if (!grid) return;
    let posts = DB.getPosts().filter(p => p.status === 'published');
    const now = Date.now();
    const ranges = { day: 86400000, week: 604800000, month: 2592000000 };
    const range = ranges[S.timeFilter] || ranges.day;
    posts = posts.filter(p => (now - p.createdAt) < range);
    posts.sort((a, b) => (b.views || 0) - (a.views || 0));
    if (!posts.length) {
        grid.innerHTML = '<div class="empty-state"><h3>چیزی برای نمایش نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    posts.slice(0, 6).forEach(p => grid.appendChild(createPostCard(p)));
}

function renderHomeGroups() {
    const grid = $('#homeGroupsGrid');
    if (!grid) return;
    const groups = DB.getGroups().filter(g => g.type === 'public').slice(0, 3);
    if (!groups.length) {
        grid.innerHTML = '<div class="empty-state"><h3>هنوز گروهی نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    groups.forEach(g => grid.appendChild(createGroupCard(g)));
}

/* ══════════════════════════════════════════════════════════════
   ۱۱. Post Page
   ══════════════════════════════════════════════════════════════ */
function renderPostPage(postId, isNewVisit) {
    const box = $('#postContent');
    if (!box) return;

    const scrollY = window.scrollY;
    const prevDraft = ($('#commentEditor') || {}).innerHTML || '';
    const wasPostPage = S.page === 'post';

    const posts = DB.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) {
        box.innerHTML = '<div class="empty-state"><h3>پست پیدا نشد</h3></div>';
        return;
    }

    if (isNewVisit && !_sessionViews.has(postId)) {
        _sessionViews.add(postId);
        API.post('/api/posts/' + postId + '/view').then(r => {
            if (r && r.counted) { post.views = r.views; const el = $('#postViews'); if (el) el.textContent = faNum(r.views); }
        }).catch(() => {});
    }

    const author = getUserById(post.authorId);
    const catLabel = { news: 'خبر', review: 'نقد', guide: 'راهنما', cinema: 'سینما', game: 'بازی' }[post.category] || 'خبر';
    const coverHtml = post.cover ? '<div class="post-page-cover"><img src="' + post.cover + '" alt="" loading="lazy" decoding="async"></div>' : '';
    const editedHtml = post.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';
    const canEdit = S.user && (S.user.id === post.authorId || S.user.role === 'admin' || S.user.role === 'editor');
    const canDelete = S.user && (S.user.id === post.authorId || S.user.role === 'admin');

    let actionsHtml = '';
    if (canEdit || canDelete) {
        actionsHtml = '<div class="post-page-actions">';
        if (canEdit) actionsHtml += '<button class="btn-ghost small" id="editPostBtn" type="button">ویرایش پست</button>';
        if (canDelete) actionsHtml += '<button class="btn-ghost small danger" id="deletePostBtn" type="button">حذف پست</button>';
        actionsHtml += '</div>';
    }

    const metaCat = catLabel + (post.score ? ' · ' + faNum(post.score) + '/۱۰' : '') + (post.editorChoice ? ' · انتخاب سردبیر' : '');

    let commentFormHtml = '';
    if (S.user) {
        commentFormHtml =
            '<div class="comment-form">' +
                '<div class="comment-editor" id="commentEditor" contenteditable="true" data-placeholder="نظرت رو بنویس"></div>' +
                '<div class="comment-toolbar">' +
                    '<button type="button" data-cmd="bold"><b>B</b></button>' +
                    '<button type="button" data-cmd="italic"><i>I</i></button>' +
                    '<button type="button" data-cmd="underline"><u>U</u></button>' +
                    '<span class="sep"></span>' +
                    '<button type="button" id="btnSpoiler">اسپویلر</button>' +
                    '<button type="button" id="btnMention">@</button>' +
                    '<button type="button" id="btnColorPicker">رنگ</button>' +
                    '<button type="button" id="btnRainbow">رقص نور</button>' +
                '</div>' +
                '<div class="color-picker" id="colorPicker" hidden>' +
                    '<input type="color" id="customColor">' +
                    '<div class="color-dot" style="background:#c9635d" data-color="#c9635d"></div>' +
                    '<div class="color-dot" style="background:#d99073" data-color="#d99073"></div>' +
                    '<div class="color-dot" style="background:#6b9b7a" data-color="#6b9b7a"></div>' +
                    '<div class="color-dot" style="background:#5b6eae" data-color="#5b6eae"></div>' +
                    '<div class="color-dot" style="background:#8b7eb8" data-color="#8b7eb8"></div>' +
                    '<div class="color-dot" style="background:#b0a4d4" data-color="#b0a4d4"></div>' +
                '</div>' +
                '<div class="comment-actions">' +
                    '<small style="font-size:11px;color:var(--tx-mute);"><span id="charCount">۰</span> کاراکتر</small>' +
                    '<button class="btn-primary small" id="submitComment" type="button">ارسال</button>' +
                '</div>' +
            '</div>';
    } else {
        commentFormHtml =
            '<div class="comment-form" style="text-align:center;padding:24px;">' +
                '<p style="font-size:13px;color:var(--tx-mute);margin-bottom:10px;">برای کامنت گذاشتن اول وارد شو</p>' +
                '<button class="btn-primary small" id="loginToComment" type="button">ورود</button>' +
            '</div>';
    }

    let comments = post.comments || [];
    if (S.user) comments = comments.filter(c => !isBlocked(S.user.id, c.userId));
    comments = comments.filter(c => c.status !== 'pending' ||
        (S.user && (c.userId === S.user.id || S.user.role === 'admin')));

    const commentsHtml = comments.length
        ? comments.map(c => renderComment(c, post.id, 0)).join('')
        : '<p style="text-align:center;color:var(--tx-mute);padding:20px;font-size:13px;">هنوز نظری نیست. اولین نفر باش</p>';

    box.innerHTML = coverHtml +
        '<div class="post-page-header">' +
            '<span class="post-page-cat">' + metaCat + '</span>' +
            '<h1 class="post-page-title">' + esc(post.title) + '</h1>' +
            '<div class="post-page-meta">' +
                '<div class="author">' +
                    '<div class="user-avatar">' + (post.authorAvatar ? '<img src="' + post.authorAvatar + '" alt="">' : (ini(post.authorName, 'N'))) + '</div>' +
                    '<strong>' + esc(post.authorName || 'ناشناس') + '</strong>' + (author ? badgesHtml(author) : '') +
                '</div>' +
                '<span>·</span><span>' + timeAgo(post.createdAt) + ' ' + editedHtml + '</span>' +
                '<span>·</span><span>' + faNum(post.views) + ' بازدید</span>' +
            '</div>' + actionsHtml +
        '</div>' +
        '<div class="post-page-body">' + post.content + '</div>' +
        '<div class="comments-section">' +
            '<div class="comments-head"><h3>نظرات <span>(' + faNum(comments.length) + ')</span></h3></div>' +
            commentFormHtml +
            '<div class="comment-list" id="commentList">' + commentsHtml + '</div>' +
        '</div>';

    initCommentEditor(post.id);

    const editBtn = $('#editPostBtn');
    if (editBtn) editBtn.addEventListener('click', () => openEditor(post.id));
    const delBtn = $('#deletePostBtn');
    if (delBtn) delBtn.addEventListener('click', () => {
        if (!confirm('پست حذف بشه؟')) return;
        act(() => API.del('/api/posts/' + post.id), ['posts']).then(ok => { if (ok) { toast('حذف شد'); showPage('home'); } });
    });

    /* بازیابی draft و اسکرول */
    const newEditor = $('#commentEditor');
    if (newEditor && prevDraft && wasPostPage) {
        newEditor.innerHTML = prevDraft;
        const cc = $('#charCount');
        if (cc) cc.textContent = faNum(newEditor.textContent.length);
    }

    /* انیمیشن پاک کردن will-change بعد از اجرا */
    box.querySelectorAll('.edited-tag').forEach(tag => {
        tag.addEventListener('animationend', () => tag.classList.add('animated'), { once: true });
    });
}

function renderComment(comment, postId, level) {
    const user = getUserById(comment.userId);
    const name = user ? user.displayName : (comment.userName || 'ناشناس');
    const avatar = user ? user.avatar : comment.userAvatar;
    const initial = ini(name);
    const likes = comment.likes || [];
    const dislikes = comment.dislikes || [];
    const userLiked = S.user && likes.indexOf(S.user.id) > -1;
    const userDisliked = S.user && dislikes.indexOf(S.user.id) > -1;

    let reactionsHtml = '';
    if (likes.length || dislikes.length) {
        const users = DB.getUsers();
        let avatars = '';
        likes.slice(0, 5).forEach(lid => {
            const lu = users.find(u => u.id === lid);
            if (lu) {
                const init = ini(lu.displayName, 'U');
                avatars += '<div class="reaction-avatar" title="' + esc(lu.displayName) + '">' +
                    (lu.avatar ? '<img src="' + lu.avatar + '" alt="">' : init) + '</div>';
            }
        });
        reactionsHtml = '<div class="reactions-list">' + avatars +
            (likes.length > 5 ? '<span class="reaction-count">+' + faNum(likes.length - 5) + '</span>' : '') +
            (likes.length ? '<span class="reaction-count">' + faNum(likes.length) + ' لایک</span>' : '') +
            '</div>';
    }

    const age = (Date.now() - comment.createdAt) / 1000;
    const editLimit = (user && user.tick === 'gold') ? Infinity : 120;
    const canEdit = S.user && S.user.id === comment.userId && age < editLimit;
    const canDelete = S.user && (S.user.id === comment.userId || S.user.role === 'admin');

    const pendingBadge = comment.status === 'pending' ? '<span class="comment-pending-badge">در انتظار تأیید</span>' : '';
    const editedTag = comment.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    let repliesHtml = '';
    if (comment.replies && comment.replies.length && level < 5) {
        repliesHtml = '<div class="comment-replies">' +
            comment.replies.filter(r => !(S.user && isBlocked(S.user.id, r.userId))).map(r => renderComment(r, postId, level + 1)).join('') + '</div>';
    }

    return '<div class="comment-item ' + (comment.status === 'pending' ? 'pending' : '') + '" data-comment-id="' + comment.id + '">' +
        '<div class="comment-item-header">' +
            '<div class="user-avatar">' + (avatar ? '<img src="' + avatar + '" alt="">' : initial) + '</div>' +
            '<div class="user-name">' +
                '<strong>' + esc(name) + (user ? badgesHtml(user) : '') + '</strong>' +
                '<small>@' + esc(user ? user.username : 'user') + '</small>' +
            '</div>' +
            '<span class="time">' + timeAgo(comment.createdAt) + ' ' + editedTag + '</span>' + pendingBadge +
        '</div>' +
        '<div class="comment-item-body">' + comment.content + '</div>' +
        '<div class="comment-item-footer">' +
            '<button class="comment-btn ' + (userLiked ? 'liked' : '') + '" data-like="' + comment.id + '" type="button">' + ICON.thumbUp + ' ' + faNum(likes.length) + '</button>' +
            '<button class="comment-btn ' + (userDisliked ? 'disliked' : '') + '" data-dislike="' + comment.id + '" type="button">' + ICON.thumbDown + ' ' + faNum(dislikes.length) + '</button>' +
            (level < 5 ? '<button class="comment-btn" data-reply="' + comment.id + '" type="button">پاسخ</button>' : '') +
            (canEdit ? '<button class="comment-btn" data-edit-comment="' + comment.id + '" type="button">ویرایش</button>' : '') +
            (canDelete ? '<button class="comment-btn" data-delete="' + comment.id + '" type="button">حذف</button>' : '') +
        '</div>' + reactionsHtml + repliesHtml +
    '</div>';
}

function findComment(list, id) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
        if (list[i].replies && list[i].replies.length) {
            const f = findComment(list[i].replies, id);
            if (f) return f;
        }
    }
    return null;
}

function initCommentEditor(postId) {
    const editor = $('#commentEditor');
    if (!editor) {
        const lb = $('#loginToComment');
        if (lb) lb.addEventListener('click', () => openModal('authOverlay'));
        return;
    }

    /* ZWSP cleanup روی beforeinput — تمیزکاری قبل از تایپ */
    editor.addEventListener('beforeinput', () => {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        const toRemove = [];
        let n;
        while ((n = walker.nextNode())) {
            if (n.textContent === '\u200B') toRemove.push(n);
        }
        toRemove.forEach(node => {
            if (node.parentNode && document.activeElement === editor) {
                try { node.parentNode.removeChild(node); } catch (e) {}
            }
        });
    });

    $$('.comment-toolbar button[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (cmd === 'bold') Ed.bold();
            else if (cmd === 'italic') Ed.italic();
            else if (cmd === 'underline') Ed.underline();
            editor.focus();
        });
    });

    const bS = $('#btnSpoiler');
    if (bS) {
        bS.addEventListener('mousedown', e => e.preventDefault());
        bS.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
    }

    const bM = $('#btnMention');
    if (bM) {
        bM.addEventListener('mousedown', e => e.preventDefault());
        bM.addEventListener('click', e => {
            e.preventDefault();
            const users = DB.getUsers().slice(0, 10).map(u => u.username).join('، ');
            const u = prompt('نام کاربری:\n' + users);
            if (u) {
                const span = document.createElement('span');
                span.className = 'mention';
                span.setAttribute('data-username', u.toLowerCase());
                span.textContent = '@' + u + ' ';
                const sel = window.getSelection();
                if (sel && sel.rangeCount) sel.getRangeAt(0).insertNode(span);
            }
            editor.focus();
        });
    }

    const bCP = $('#btnColorPicker');
    if (bCP) {
        bCP.addEventListener('mousedown', e => e.preventDefault());
        bCP.addEventListener('click', e => {
            e.preventDefault();
            const cp = $('#colorPicker');
            if (cp) cp.hidden = !cp.hidden;
        });
    }

    const cc = $('#customColor');
    if (cc) {
        cc.addEventListener('mousedown', e => e.preventDefault());
        cc.addEventListener('input', () => Ed.color(cc.value));
    }

    $$('#colorPicker .color-dot').forEach(dot => {
        dot.addEventListener('mousedown', e => e.preventDefault());
        dot.addEventListener('click', e => {
            e.preventDefault();
            Ed.color(dot.dataset.color);
            const cp = $('#colorPicker');
            if (cp) cp.hidden = true;
            editor.focus();
        });
    });

    const bR = $('#btnRainbow');
    if (bR) {
        bR.addEventListener('mousedown', e => e.preventDefault());
        bR.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
    }

    editor.addEventListener('input', () => {
        const charCount = $('#charCount');
        if (charCount) charCount.textContent = faNum(editor.textContent.length);
    });

    const submitBtn = $('#submitComment');
    if (submitBtn) submitBtn.addEventListener('click', () => {
        const content = editor.innerHTML.trim();
        if (!content || editor.textContent.trim().length < 2) { toast('نظرت خیلی کوتاهه'); return; }
        addComment(postId, content);
    });

    const list = $('#commentList');
    if (list) {
        list.addEventListener('click', e => {
            const like = e.target.closest('[data-like]');
            const dislike = e.target.closest('[data-dislike]');
            const reply = e.target.closest('[data-reply]');
            const del = e.target.closest('[data-delete]');
            const editBtn = e.target.closest('[data-edit-comment]');
            if (like) toggleCommentReaction(postId, like.dataset.like, 'like');
            if (dislike) toggleCommentReaction(postId, dislike.dataset.dislike, 'dislike');
            if (reply) openReplyModal({ mode: 'reply', postId, commentId: reply.dataset.reply });
            if (editBtn) openReplyModal({ mode: 'edit-comment', postId, commentId: editBtn.dataset.editComment });
            if (del && confirm('حذف بشه؟')) deleteComment(postId, del.dataset.delete);
        });
    }
}

async function addComment(postId, content) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    if (S._cmtBusy) return false;
    S._cmtBusy = true;
    try {
        const r = await act(() => API.post('/api/posts/' + postId + '/comments', { content }), ['posts', 'activity']);
        if (!r) return false;
        const ed = $('#commentEditor'); if (ed) ed.innerHTML = '';
        const cc = $('#charCount'); if (cc) cc.textContent = '۰';
        toast(r.status === 'pending' ? 'نظرت ثبت شد و بعد از تأیید مدیر برای همه دیده می‌شه' : 'نظرت ثبت شد');
        renderPostPage(postId);
        return true;
    } finally { S._cmtBusy = false; }
}

async function toggleCommentReaction(postId, commentId, type) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    const ok = await act(() => API.post('/api/posts/' + postId + '/comments/' + commentId + '/react', { type }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function updateCommentContent(postId, commentId, newHtml) {
    const ok = await act(() => API.patch('/api/posts/' + postId + '/comments/' + commentId, { content: newHtml }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function addReplyToComment(postId, commentId, text) {
    if (!S.user) return false;
    const ok = await act(() => API.post('/api/posts/' + postId + '/comments/' + commentId + '/replies', { content: text }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function deleteComment(postId, commentId) {
    const ok = await act(() => API.del('/api/posts/' + postId + '/comments/' + commentId), ['posts']);
    if (ok) { renderPostPage(postId); toast('حذف شد'); }
    return !!ok;
}

/* ══════════════════════════════════════════════════════════════
   ۱۲. Reply Modal
   ══════════════════════════════════════════════════════════════ */
function openReplyModal(ctx) {
    if (!S.user) { toast('اول وارد شو'); return; }
    S.replyContext = ctx;
    const modal = $('#replyModal');
    if (!modal) return;

    const titleEl = $('#replyModalTitle');
    const quotedEl = $('#replyModalQuoted');
    const editor = $('#replyModalEditor');

    if (ctx.mode === 'edit-comment') {
        if (titleEl) titleEl.textContent = 'ویرایش نظر';
        const post = DB.getPosts().find(p => p.id === ctx.postId);
        const c = findComment(post ? post.comments || [] : [], ctx.commentId);
        if (editor) editor.innerHTML = c ? c.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'edit-message') {
        if (titleEl) titleEl.textContent = 'ویرایش پیام';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const m = g ? (ST.gmsgs[g.id] || []).find(mm => mm.id === ctx.messageId) : null;
        if (editor) editor.innerHTML = m ? m.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'edit-reply') {
        if (titleEl) titleEl.textContent = 'ویرایش پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const r = g ? findReplyInGroup(g, ctx.replyId) : null;
        if (editor) editor.innerHTML = r ? r.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'reply') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        const post = DB.getPosts().find(p => p.id === ctx.postId);
        const c = findComment(post ? post.comments || [] : [], ctx.commentId);
        if (quotedEl && c) {
            const u = getUserById(c.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (c.userName || 'کاربر')) + '</strong>' +
                stripHtml(c.content).slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'reply-message') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const m = g ? (ST.gmsgs[g.id] || []).find(mm => mm.id === ctx.messageId) : null;
        if (quotedEl && m) {
            const u = getUserById(m.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (m.userName || 'کاربر')) + '</strong>' +
                stripHtml(m.content || 'پیام تصویری').slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'reply-reply') {
        if (titleEl) titleEl.textContent = 'پاسخ به پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const r = g ? findReplyInGroup(g, ctx.replyId) : null;
        if (quotedEl && r) {
            const u = getUserById(r.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (r.userName || 'کاربر')) + '</strong>' +
                stripHtml(r.content).slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'activity-comment') {
        if (titleEl) titleEl.textContent = 'نظر';
        if (quotedEl) quotedEl.hidden = true;
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'activity-reply') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        if (quotedEl) quotedEl.hidden = true;
        if (editor) editor.innerHTML = '';
    }

    modal.hidden = false;
    requestAnimationFrame(() => {
        modal.classList.add('on');
        if (editor) {
            editor.focus();
            const r = document.createRange();
            r.selectNodeContents(editor);
            r.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }
    });
    document.body.classList.add('locked');
}

function closeReplyModal() {
    const modal = $('#replyModal');
    if (!modal) return;
    modal.classList.remove('on');
    setTimeout(() => {
        modal.hidden = true;
        if (!document.querySelector('.modal-overlay.on') &&
            !document.querySelector('.side-modal:not([hidden])') &&
            !document.querySelector('.user-panel.on')) {
            document.body.classList.remove('locked');
        }
    }, 220);
    S.replyContext = null;
}

async function submitReplyModal() {
    if (S._submitting) return;
    const editor = $('#replyModalEditor');
    if (!editor || !S.replyContext) return;
    const html = editor.innerHTML.trim();
    if (!html || editor.textContent.trim().length < 1) { toast('متن خالیه'); return; }

    S._submitting = true;
    const ctx = S.replyContext;
    let ok = false;
    try {
        if (ctx.mode === 'reply') ok = await addReplyToComment(ctx.postId, ctx.commentId, html);
        else if (ctx.mode === 'edit-comment') ok = await updateCommentContent(ctx.postId, ctx.commentId, html);
        else if (ctx.mode === 'reply-message') ok = await addReplyToMessage(ctx.groupId, ctx.messageId, html);
        else if (ctx.mode === 'edit-message') ok = await updateMessageContent(ctx.groupId, ctx.messageId, html);
        else if (ctx.mode === 'reply-reply') ok = await addReplyToReply(ctx.groupId, ctx.replyId, html);
        else if (ctx.mode === 'edit-reply') ok = await updateReplyContent(ctx.groupId, ctx.replyId, html);
        else if (ctx.mode === 'activity-comment') ok = await submitActivityComment(ctx.activityId, html);
        else if (ctx.mode === 'activity-reply') ok = await submitActivityReply(ctx.commentId, html);
    } finally { S._submitting = false; }
    if (ok) { closeReplyModal(); toast('ثبت شد'); }
}

function initReplyModal() {
    const modal = $('#replyModal');
    if (!modal) return;
    const editor = $('#replyModalEditor');

    $$('.reply-modal-toolbar button[data-reply-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const cmd = btn.dataset.replyCmd;
            if (cmd === 'bold') Ed.bold();
            else if (cmd === 'italic') Ed.italic();
            else if (cmd === 'underline') Ed.underline();
            editor.focus();
        });
    });

    const sp = $('#replySpoiler');
    if (sp) {
        sp.addEventListener('mousedown', e => e.preventDefault());
        sp.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
    }

    const rb = $('#replyRainbow');
    if (rb) {
        rb.addEventListener('mousedown', e => e.preventDefault());
        rb.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
    }

    const cb = $('#replyColorBtn');
    if (cb) {
        cb.addEventListener('mousedown', e => e.preventDefault());
        cb.addEventListener('click', e => {
            e.preventDefault();
            const p = $('#replyColorPicker');
            if (p) p.hidden = !p.hidden;
        });
    }

    const cc = $('#replyCustomColor');
    if (cc) {
        cc.addEventListener('mousedown', e => e.preventDefault());
        cc.addEventListener('input', () => Ed.color(cc.value));
    }

    $$('#replyColorPicker .color-dot').forEach(dot => {
        dot.addEventListener('mousedown', e => e.preventDefault());
        dot.addEventListener('click', e => {
            e.preventDefault();
            Ed.color(dot.dataset.color);
            const p = $('#replyColorPicker');
            if (p) p.hidden = true;
            editor.focus();
        });
    });

    const mb = $('#replyMention');
    if (mb) {
        mb.addEventListener('mousedown', e => e.preventDefault());
        mb.addEventListener('click', e => {
            e.preventDefault();
            const u = prompt('نام کاربری برای منشن:');
            if (u) {
                const span = document.createElement('span');
                span.className = 'mention';
                span.setAttribute('data-username', u.toLowerCase());
                span.textContent = '@' + u + ' ';
                const sel = window.getSelection();
                if (sel && sel.rangeCount) sel.getRangeAt(0).insertNode(span);
                editor.focus();
            }
        });
    }

    const send = $('#replyModalSend');
    if (send) send.addEventListener('click', submitReplyModal);
    const cancel = $('#replyModalCancel');
    if (cancel) cancel.addEventListener('click', closeReplyModal);

    modal.addEventListener('click', e => {
        if (e.target.closest('[data-close="replyModal"]')) closeReplyModal();
    });

    if (editor) editor.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submitReplyModal();
        }
    });
}

function findInList(list, id) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
        if (list[i].replies && list[i].replies.length) {
            const f = findInList(list[i].replies, id);
            if (f) return f;
        }
    }
    return null;
}

/* FIX: پیدا کردن یک reply در کل گروه (نه فقط پیام‌های top-level) */
function findReplyInGroup(group, replyId) {
    for (const m of (ST.gmsgs[group.id] || [])) {
        const r = findInList(m.replies || [], replyId);
        if (r) return r;
    }
    return null;
}

/* ══════════════════════════════════════════════════════════════
   ۱۳. Activity
   ══════════════════════════════════════════════════════════════ */
function renderActivityPage() {
    const list = $('#activityList');
    if (!list) return;
    const activities = DB.getActivity().slice().reverse();
    if (!activities.length) {
        list.innerHTML = '<div class="empty-state"><h3>هنوز فعالیتی نیست</h3></div>';
        return;
    }

    const icons = { post: 'پ', comment: 'ن', chat: 'چ', like: 'ل', friend: 'د', group: 'گ' };
    const likes = DB.getActivityLikes();
    const comments = DB.getActivityComments();

    list.innerHTML = '';
    activities.forEach(a => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.dataset.activityId = a.id;

        const likeUsers = likes[a.id] || [];
        const userLiked = S.user && likeUsers.indexOf(S.user.id) > -1;
        const activityComments = comments.filter(c => c.activityId === a.id);
        const actor = a.userId ? getUserById(a.userId) : null;

        let userLine = '';
        if (actor) {
            const init = ini(actor.displayName, 'U');
            userLine = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<div class="user-avatar" style="width:28px;height:28px;font-size:11px;">' +
                    (actor.avatar ? '<img src="' + actor.avatar + '" alt="">' : init) +
                '</div>' +
                '<strong style="font-size:13px;color:var(--tx);">' + esc(actor.displayName) + '</strong>' +
                badgesHtml(actor) +
            '</div>';
        }

        let commentsHtml = '';
        activityComments.forEach(c => {
            const cu = getUserById(c.userId);
            const cin = ini(cu ? cu.displayName : 'ناشناس');
            commentsHtml += '<div class="activity-comment" data-comment-id="' + c.id + '">' +
                '<div class="user-avatar">' + (cu && cu.avatar ? '<img src="' + cu.avatar + '" alt="">' : cin) + '</div>' +
                '<div class="activity-comment-body">' +
                    '<strong>' + esc(cu ? cu.displayName : 'ناشناس') + '</strong>' +
                    '<p>' + c.content + '</p>' +
                    '<div class="meta">' + timeAgo(c.ts) +
                        ' · <button class="activity-reply-btn" data-reply-activity="' + c.id + '" type="button">پاسخ</button>' +
                    '</div>' +
                    renderActivityReplies(c) +
                '</div>' +
            '</div>';
        });

        item.innerHTML =
            userLine +
            '<div class="activity-head">' +
                '<div class="activity-icon">' + (icons[a.type] || '?') + '</div>' +
                '<div class="activity-body">' +
                    '<p>' + esc(a.text) + '</p>' +
                    '<small>' + timeAgo(a.ts) + '</small>' +
                '</div>' +
            '</div>' +
            '<div class="activity-actions">' +
                '<button class="activity-action-btn ' + (userLiked ? 'liked' : '') + '" data-act-like="' + a.id + '" type="button">' +
                    ICON.thumbUp + ' ' + faNum(likeUsers.length) +
                '</button>' +
                '<button class="activity-action-btn" data-act-comment="' + a.id + '" type="button">' +
                    '💬 کامنت ' + faNum(activityComments.length) +
                '</button>' +
            '</div>' +
            (activityComments.length ? '<div class="activity-comments">' + commentsHtml + '</div>' : '');

        list.appendChild(item);
    });

    /* استفاده از addEventListener با flag برای جلوگیری از دوباره‌bind */
    if (list._handler) list.removeEventListener('click', list._handler);
    list._handler = function(e) {
        const like = e.target.closest('[data-act-like]');
        const comment = e.target.closest('[data-act-comment]');
        const replyAct = e.target.closest('[data-reply-activity]');
        if (like) toggleActivityLike(like.dataset.actLike);
        if (comment) addActivityComment(comment.dataset.actComment);
        if (replyAct) replyToActivityComment(replyAct.dataset.replyActivity);
    };
    list.addEventListener('click', list._handler);
}

async function toggleActivityLike(activityId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await act(() => API.post('/api/activity/' + activityId + '/like'), ['activity']);
    if (ok) renderActivityPage();
}

function addActivityComment(activityId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    openReplyModal({ mode: 'activity-comment', activityId });
}

function replyToActivityComment(commentId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    openReplyModal({ mode: 'activity-reply', commentId });
}

async function submitActivityComment(activityId, html) {
    const ok = await act(() => API.post('/api/activity/' + activityId + '/comments', { content: html }), ['activity']);
    if (ok) renderActivityPage();
    return !!ok;
}

async function submitActivityReply(commentId, html) {
    const ok = await act(() => API.post('/api/activity-comments/' + commentId + '/replies', { content: html }), ['activity']);
    if (ok) renderActivityPage();
    return !!ok;
}

function renderActivityReplies(comment) {
    if (!comment.replies || !comment.replies.length) return '';
    let html = '<div class="activity-comment-replies">';
    comment.replies.forEach(r => {
        const ru = getUserById(r.userId);
        const rin = ini(ru ? ru.displayName : 'ناشناس');
        html += '<div class="activity-comment-reply">' +
            '<div class="user-avatar">' + (ru && ru.avatar ? '<img src="' + ru.avatar + '" alt="">' : rin) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<strong>' + esc(ru ? ru.displayName : 'ناشناس') + '</strong>' +
                '<p>' + r.content + '</p>' +
                '<div class="meta" style="font-size:10px;color:var(--tx-mute);margin-top:2px;">' + timeAgo(r.ts) + '</div>' +
            '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

/* ══════════════════════════════════════════════════════════════
   ۱۴. Groups
   ══════════════════════════════════════════════════════════════ */
function renderGroupsPage() {
    const grid = $('#groupsGrid');
    if (!grid) return;
    let groups = DB.getGroups();
    if (S.groupFilter === 'public') groups = groups.filter(g => g.type === 'public');
    else if (S.groupFilter === 'private') groups = groups.filter(g => g.type === 'private');
    else if (S.groupFilter === 'mine') {
        if (!S.user) groups = [];
        else groups = groups.filter(g => (S.user.groups || []).indexOf(g.id) > -1);
    }
    if (!groups.length) {
        grid.innerHTML = '<div class="empty-state"><h3>گروهی نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    groups.forEach(g => grid.appendChild(createGroupCard(g)));
}

function createGroupCard(group) {
    const card = document.createElement('div');
    card.className = 'group-card';
    const typeLabel = group.type === 'public' ? 'عمومی' : 'خصوصی';
    let coverStyle = 'background:linear-gradient(135deg,var(--accent),var(--accent-2));';
    if (group.cover) coverStyle = "background:url('" + group.cover + "') center/cover;";
    card.innerHTML = '<div class="group-card-cover" style="' + coverStyle + '">' +
            '<span class="group-card-type ' + group.type + '">' + typeLabel + '</span>' +
        '</div>' +
        '<div class="group-card-body">' +
            '<div class="group-card-avatar">' +
                (group.avatar ? '<img src="' + group.avatar + '" alt="">' : ini(group.name, 'G')) +
            '</div>' +
            '<div class="group-card-info">' +
                '<h3>' + esc(group.name) + '</h3>' +
                '<p>' +
                    '<span>' + faNum(group.memberCount) + ' عضو</span>' +
                    '<span>·</span>' +
                    '<span>' + faNum((ST.gmsgs[group.id] || []).length) + ' پیام</span>' +
                '</p>' +
            '</div>' +
        '</div>';
    card.addEventListener('click', () => showPage('group', group.id));
    return card;
}

function renderGroupPage(groupId) {
    const box = $('#groupContent');
    if (!box) return;
    const group = DB.getGroups().find(g => g.id === groupId);
    if (!group) { box.innerHTML = '<div class="empty-state"><h3>گروه پیدا نشد</h3></div>'; return; }

    const u = S.user;
    const myId = u ? u.id : null;
    const isMember = myId && (group.members || []).indexOf(myId) > -1;
    const isOwner = myId && group.ownerId === myId;
    const isAdmin = myId && (group.admins || []).indexOf(myId) > -1;
    const isMod = myId && (group.mods || []).indexOf(myId) > -1;
    const isBanned = myId && (group.banned || []).indexOf(myId) > -1;
    const isSiteAdmin = u && u.role === 'admin';

    if (group.type === 'private' && !isMember && !isOwner && !isAdmin && !isMod && !isSiteAdmin) {
        if (isBanned) { box.innerHTML = '<div class="empty-state"><h3>از این گروه بن شدی</h3></div>'; return; }
        box.innerHTML = '<div class="empty-state">' +
                '<h3>گروه خصوصی</h3><p>برای ورود درخواست بده</p>' +
                '<button class="btn-primary" id="requestJoinBtn" type="button" style="margin-top:14px;">درخواست عضویت</button>' +
            '</div>';
        const rj = $('#requestJoinBtn');
        if (rj) rj.addEventListener('click', () => requestJoinGroup(groupId));
        return;
    }

    const users = DB.getUsers();
    const owner = users.find(x => x.id === group.ownerId);

    let ownerHtml = '';
    if (owner) {
        ownerHtml = '<div class="team-member owner" data-user-id="' + owner.id + '">' +
            '<div class="user-avatar">' + (owner.avatar ? '<img src="' + owner.avatar + '" alt="">' : ini(owner.displayName)) + '</div>' +
            '<svg class="team-role-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>' +
            '<span class="team-name">' + esc(owner.displayName) + '</span>' +
        '</div>';
    }

    let adminsHtml = '';
    (group.admins || []).forEach(aid => {
        const au = users.find(x => x.id === aid);
        if (!au) return;
        adminsHtml += '<div class="team-member admin" data-user-id="' + au.id + '">' +
            '<div class="user-avatar">' + (au.avatar ? '<img src="' + au.avatar + '" alt="">' : ini(au.displayName)) + '</div>' +
            '<svg class="team-role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6.5L22 9.5l-5 4.5L18.5 22 12 18l-6.5 4L7 14 2 9.5l7-1z"/></svg>' +
            '<span class="team-name">' + esc(au.displayName) + '</span>' +
        '</div>';
    });

    let modsHtml = '';
    (group.mods || []).forEach(mid => {
        const mu = users.find(x => x.id === mid);
        if (!mu) return;
        modsHtml += '<div class="team-member mod" data-user-id="' + mu.id + '">' +
            '<div class="user-avatar">' + (mu.avatar ? '<img src="' + mu.avatar + '" alt="">' : ini(mu.displayName)) + '</div>' +
            '<span class="team-name">' + esc(mu.displayName) + '</span>' +
        '</div>';
    });

    let teamSection = '';
    if (ownerHtml || adminsHtml || modsHtml) {
        teamSection = '<div class="group-team-section">' +
            '<div class="group-team-title">تیم مدیریت</div>' +
            (ownerHtml ? '<div class="team-row">' + ownerHtml + '</div>' : '') +
            (adminsHtml ? '<div class="team-row">' + adminsHtml + '</div>' : '') +
            (modsHtml ? '<div class="team-row">' + modsHtml + '</div>' : '') +
        '</div>';
    }

    let messages = ST.gmsgs[group.id] || [];
    if (myId) messages = messages.filter(m => !isBlocked(myId, m.userId));
    const visible = S.groupAll === groupId ? messages : messages.slice(-20);
    let messagesHtml = '';
    if (messages.length > 20 && S.groupAll !== groupId) messagesHtml += '<button class="chat-load-more" id="loadMoreMsgs" type="button">نمایش پیام‌های قدیمی‌تر</button>';
    messagesHtml += visible.map(m => renderChatMessage(m, group, 0)).join('');
    if (!visible.length) messagesHtml += '<p style="text-align:center;color:var(--tx-mute);padding:30px;font-size:13px;">هنوز پیامی نیست</p>';

    let actionsHtml = '';
    if (isOwner || isAdmin || isMod || isSiteAdmin) {
        actionsHtml += '<button class="btn-ghost small" id="groupSettingsBtn" type="button">تنظیمات گروه</button>';
    }
    if (!isMember && group.type === 'public' && !isBanned) {
        actionsHtml += '<button class="btn-primary small" id="joinGroupBtn" type="button">عضویت در گروه</button>';
    }
    if ((isMember || isOwner || isAdmin || isMod) && !isOwner) {
        actionsHtml += '<button class="btn-ghost small danger" id="leaveGroupBtn" type="button">خروج از گروه</button>';
    }
    if (isBanned) {
        actionsHtml += '<span class="role-badge" style="background:rgba(201,99,93,.15);color:var(--bad);padding:6px 12px;border-radius:100px;font-size:11px;">بن شده</span>';
    }

    let inputHtml = '';
    if (isMember || isOwner || isAdmin || isMod) {
        inputHtml = '<div class="chat-input-wrap">' +
            '<div class="chat-editor" id="chatEditor" contenteditable="true" data-placeholder="پیامت رو بنویس"></div>' +
            '<div class="chat-toolbar">' +
                '<div class="chat-toolbar-left">' +
                    '<button type="button" data-chat-cmd="bold"><b>B</b></button>' +
                    '<button type="button" data-chat-cmd="italic"><i>I</i></button>' +
                    '<button type="button" id="chatSpoiler">اسپویلر</button>' +
                    '<button type="button" id="chatColor">رنگ</button>' +
                    '<button type="button" id="chatRainbow">رقص نور</button>' +
                    '<button type="button" id="chatImage">تصویر</button>' +
                '</div>' +
                '<div class="chat-toolbar-right">' +
                    '<button type="button" class="chat-send-btn" id="chatSend">ارسال</button>' +
                '</div>' +
            '</div>' +
            '<div class="color-picker" id="chatColorPicker" hidden style="margin-top:8px;">' +
                '<input type="color" id="chatCustomColor">' +
                '<div class="color-dot" style="background:#c9635d" data-color="#c9635d"></div>' +
                '<div class="color-dot" style="background:#d99073" data-color="#d99073"></div>' +
                '<div class="color-dot" style="background:#6b9b7a" data-color="#6b9b7a"></div>' +
                '<div class="color-dot" style="background:#5b6eae" data-color="#5b6eae"></div>' +
                '<div class="color-dot" style="background:#8b7eb8" data-color="#8b7eb8"></div>' +
            '</div>' +
        '</div>';
    } else {
        inputHtml = '<div class="chat-input-wrap" style="text-align:center;padding:16px;">' +
            '<p style="font-size:12px;color:var(--tx-mute);">' +
                (isBanned ? 'تو بن شدی، نمی‌تونی پیام بفرستی' : 'برای ارسال پیام، عضو گروه شو') +
            '</p>' +
        '</div>';
    }

    const groupCoverStyle = group.cover ? '' : 'background:linear-gradient(135deg,var(--accent),var(--accent-2),var(--accent-3));';
    const groupAvatarHtml = group.avatar
        ? '<img src="' + group.avatar + '" alt="">'
        : ini(group.name, 'G');

    box.innerHTML =
        '<div class="group-hero">' +
            '<div class="group-hero-cover" style="' + groupCoverStyle + '">' +
                (group.cover ? '<img src="' + group.cover + '" alt="" loading="lazy">' : '') +
            '</div>' +
            '<div class="group-hero-content">' +
                '<div class="group-hero-avatar">' + groupAvatarHtml + '</div>' +
                '<h1 class="group-hero-name">' + esc(group.name) + '</h1>' +
                (group.description ? '<p class="group-hero-desc">' + esc(group.description) + '</p>' : '') +
                '<div class="group-hero-stats">' +
                    '<div class="group-hero-stat"><strong>' + faNum(group.memberCount) + '</strong><span>عضو</span></div>' +
                    '<div class="group-hero-stat"><strong>' + faNum(messages.length) + '</strong><span>پیام</span></div>' +
                    '<div class="group-hero-stat"><strong>' + (group.type === 'public' ? 'عمومی' : 'خصوصی') + '</strong><span>نوع</span></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        teamSection +
        (actionsHtml ? '<div class="group-actions-bar">' + actionsHtml + '</div>' : '') +
        '<div class="chat-box">' +
            '<div class="chat-messages" id="chatMessages">' + messagesHtml + '</div>' +
            inputHtml +
        '</div>';

    initChat(groupId, group);

    const lm = $('#loadMoreMsgs');
    if (lm) lm.addEventListener('click', () => { S.groupAll = groupId; renderGroupPage(groupId); });

    const gsb = $('#groupSettingsBtn');
    if (gsb) gsb.addEventListener('click', () => openGroupSettings(groupId));
    const jb = $('#joinGroupBtn');
    if (jb) jb.addEventListener('click', () => joinGroup(groupId));
    const lb = $('#leaveGroupBtn');
    if (lb) lb.addEventListener('click', () => leaveGroup(groupId));

    box.querySelectorAll('.team-member[data-user-id]').forEach(el => {
        el.addEventListener('click', () => showPage('profile', el.dataset.userId));
    });

    setTimeout(() => {
        const cm = $('#chatMessages');
        if (cm) cm.scrollTop = cm.scrollHeight;
    }, 60);
}

function renderChatMessage(msg, group, level) {
    const user = getUserById(msg.userId);
    const name = user ? user.displayName : (msg.userName || 'ناشناس');
    const avatar = user ? user.avatar : msg.userAvatar;
    const initial = ini(name);

    let roleBadge = '';
    if (group.ownerId === msg.userId) roleBadge = '<span class="role-badge owner">مدیر</span>';
    else if ((group.admins || []).indexOf(msg.userId) > -1) roleBadge = '<span class="role-badge admin">ادمین</span>';
    else if ((group.mods || []).indexOf(msg.userId) > -1) roleBadge = '<span class="role-badge mod">ناظر</span>';

    const userLiked = S.user && (msg.likes || []).indexOf(S.user.id) > -1;
    const userDisliked = S.user && (msg.dislikes || []).indexOf(S.user.id) > -1;
    const imageHtml = msg.image ? '<img src="' + msg.image + '" class="chat-msg-image" loading="lazy" alt="">' : '';
    const age = (Date.now() - msg.createdAt) / 1000;
    const canEdit = S.user && S.user.id === msg.userId && age < 600;
    const canDelete = S.user && (
        S.user.id === msg.userId ||
        group.ownerId === S.user.id ||
        (group.admins || []).indexOf(S.user.id) > -1 ||
        (group.mods || []).indexOf(S.user.id) > -1
    );

    let repliesHtml = '';
    if (msg.replies && msg.replies.length && level < 5) {
        repliesHtml = '<div class="chat-replies">' +
            msg.replies.map(r => renderChatReply(r, group, level + 1, msg.id)).join('') + '</div>';
    }

    const editedTag = msg.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    return '<div class="chat-msg" data-msg-id="' + msg.id + '">' +
        '<div class="user-avatar" data-user-id="' + msg.userId + '">' +
            (avatar ? '<img src="' + avatar + '" alt="">' : initial) +
        '</div>' +
        '<div class="chat-msg-content">' +
            '<div class="chat-msg-head">' +
                '<strong data-user-id="' + msg.userId + '">' + esc(name) + '</strong>' +
                (user ? badgesHtml(user) : '') + roleBadge +
                '<span class="time">' + timeAgo(msg.createdAt) + ' ' + editedTag + '</span>' +
            '</div>' +
            '<div class="chat-msg-body">' + (msg.content || '') + '</div>' + imageHtml +
            '<div class="chat-msg-actions">' +
                '<button class="chat-msg-btn ' + (userLiked ? 'liked' : '') + '" data-msg-like="' + msg.id + '" type="button">' + ICON.thumbUp + ' ' + faNum((msg.likes || []).length) + '</button>' +
                '<button class="chat-msg-btn ' + (userDisliked ? 'disliked' : '') + '" data-msg-dislike="' + msg.id + '" type="button">' + ICON.thumbDown + ' ' + faNum((msg.dislikes || []).length) + '</button>' +
                '<button class="chat-msg-btn" data-msg-reply="' + msg.id + '" type="button">پاسخ</button>' +
                (canEdit ? '<button class="chat-msg-btn" data-msg-edit="' + msg.id + '" type="button">ویرایش</button>' : '') +
                (canDelete ? '<button class="chat-msg-btn" data-msg-del="' + msg.id + '" type="button">حذف</button>' : '') +
            '</div>' + repliesHtml +
        '</div>' +
    '</div>';
}

function renderChatReply(reply, group, level, parentMsgId) {
    const user = getUserById(reply.userId);
    const name = user ? user.displayName : (reply.userName || 'ناشناس');
    const avatar = user ? user.avatar : reply.userAvatar;
    const initial = ini(name);
    const userLiked = S.user && (reply.likes || []).indexOf(S.user.id) > -1;
    const userDisliked = S.user && (reply.dislikes || []).indexOf(S.user.id) > -1;
    const age = (Date.now() - reply.createdAt) / 1000;
    const canEdit = S.user && S.user.id === reply.userId && age < 600;
    const canDelete = S.user && (
        S.user.id === reply.userId ||
        group.ownerId === S.user.id ||
        (group.admins || []).indexOf(S.user.id) > -1 ||
        (group.mods || []).indexOf(S.user.id) > -1
    );

    let nestedHtml = '';
    if (reply.replies && reply.replies.length && level < 5) {
        nestedHtml = '<div class="chat-replies">' +
            reply.replies.map(r => renderChatReply(r, group, level + 1, reply.id)).join('') + '</div>';
    }
    const editedTag = reply.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    return '<div class="chat-reply" data-reply-id="' + reply.id + '" data-parent-id="' + parentMsgId + '">' +
        '<div class="chat-reply-header">' +
            '<div class="user-avatar" data-user-id="' + reply.userId + '">' +
                (avatar ? '<img src="' + avatar + '" alt="">' : initial) +
            '</div>' +
            '<strong data-user-id="' + reply.userId + '">' + esc(name) + '</strong>' +
            (user ? badgesHtml(user) : '') +
            '<span class="time">' + timeAgo(reply.createdAt) + ' ' + editedTag + '</span>' +
        '</div>' +
        '<div class="chat-reply-body">' + (reply.content || '') + '</div>' +
        '<div class="chat-reply-actions">' +
            '<button class="chat-reply-btn ' + (userLiked ? 'liked' : '') + '" data-reply-like="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">' + ICON.thumbUp + ' ' + faNum((reply.likes || []).length) + '</button>' +
            '<button class="chat-reply-btn ' + (userDisliked ? 'disliked' : '') + '" data-reply-dislike="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">' + ICON.thumbDown + '</button>' +
            (level < 5 ? '<button class="chat-reply-btn" data-reply-reply="' + reply.id + '" type="button">پاسخ</button>' : '') +
            (canEdit ? '<button class="chat-reply-btn" data-reply-edit="' + reply.id + '" type="button">ویرایش</button>' : '') +
            (canDelete ? '<button class="chat-reply-btn" data-reply-del="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">حذف</button>' : '') +
        '</div>' + nestedHtml +
    '</div>';
}

function initChat(groupId, group) {
    const editor = $('#chatEditor');
    if (editor) {
        editor.addEventListener('beforeinput', () => {
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            const toRemove = [];
            let n;
            while ((n = walker.nextNode())) {
                if (n.textContent === '\u200B') toRemove.push(n);
            }
            toRemove.forEach(node => {
                if (node.parentNode && document.activeElement === editor) {
                    try { node.parentNode.removeChild(node); } catch (e) {}
                }
            });
        });

        $$('.chat-toolbar button[data-chat-cmd]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', e => {
                e.preventDefault();
                const cmd = btn.dataset.chatCmd;
                if (cmd === 'bold') Ed.bold();
                else if (cmd === 'italic') Ed.italic();
                editor.focus();
            });
        });

        const cs = $('#chatSpoiler');
        if (cs) {
            cs.addEventListener('mousedown', e => e.preventDefault());
            cs.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
        }

        const cc = $('#chatColor');
        if (cc) {
            cc.addEventListener('mousedown', e => e.preventDefault());
            cc.addEventListener('click', e => {
                e.preventDefault();
                const p = $('#chatColorPicker');
                if (p) p.hidden = !p.hidden;
            });
        }

        const customC = $('#chatCustomColor');
        if (customC) {
            customC.addEventListener('mousedown', e => e.preventDefault());
            customC.addEventListener('input', () => Ed.color(customC.value));
        }

        $$('#chatColorPicker .color-dot').forEach(d => {
            d.addEventListener('mousedown', e => e.preventDefault());
            d.addEventListener('click', e => {
                e.preventDefault();
                Ed.color(d.dataset.color);
                const p = $('#chatColorPicker');
                if (p) p.hidden = true;
                editor.focus();
            });
        });

        const rb = $('#chatRainbow');
        if (rb) {
            rb.addEventListener('mousedown', e => e.preventDefault());
            rb.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
        }

        const ci = $('#chatImage');
        if (ci) ci.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = async () => {
                try {
                    const url = await uploadImage(inp.files[0]);
                    sendChatMessage(groupId, null, url);
                } catch (err) { toast(err.message || String(err)); }
            };
            inp.click();
        });

        const csend = $('#chatSend');
        if (csend) csend.addEventListener('click', () => {
            const content = editor.innerHTML.trim();
            if (!content || editor.textContent.trim().length < 1) return;
            sendChatMessage(groupId, content);
        });

        editor.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const b = $('#chatSend');
                if (b) b.click();
            }
        });
    }

    const chatBox = $('#chatMessages');
    if (chatBox) {
        /* با flag از دوباره‌bind شدن جلوگیری می‌کنیم */
        chatBox.addEventListener('click', e => {
            const userTrigger = e.target.closest('[data-user-id]');
            if (userTrigger && !e.target.closest('button')) {
                const uidAttr = userTrigger.dataset.userId;
                if (uidAttr) { showPage('profile', uidAttr); return; }
            }

            const like = e.target.closest('[data-msg-like]');
            const dislike = e.target.closest('[data-msg-dislike]');
            const reply = e.target.closest('[data-msg-reply]');
            const editMsg = e.target.closest('[data-msg-edit]');
            const del = e.target.closest('[data-msg-del]');
            const rLike = e.target.closest('[data-reply-like]');
            const rDislike = e.target.closest('[data-reply-dislike]');
            const rReply = e.target.closest('[data-reply-reply]');
            const rEdit = e.target.closest('[data-reply-edit]');
            const rDel = e.target.closest('[data-reply-del]');

            if (like) toggleMsgReaction(groupId, like.dataset.msgLike, 'like');
            if (dislike) toggleMsgReaction(groupId, dislike.dataset.msgDislike, 'dislike');
            if (reply) openReplyModal({ mode: 'reply-message', groupId, messageId: reply.dataset.msgReply });
            if (editMsg) openReplyModal({ mode: 'edit-message', groupId, messageId: editMsg.dataset.msgEdit });
            if (del && confirm('حذف بشه؟')) deleteMessage(groupId, del.dataset.msgDel);
            if (rLike) toggleReplyReaction(groupId, rLike.dataset.parent, rLike.dataset.replyLike, 'like');
            if (rDislike) toggleReplyReaction(groupId, rDislike.dataset.parent, rDislike.dataset.replyDislike, 'dislike');
            if (rReply) openReplyModal({ mode: 'reply-reply', groupId, replyId: rReply.dataset.replyReply });
            if (rEdit) openReplyModal({ mode: 'edit-reply', groupId, replyId: rEdit.dataset.replyEdit });
            if (rDel && confirm('حذف بشه؟')) deleteReply(groupId, rDel.dataset.replyDel);
        });
    }
}

async function sendChatMessage(groupId, content, image) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    if (S._chatBusy) return false;
    S._chatBusy = true;
    try {
        const ok = await act(() => API.post('/api/groups/' + groupId + '/messages', { content: content || '', image: image || null }), ['groups', 'activity']);
        if (ok) { await loadGroupMessages(groupId); renderGroupPage(groupId); }
        return !!ok;
    } finally { S._chatBusy = false; }
}

/* اجرای یک عملیات روی گروه و تازه‌سازی صفحه */
async function groupAct(groupId, fn, parts) {
    const ok = await act(fn, parts || ['groups']);
    await loadGroupMessages(groupId);
    if (S.page === 'group' && S.pageData === groupId) renderGroupPage(groupId);
    return !!ok;
}

function toggleMsgReaction(groupId, msgId, type) {
    if (!S.user) { toast('اول وارد شو'); return Promise.resolve(false); }
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + msgId + '/react', { type }));
}

function toggleReplyReaction(groupId, parentId, replyId, type) {
    return toggleMsgReaction(groupId, replyId, type);
}

function addReplyToMessage(groupId, msgId, html) {
    if (!S.user) return Promise.resolve(false);
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + msgId + '/replies', { content: html }));
}

/* FIX: از replyId تنها استفاده کن — دیگر به data-parent وابسته نباش */
function addReplyToReply(groupId, replyId, html) {
    if (!S.user) return Promise.resolve(false);
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + replyId + '/replies', { content: html }));
}

function updateMessageContent(groupId, msgId, html) {
    return groupAct(groupId, () => API.patch('/api/groups/' + groupId + '/items/' + msgId, { content: html }));
}

/* FIX: از replyId تنها استفاده کن */
function updateReplyContent(groupId, replyId, html) {
    return updateMessageContent(groupId, replyId, html);
}

async function deleteMessage(groupId, msgId) {
    const ok = await groupAct(groupId, () => API.del('/api/groups/' + groupId + '/items/' + msgId));
    if (ok) toast('حذف شد');
    return ok;
}

function deleteReply(groupId, replyId) { return deleteMessage(groupId, replyId); }

async function joinGroup(groupId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await groupAct(groupId, () => API.post('/api/groups/' + groupId + '/join'), ['groups', 'users']);
    if (ok) toast('عضو شدی');
}

async function leaveGroup(groupId) {
    if (!S.user) return;
    if (!confirm('از گروه خارج بشی؟')) return;
    const ok = await act(() => API.post('/api/groups/' + groupId + '/leave'), ['groups', 'users']);
    if (ok) { toast('از گروه خارج شدی'); showPage('groups'); }
}

async function requestJoinGroup(groupId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await groupAct(groupId, () => API.post('/api/groups/' + groupId + '/request'));
    if (ok) toast('درخواستت ارسال شد');
}

function openGroupSettings(groupId) {
    if (!S.user) return;
    const g = DB.getGroups().find(x => x.id === groupId);
    if (!g) return;
    const isOwner = g.ownerId === S.user.id;
    const isAdmin = (g.admins || []).indexOf(S.user.id) > -1;
    const isMod = (g.mods || []).indexOf(S.user.id) > -1;
    const isSiteAdmin = S.user.role === 'admin';
    if (!isOwner && !isAdmin && !isMod && !isSiteAdmin) { toast('دسترسی نداری'); return; }

    const box = $('#groupSettingsBody');
    if (!box) return;

    const users = DB.getUsers();
    const membersHtml = (g.members || []).map(mid => {
        const u = users.find(x => x.id === mid);
        if (!u) return '';
        const isOwnerM = g.ownerId === mid;
        const isAdminM = (g.admins || []).indexOf(mid) > -1;
        const isModM = (g.mods || []).indexOf(mid) > -1;
        let roleLabel = '';
        if (isOwnerM) roleLabel = '<span class="role-badge owner">مدیر</span>';
        else if (isAdminM) roleLabel = '<span class="role-badge admin">ادمین</span>';
        else if (isModM) roleLabel = '<span class="role-badge mod">ناظر</span>';
        let btns = '';
        if (!isOwnerM && (isOwner || isAdmin || isSiteAdmin)) {
            if (isOwner || isSiteAdmin) btns += '<button class="btn-ghost small" data-promote-admin="' + mid + '" data-on="' + (isAdminM ? 1 : 0) + '" type="button">' + (isAdminM ? 'عزل ادمین' : 'ادمین') + '</button>';
            btns += '<button class="btn-ghost small" data-promote-mod="' + mid + '" data-on="' + (isModM ? 1 : 0) + '" type="button">' + (isModM ? 'عزل ناظر' : 'ناظر') + '</button>';
            btns += '<button class="btn-ghost small danger" data-ban-member="' + mid + '" type="button">بن</button>';
        }
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bd);gap:10px;flex-wrap:wrap;">' +
            '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
                '<div class="user-avatar" style="width:32px;height:32px;font-size:12px;">' +
                    (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                '</div>' +
                '<div style="min-width:0;">' +
                    '<strong style="font-size:13px;">' + esc(u.displayName) + '</strong> ' + roleLabel +
                    '<div style="font-size:11px;color:var(--tx-mute);direction:ltr;">@' + esc(u.username) + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + btns + '</div>' +
        '</div>';
    }).join('');

    let requestsHtml = '';
    if ((g.joinRequests || []).length) {
        requestsHtml = '<h4 style="font-size:14px;font-weight:800;margin:16px 0 10px;">درخواست‌های عضویت</h4>' +
            g.joinRequests.map(mid => {
                const u = users.find(x => x.id === mid);
                if (!u) return '';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">' +
                    '<strong>' + esc(u.displayName) + '</strong>' +
                    '<div style="display:flex;gap:4px;">' +
                        '<button class="btn-primary small" data-accept-join="' + mid + '" type="button">قبول</button>' +
                        '<button class="btn-ghost small" data-reject-join="' + mid + '" type="button">رد</button>' +
                    '</div>' +
                '</div>';
            }).join('');
    }

    let bannedHtml = '';
    if ((g.banned || []).length && (isOwner || isAdmin || isSiteAdmin)) {
        bannedHtml = '<h4 style="font-size:14px;font-weight:800;margin:16px 0 10px;">بن‌شده‌ها</h4>' +
            g.banned.map(mid => {
                const u = users.find(x => x.id === mid);
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">' +
                    '<strong>' + esc(u ? u.displayName : 'کاربر') + '</strong>' +
                    '<button class="btn-ghost small" data-unban="' + mid + '" type="button">رفع بن</button></div>';
            }).join('');
    }

    let siteAdminControls = '';
    if (isSiteAdmin) {
        siteAdminControls = '<div style="padding:14px;border-radius:14px;background:rgba(201,99,93,.06);border:1px solid rgba(201,99,93,.2);margin-bottom:14px;">' +
            '<h4 style="font-size:13px;font-weight:800;margin-bottom:10px;color:var(--bad);">کنترل مدیر سایت</h4>' +
            '<button class="btn-ghost small danger full" id="deleteGroupBtn" type="button">حذف کامل گروه</button>' +
        '</div>';
    }

    box.innerHTML = siteAdminControls +
        '<div style="text-align:center;margin-bottom:16px;">' +
            '<div class="group-card-avatar" style="margin:0 auto 10px;">' +
                (g.avatar ? '<img src="' + g.avatar + '" alt="">' : ini(g.name, 'G')) +
            '</div>' +
            '<button class="btn-ghost small" id="changeGroupAvatar" type="button">تغییر آواتار</button>' +
            '<input type="file" id="groupAvatarFile" accept="image/*" hidden>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:14px;">' +
            '<label>اسم گروه</label>' +
            '<input type="text" id="gName" value="' + esc(g.name) + '">' +
        '</div>' +
        '<div class="form-group" style="margin-bottom:14px;">' +
            '<label>توضیحات</label>' +
            '<textarea id="gDesc">' + esc(g.description || '') + '</textarea>' +
        '</div>' +
        '<button class="btn-primary full" id="gSave" type="button" style="margin-bottom:20px;">ذخیره تغییرات</button>' +
        '<h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">اعضا (' + faNum(g.memberCount) + ')</h4>' +
        '<div style="max-height:300px;overflow-y:auto;">' + membersHtml + '</div>' +
        requestsHtml + bannedHtml;

    openModal('groupSettingsOverlay');

    const refreshSettings = async () => {
        await sync(['groups', 'users']);
        await loadGroupMessages(groupId);
        if (S.page === 'group' && S.pageData === groupId) renderGroupPage(groupId);
        openGroupSettings(groupId);
    };

    const changeAv = $('#changeGroupAvatar');
    const fileInp = $('#groupAvatarFile');
    if (changeAv && fileInp) {
        changeAv.addEventListener('click', () => fileInp.click());
        fileInp.addEventListener('change', async e => {
            try {
                const url = await uploadImage(e.target.files[0]);
                const ok = await groupAct(groupId, () => API.patch('/api/groups/' + groupId, { avatar: url }), ['groups']);
                if (ok) { closeModal('groupSettingsOverlay'); toast('آواتار تغییر کرد'); }
            } catch (err) { toast(err.message || String(err)); }
        });
    }

    const saveBtn = $('#gSave');
    if (saveBtn) saveBtn.addEventListener('click', async () => {
        const newName = $('#gName').value.trim();
        if (!newName) { toast('اسم گروه لازمه'); return; }
        const ok = await groupAct(groupId, () => API.patch('/api/groups/' + groupId, { name: newName, description: $('#gDesc').value.trim() }), ['groups']);
        if (ok) { toast('ذخیره شد'); closeModal('groupSettingsOverlay'); }
    });

    const delGroup = $('#deleteGroupBtn');
    if (delGroup) delGroup.addEventListener('click', async () => {
        if (!confirm('گروه به طور کامل حذف بشه؟')) return;
        const ok = await act(() => API.del('/api/groups/' + groupId), ['groups', 'users']);
        if (ok) { toast('گروه حذف شد'); closeModal('groupSettingsOverlay'); showPage('groups'); }
    });

    /* فقط یک شنونده (باگ نسخه‌ی قبل: با هر باز شدن یکی اضافه می‌شد) */
    if (box._h) box.removeEventListener('click', box._h);
    box._h = async e => {
        const pa = e.target.closest('[data-promote-admin]');
        const pm = e.target.closest('[data-promote-mod]');
        const ban = e.target.closest('[data-ban-member]');
        const unban = e.target.closest('[data-unban]');
        const acc = e.target.closest('[data-accept-join]');
        const rej = e.target.closest('[data-reject-join]');
        let uidv = null, action = null, msg = '';
        if (pa) { uidv = pa.dataset.promoteAdmin; action = pa.dataset.on === '1' ? 'unadmin' : 'admin'; msg = action === 'admin' ? 'ادمین شد' : 'عزل شد'; }
        else if (pm) { uidv = pm.dataset.promoteMod; action = pm.dataset.on === '1' ? 'unmod' : 'mod'; msg = action === 'mod' ? 'ناظر شد' : 'عزل شد'; }
        else if (ban) { if (!confirm('بن بشه؟')) return; uidv = ban.dataset.banMember; action = 'ban'; msg = 'بن شد'; }
        else if (unban) { uidv = unban.dataset.unban; action = 'unban'; msg = 'رفع بن شد'; }
        else if (acc) { uidv = acc.dataset.acceptJoin; action = 'accept'; msg = 'قبول شد'; }
        else if (rej) { uidv = rej.dataset.rejectJoin; action = 'reject'; msg = 'رد شد'; }
        if (!action) return;
        const ok = await act(() => API.post('/api/groups/' + groupId + '/members/' + uidv, { action }), ['groups', 'users']);
        if (ok) { toast(msg); await refreshSettings(); }
    };
    box.addEventListener('click', box._h);
}

/* ══════════════════════════════════════════════════════════════
   ۱۵. PM — با تب‌های دریافت/ارسال/گروهی
   ══════════════════════════════════════════════════════════════ */
function renderPMPage() {
    const layout = $('#pmLayout');
    if (!layout) return;

    /* تب‌ها — bind (یک‌بار) */
    const tabs = $$('#pmTabs .pm-tab');
    tabs.forEach(tab => {
        if (tab._bound) return;
        tab._bound = true;
        tab.addEventListener('click', () => {
            S.pmTab = tab.dataset.pmTab;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            renderPMChatList();
            /* در تب گروهی، view رو reset کن */
            if (S.pmTab === 'groups') {
                S.pmActiveUser = null;
                const view = $('#pmView');
                if (view) {
                    view.innerHTML = '<div class="pm-empty"><div class="pm-empty-inner">' +
                        '<p>پیام‌های گروهی به‌زودی...</p>' +
                        '<p style="font-size:12px;margin-top:8px;opacity:.7;">فعلاً از بخش «گروه‌ها» استفاده کن</p>' +
                    '</div></div>';
                }
                const l = $('#pmLayout');
                if (l) l.classList.remove('viewing');
            }
        });
    });

    if (!S.user) {
        const sidebar = $('.pm-sidebar');
        const view = $('#pmView');
        if (sidebar) sidebar.innerHTML = '<div class="pm-empty"><div class="pm-empty-inner"><p>برای دیدن پیام‌ها وارد شو</p></div></div>';
        if (view) view.innerHTML = '<div class="pm-empty"><div class="pm-empty-inner"><p>🔐</p></div></div>';
        return;
    }

    renderPMChatList();
    if (S.pmActiveUser) renderPMConversation(S.pmActiveUser);
}

function renderPMChatList() {
    const list = $('#pmChatList');
    if (!list) return;

    if (S.pmTab === 'groups') {
        list.innerHTML = '<div class="pm-empty-state">' +
            'پیام‌های گروهی<br>' +
            '<span style="font-size:11px;opacity:.7;">به‌زودی اینجا نمایش داده می‌شود</span>' +
        '</div>';
        return;
    }

    const users = DB.getUsers();
    const myId = S.user.id;
    const allMessages = DB.getPM();
    const conversations = new Map();

    if (S.pmTab === 'received') {
        /* فقط کاربرانی که به من پیام دادند */
        allMessages.forEach(m => {
            if (m.to === myId && m.from !== myId && m.from !== 'system') {
                if (!conversations.has(m.from)) conversations.set(m.from, { userId: m.from, messages: [] });
                conversations.get(m.from).messages.push(m);
            }
        });
    } else if (S.pmTab === 'sent') {
        /* کاربرانی که من به آن‌ها پیام دادم */
        allMessages.forEach(m => {
            if (m.from === myId && m.to !== myId && m.to !== 'system') {
                if (!conversations.has(m.to)) conversations.set(m.to, { userId: m.to, messages: [] });
                conversations.get(m.to).messages.push(m);
            }
        });
    }

    const arr = Array.from(conversations.values()).map(c => {
        const last = c.messages.length ? c.messages[c.messages.length - 1] : null;
        const unread = c.messages.filter(m => m.to === myId && !m.read).length;
        return { ...c, last, unread, other: users.find(u => u.id === c.userId) };
    }).sort((a, b) => {
        const ta = a.last ? a.last.ts : 0;
        const tb = b.last ? b.last.ts : 0;
        if (a.unread && !b.unread) return -1;
        if (!a.unread && b.unread) return 1;
        return tb - ta;
    });

    if (!arr.length) {
        list.innerHTML = '<div class="pm-empty-state">' +
            (S.pmTab === 'received' ? 'هیچ پیام دریافتی‌ای نداری' : 'هنوز به کسی پیام ندادی') +
        '</div>';
        return;
    }

    list.innerHTML = arr.map(c => {
        if (!c.other) return '';
        const u = c.other;
        const init = ini(u.displayName, 'U');
        const preview = c.last
            ? (c.last.from === myId ? 'شما: ' : '') + stripHtml(c.last.text || '').slice(0, 35)
            : 'گفت‌وگو رو شروع کن';
        const isActive = S.pmActiveUser === u.id;
        return '<div class="pm-chat-item ' + (isActive ? 'active' : '') + '" data-pm-user="' + u.id + '">' +
            '<div class="user-avatar">' + (u.avatar ? '<img src="' + u.avatar + '" alt="">' : init) + '</div>' +
            '<div class="pm-chat-item-info">' +
                '<strong>' + esc(u.displayName) + badgesHtml(u) + '</strong>' +
                '<p>' + esc(preview) + '</p>' +
            '</div>' +
            '<div class="pm-chat-item-meta">' +
                (c.last ? '<span class="time">' + timeAgo(c.last.ts) + '</span>' : '') +
                (c.unread ? '<span class="unread">' + faNum(c.unread) + '</span>' : '') +
            '</div>' +
        '</div>';
    }).join('');

    list.querySelectorAll('[data-pm-user]').forEach(el => {
        el.addEventListener('click', () => {
            S.pmActiveUser = el.dataset.pmUser;
            const layout = $('#pmLayout');
            if (layout) layout.classList.add('viewing');
            updateBadges();
            renderPMChatList();
            renderPMConversation(S.pmActiveUser);
            markActivePMRead();
        });
    });
}

function renderPMConversation(userId) {
    const view = $('#pmView');
    if (!view) return;
    if (!userId) return;
    const user = getUserById(userId);
    if (!user) { view.innerHTML = ''; return; }
    const myId = S.user.id;
    const msgs = DB.getPM().filter(m =>
        (m.from === myId && m.to === userId) ||
        (m.from === userId && m.to === myId)
    ).filter(m => !m.deleted);

    const init = ini(user.displayName, 'U');

    let messagesHtml = '';
    let lastDate = null;
    const dayMs = 86400000;
    msgs.forEach(m => {
        const d = new Date(m.ts);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (lastDate !== dayStart) {
            lastDate = dayStart;
            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const yesterdayStart = todayStart - dayMs;
            let dateLabel = '';
            if (dayStart === todayStart) dateLabel = 'امروز';
            else if (dayStart === yesterdayStart) dateLabel = 'دیروز';
            else {
                try { dateLabel = new Date(dayStart).toLocaleDateString('fa-IR'); }
                catch (e) { dateLabel = ''; }
            }
            messagesHtml += '<div class="pm-msg-date-sep">' + dateLabel + '</div>';
        }
        messagesHtml += renderPMBubble(m, myId, user);
    });

    if (!msgs.length) {
        messagesHtml = '<div class="pm-empty" style="flex:1;"><div class="pm-empty-inner">' +
            '<p>هنوز پیامی رد و بدل نشده</p>' +
            '<p style="font-size:12px;margin-top:8px;opacity:.7;">اولین پیام رو بفرست 👇</p>' +
        '</div></div>';
    }

    view.innerHTML =
        '<div class="pm-view-header">' +
            '<button class="pm-back-btn" id="pmBackBtn" type="button" aria-label="بازگشت">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                    '<path d="M19 12H5M12 19l-7-7 7-7"/>' +
                '</svg>' +
            '</button>' +
            '<div class="user-avatar" style="cursor:pointer;" data-user-id="' + user.id + '">' +
                (user.avatar ? '<img src="' + user.avatar + '" alt="">' : init) +
            '</div>' +
            '<div class="pm-view-header-info">' +
                '<strong>' + esc(user.displayName) + badgesHtml(user) + '</strong>' +
                '<small>@' + esc(user.username) + '</small>' +
            '</div>' +
            '<div class="pm-view-header-actions">' +
                '<button class="icon-btn" data-user-id="' + user.id + '" aria-label="پروفایل">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                        '<circle cx="12" cy="12" r="10"/>' +
                        '<path d="M12 16v-4M12 8h.01"/>' +
                    '</svg>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<div class="pm-messages" id="pmMessages">' + messagesHtml + '</div>' +
        '<div class="pm-input-area">' +
            '<div class="pm-input-row">' +
                '<div class="pm-input" id="pmInput" contenteditable="true" data-placeholder="پیام..."></div>' +
                '<div class="pm-input-actions">' +
                    '<button class="pm-input-btn send" id="pmSendBtn" type="button" aria-label="ارسال">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                            '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>' +
                        '</svg>' +
                    '</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    const backBtn = $('#pmBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => {
        const l = $('#pmLayout');
        if (l) l.classList.remove('viewing');
        S.pmActiveUser = null;
        renderPMChatList();
        renderPMConversation(null);
    });

    view.querySelectorAll('[data-user-id]').forEach(el => {
        el.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            showPage('profile', el.dataset.userId);
        });
    });

    const input = $('#pmInput');
    const sendBtn = $('#pmSendBtn');
    if (sendBtn) sendBtn.addEventListener('click', () => {
        const html = input ? input.innerHTML.trim() : '';
        if (!html || !input.textContent.trim()) return;
        sendPM(user.id, html);
        input.innerHTML = '';
    });
    if (input) {
        /* ZWSP cleanup */
        input.addEventListener('beforeinput', () => {
            const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
            const toRemove = [];
            let n;
            while ((n = walker.nextNode())) {
                if (n.textContent === '\u200B') toRemove.push(n);
            }
            toRemove.forEach(node => {
                if (node.parentNode && document.activeElement === input) {
                    try { node.parentNode.removeChild(node); } catch (e) {}
                }
            });
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendBtn.click();
            }
        });
    }

    view.querySelectorAll('[data-pm-del]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            if (!confirm('این پیام حذف بشه؟')) return;
            act(() => API.del('/api/pm/' + btn.dataset.pmDel), ['private']).then(() => renderPMConversation(user.id));
        });
    });

    view.querySelectorAll('[data-pm-copy]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const pms = DB.getPM();
            const p = pms.find(m => m.id === btn.dataset.pmCopy);
            if (p && p.text) {
                const tmp = document.createElement('div');
                tmp.innerHTML = p.text;
                const txt = tmp.textContent || '';
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(txt).then(() => toast('کپی شد'), () => toast('کپی نشد'));
                } else { toast('کپی نشد'); }
            }
        });
    });

    setTimeout(() => {
        const box = $('#pmMessages');
        if (box) box.scrollTop = box.scrollHeight;
    }, 60);
}

function renderPMBubble(msg, myId, otherUser) {
    const isMine = msg.from === myId;
    const time = new Date(msg.ts);
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const timeStr = faNum(hh + ':' + mm);

    const editedTag = msg.edited ? ' <span style="opacity:.6;">(ویرایش)</span>' : '';

    const delBtn = isMine
        ? '<button data-pm-del="' + msg.id + '" title="حذف">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
                  '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
              '</svg>' +
          '</button>'
        : '';

    const copyBtn = '<button data-pm-copy="' + msg.id + '" title="کپی">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
        '</svg>' +
    '</button>';

    const ticks = isMine
        ? '<span class="pm-msg-tick" title="خوانده شد">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
                  '<path d="M1 13l4 4L14 8"/>' +
                  '<path d="M9 13l4 4L22 8"/>' +
              '</svg>' +
          '</span>'
        : '';

    return '<div class="pm-msg ' + (isMine ? 'own' : 'other') + '" data-msg-id="' + msg.id + '">' +
        '<div class="pm-msg-actions">' + copyBtn + delBtn + '</div>' +
        '<div class="pm-msg-body">' + (msg.text || '') + '</div>' +
        '<div class="pm-msg-footer">' + ticks + '<span class="time">' + timeStr + '</span>' + editedTag + '</div>' +
    '</div>';
}

async function sendPM(toId, html) {
    if (!S.user || toId === S.user.id) return false;
    if (S._pmBusy) return false;
    S._pmBusy = true;
    try {
        const ok = await act(() => API.post('/api/pm', { to: toId, text: html }), ['private']);
        if (ok) { updateBadges(); renderPMChatList(); renderPMConversation(toId); }
        return !!ok;
    } finally { S._pmBusy = false; }
}

/* ══════════════════════════════════════════════════════════════
   ۱۶. Users Page
   ══════════════════════════════════════════════════════════════ */
function renderUsersPage() {
    const grid = $('#usersGrid');
    if (!grid) return;
    const users = DB.getUsers();
    grid.innerHTML = '';
    users.forEach(u => {
        if (S.user && hasBlockedMe(S.user.id, u.id)) return;
        const card = document.createElement('div');
        card.className = 'user-card';
        const coverHtml = u.cover
            ? '<div class="user-card-cover"><img src="' + u.cover + '" alt="" loading="lazy"></div>'
            : '<div class="user-card-cover"></div>';
        card.innerHTML = coverHtml +
            '<div class="user-avatar">' +
                (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
            '</div>' +
            '<h3>' + esc(u.displayName) + badgesHtml(u) + '</h3>' +
            '<p>@' + esc(u.username) + '</p>';
        card.addEventListener('click', () => showPage('profile', u.id));
        grid.appendChild(card);
    });
}

/* ══════════════════════════════════════════════════════════════
   ۱۷. Profile
   ══════════════════════════════════════════════════════════════ */
function renderProfilePage(userId) {
    const box = $('#userProfileContent');
    if (!box) return;
    const u = getUserById(userId);
    if (!u) { box.innerHTML = '<div class="empty-state"><h3>کاربر پیدا نشد</h3></div>'; return; }

    if (S.user && S.user.id !== userId && hasBlockedMe(S.user.id, userId)) {
        box.innerHTML = '<div class="profile-blocked-message"><h3>کاربر بلاکت کرده</h3><p>نمی‌تونی پروفایلش رو ببینی</p></div>';
        return;
    }

    const isMe = S.user && S.user.id === userId;
    const isFriend = S.user && (S.user.friends || []).indexOf(userId) > -1;
    const hasPending = S.user && (S.user.sentRequests || []).indexOf(userId) > -1;
    const hasIncoming = S.user && (S.user.friendRequests || []).indexOf(userId) > -1;
    const iBlocked = S.user && isBlocked(S.user.id, userId);

    const coverHtml = u.cover
        ? '<div class="profile-cover"><img src="' + u.cover + '" alt="" loading="lazy"></div>'
        : '<div class="profile-cover"></div>';

    let actionsHtml = '';
    if (!isMe && S.user) {
        let friendBtn = '';
        if (isFriend) friendBtn = '<button class="btn-ghost small" data-action="unfriend" type="button">لغو دوستی</button>';
        else if (hasIncoming) friendBtn = '<button class="btn-primary small" data-action="accept-friend" type="button">قبول درخواست دوستی</button>';
        else if (hasPending) friendBtn = '<button class="btn-ghost small" disabled type="button">درخواست ارسال شد</button>';
        else friendBtn = '<button class="btn-primary small" data-action="add-friend" type="button">درخواست دوستی</button>';
        const blockBtn = iBlocked
            ? '<button class="btn-ghost small" data-action="unblock" type="button">رفع بلاک</button>'
            : '<button class="btn-ghost small danger" data-action="block" type="button">بلاک کردن</button>';
        actionsHtml = '<div class="profile-actions">' + friendBtn +
            '<button class="btn-ghost small" data-action="private-msg" type="button">پیام خصوصی</button>' +
            blockBtn + '</div>';
    } else if (isMe) {
        actionsHtml = '<div class="profile-actions"><button class="btn-primary small" id="editMyProfileBtn" type="button">ویرایش پروفایل</button></div>';
    }

    const posts = DB.getPosts().filter(p => p.authorId === userId);
    const commentsCount = DB.getPosts().reduce((sum, p) =>
        sum + (p.comments || []).filter(c => c.userId === userId).length, 0);
    const platformLabel = { ps5: 'PlayStation 5', xbox: 'Xbox', switch: 'Nintendo Switch', pc: 'PC', mobile: 'موبایل' }[u.platform] || 'PC';

    box.innerHTML = coverHtml +
        '<div class="profile-header">' +
            '<div class="profile-avatar">' +
                (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
            '</div>' +
            '<div class="profile-info">' +
                '<h1>' + esc(u.displayName) + badgesHtml(u) + '</h1>' +
                '<div class="username">@' + esc(u.username) + '</div>' +
                (u.title ? '<div class="title">' + esc(u.title) + '</div>' : '') +
            '</div>' + actionsHtml +
        '</div>' +
        '<div class="profile-stats">' +
            '<div class="profile-stat"><strong>' + faNum(u.xp || 0) + '</strong><span>امتیاز</span></div>' +
            '<div class="profile-stat"><strong>' + faNum(posts.length) + '</strong><span>پست</span></div>' +
            '<div class="profile-stat"><strong>' + faNum(commentsCount) + '</strong><span>نظر</span></div>' +
            '<div class="profile-stat"><strong>' + faNum(u.friendsCount != null ? u.friendsCount : (u.friends || []).length) + '</strong><span>دوست</span></div>' +
        '</div>' +
        (u.bio ? '<div class="profile-bio"><h3>درباره من</h3><p>' + esc(u.bio) + '</p></div>' : '') +
        '<div class="profile-bio"><h3>اطلاعات</h3>' +
            '<div class="profile-details-grid">' +
                '<div class="profile-detail-item"><div class="label">پلتفرم</div><div class="value">' + platformLabel + '</div></div>' +
                (u.birthday ? '<div class="profile-detail-item"><div class="label">تاریخ تولد</div><div class="value">' + esc(u.birthday) + '</div></div>' : '') +
                (u.website ? '<div class="profile-detail-item"><div class="label">وبسایت</div><div class="value" style="direction:ltr;">' + esc(u.website) + '</div></div>' : '') +
                (u.favGames ? '<div class="profile-detail-item"><div class="label">بازی‌های مورد علاقه</div><div class="value">' + esc(u.favGames) + '</div></div>' : '') +
                (u.favMovies ? '<div class="profile-detail-item"><div class="label">فیلم‌های مورد علاقه</div><div class="value">' + esc(u.favMovies) + '</div></div>' : '') +
                (u.instagram ? '<div class="profile-detail-item"><div class="label">اینستاگرام</div><div class="value" style="direction:ltr;">' + esc(u.instagram) + '</div></div>' : '') +
                (u.telegram ? '<div class="profile-detail-item"><div class="label">تلگرام</div><div class="value" style="direction:ltr;">' + esc(u.telegram) + '</div></div>' : '') +
                (u.discord ? '<div class="profile-detail-item"><div class="label">دیسکورد</div><div class="value" style="direction:ltr;">' + esc(u.discord) + '</div></div>' : '') +
            '</div>' +
        '</div>';

    box.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const what = btn.dataset.action;
            const again = () => { if (S.page === 'profile' && S.pageData === userId) renderProfilePage(userId); };
            if (what === 'add-friend') { await sendFriendRequest(userId); again(); }
            if (what === 'accept-friend') { await acceptFriend(userId); again(); }
            if (what === 'unfriend') { await unfriend(userId); again(); }
            if (what === 'block') { if (confirm('بلاک بشه؟')) { await blockUser(userId); again(); } }
            if (what === 'unblock') { await unblockUser(userId); again(); }
            if (what === 'private-msg') {
                S.pmActiveUser = userId;
                showPage('pm');
                const layout = $('#pmLayout');
                if (layout) layout.classList.add('viewing');
            }
        });
    });

    const editMe = $('#editMyProfileBtn');
    if (editMe) editMe.addEventListener('click', () => openUserPanel('profile'));
}

async function unfriend(userId) {
    if (!S.user) return false;
    const ok = await act(() => API.del('/api/friends/' + userId), ['users']);
    if (ok) { updateBadges(); toast('لغو دوستی شد'); }
    return !!ok;
}

async function sendFriendRequest(targetId) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    if (targetId === S.user.id) return false;
    const r = await act(() => API.post('/api/users/' + targetId + '/friend-request'), ['users', 'private']);
    if (r) toast(r.accepted ? 'حالا دوستید' : 'درخواست فرستاده شد');
    return !!r;
}

/* ══════════════════════════════════════════════════════════════
   ۱۸. User Panel
   ══════════════════════════════════════════════════════════════ */
function openUserPanel(tab) {
    if (!S.user) { openModal('authOverlay'); return; }
    const panel = $('#userPanel');
    if (!panel) return;
    const defaultTab = tab || 'activity';
    $$('.up-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === defaultTab));
    renderUserPanelBody(defaultTab);
    panel.classList.add('on');
    document.body.classList.add('locked');
}

function closeUserPanel() {
    const panel = $('#userPanel');
    if (panel) panel.classList.remove('on');
    if (!document.querySelector('.modal-overlay.on') &&
        !document.querySelector('.side-modal:not([hidden])') &&
        !document.querySelector('.reply-modal-overlay.on')) {
        document.body.classList.remove('locked');
    }
}

function renderUserPanelBody(tab) {
    const body = $('#userPanelBody');
    if (!body || !S.user) return;
    if (tab === 'activity') body.innerHTML = renderActivityTab();
    else if (tab === 'profile') body.innerHTML = renderProfileTab();
    else if (tab === 'notifications') body.innerHTML = renderNotifsTab();
    else if (tab === 'messages') body.innerHTML = renderMessagesTab();
    else if (tab === 'friends') body.innerHTML = renderFriendsTab();
    else if (tab === 'groups') body.innerHTML = renderGroupsTab();
    else if (tab === 'blocked') body.innerHTML = renderBlockedTab();
    initUserPanelEvents(tab);
}

function renderActivityTab() {
    const u = S.user;
    const posts = DB.getPosts().filter(p => p.authorId === u.id);
    let cc = 0;
    DB.getPosts().forEach(p => (p.comments || []).forEach(c => { if (c.userId === u.id) cc++; }));
    let roleLabel = 'کاربر عادی';
    if (u.role === 'admin') roleLabel = 'مدیر سایت';
    else if (u.role === 'editor') roleLabel = 'سردبیر';
    else if (u.role === 'author') roleLabel = 'نویسنده';
    return '<div class="up-content active">' +
        '<div class="panel-stats-grid">' +
            '<div class="panel-stat-box"><strong>' + faNum(u.xp || 0) + '</strong><span>امتیاز</span></div>' +
            '<div class="panel-stat-box"><strong>' + faNum(u.level || 1) + '</strong><span>سطح</span></div>' +
            '<div class="panel-stat-box"><strong>' + faNum(posts.length) + '</strong><span>پست</span></div>' +
            '<div class="panel-stat-box"><strong>' + faNum(cc) + '</strong><span>نظر</span></div>' +
            '<div class="panel-stat-box"><strong>' + faNum(u.friendsCount != null ? u.friendsCount : (u.friends || []).length) + '</strong><span>دوست</span></div>' +
            '<div class="panel-stat-box"><strong>' + faNum((u.groups || []).length) + '</strong><span>گروه</span></div>' +
        '</div>' +
        '<div style="padding:14px;border-radius:14px;background:var(--field);border:1px solid var(--bd);">' +
            '<div style="font-size:12px;color:var(--tx-mute);margin-bottom:6px;">وضعیت حساب</div>' +
            '<div style="font-size:14px;font-weight:700;">' + roleLabel + '</div>' +
        '</div>' +
        '<button class="btn-ghost full" id="logoutBtn" type="button" style="margin-top:16px;color:var(--bad);border-color:var(--bad);">خروج از حساب</button>' +
    '</div>';
}

function renderProfileTab() {
    const u = S.user;
    const initial = ini(u.displayName, 'U');
    return '<div class="up-content active"><div class="profile-form">' +
        '<div class="profile-cover-section">' +
            '<div class="profile-cover-preview">' + (u.cover ? '<img src="' + u.cover + '" alt="">' : '') + '</div>' +
            '<button class="btn-ghost small" id="changeCoverBtn" type="button">تغییر کاور</button>' +
            '<input type="file" id="coverFile" accept="image/*" hidden>' +
        '</div>' +
        '<div class="profile-avatar-section">' +
            '<div class="user-avatar">' + (u.avatar ? '<img src="' + u.avatar + '" alt="">' : initial) + '</div>' +
            '<button class="btn-ghost small" id="changeAvatarBtn" type="button">تغییر آواتار</button>' +
            '<input type="file" id="avatarFile" accept="image/*" hidden>' +
        '</div>' +
        '<div class="form-group"><label>لقب</label><input type="text" id="pTitle" value="' + esc(u.title || '') + '"></div>' +
        '<div class="form-row">' +
            '<div class="form-group"><label>نام</label><input type="text" id="pFirstName" value="' + esc(u.firstName || '') + '"></div>' +
            '<div class="form-group"><label>نام خانوادگی</label><input type="text" id="pLastName" value="' + esc(u.lastName || '') + '"></div>' +
        '</div>' +
        '<div class="form-group"><label>نام نمایشی</label><input type="text" id="pDisplayName" value="' + esc(u.displayName) + '"></div>' +
        '<div class="form-group"><label>تاریخ تولد</label><input type="text" id="pBirthday" value="' + esc(u.birthday || '') + '"></div>' +
        '<div class="form-group"><label>پلتفرم</label><select id="pPlatform">' +
            '<option value="ps5"' + (u.platform === 'ps5' ? ' selected' : '') + '>PlayStation 5</option>' +
            '<option value="xbox"' + (u.platform === 'xbox' ? ' selected' : '') + '>Xbox</option>' +
            '<option value="switch"' + (u.platform === 'switch' ? ' selected' : '') + '>Nintendo Switch</option>' +
            '<option value="pc"' + (u.platform === 'pc' ? ' selected' : '') + '>PC</option>' +
            '<option value="mobile"' + (u.platform === 'mobile' ? ' selected' : '') + '>موبایل</option>' +
        '</select></div>' +
        '<div class="form-group"><label>وبسایت</label><input type="text" id="pWebsite" value="' + esc(u.website || '') + '" dir="ltr"></div>' +
        '<div class="form-group"><label>بیوگرافی</label><textarea id="pBio">' + esc(u.bio || '') + '</textarea></div>' +
        '<div class="form-group"><label>بازی‌های مورد علاقه</label><input type="text" id="pFavGames" value="' + esc(u.favGames || '') + '"></div>' +
        '<div class="form-group"><label>فیلم‌های مورد علاقه</label><input type="text" id="pFavMovies" value="' + esc(u.favMovies || '') + '"></div>' +
        '<div class="form-group"><label>اینستاگرام</label><input type="text" id="pInstagram" value="' + esc(u.instagram || '') + '" dir="ltr"></div>' +
        '<div class="form-group"><label>تلگرام</label><input type="text" id="pTelegram" value="' + esc(u.telegram || '') + '" dir="ltr"></div>' +
        '<div class="form-group"><label>دیسکورد</label><input type="text" id="pDiscord" value="' + esc(u.discord || '') + '" dir="ltr"></div>' +
        '<button class="btn-primary full" id="saveProfileBtn" type="button">ذخیره پروفایل</button>' +
    '</div></div>';
}

function renderNotifsTab() {
    const notifs = DB.getNotifs().filter(n => n.userId === S.user.id).reverse();
    const unread = notifs.filter(n => !n.read);
    if (!notifs.length) return '<div class="empty-state"><h3>اعلانی نداری</h3></div>';
    const icons = { comment: 'ن', friend_request: 'د', message: 'پ', group_request: 'گ', pending_comment: 'ت' };
    let html = '<div class="up-content active">';
    if (unread.length) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<span style="font-size:12px;font-weight:700;color:var(--tx-mute);">' + faNum(unread.length) + ' خوانده‌نشده</span>' +
            '<button class="btn-ghost small" id="markAllRead" type="button">خواندن همه</button>' +
        '</div>';
    }
    notifs.forEach(n => {
        html += '<div class="notif-item ' + (n.read ? '' : 'unread') + '" data-notif-id="' + n.id + '"' +
            (n.link ? ' data-notif-link="' + n.link + '"' : '') + '>' +
            '<div class="notif-icon">' + (icons[n.type] || '؟') + '</div>' +
            '<div class="notif-body"><p>' + esc(n.text) + '</p><small>' + timeAgo(n.ts) + '</small></div>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

function renderMessagesTab() {
    const msgs = DB.getPM().filter(m => m.to === S.user.id || m.from === S.user.id).reverse();
    if (!msgs.length) return '<div class="empty-state"><h3>پیامی نداری</h3><button class="btn-primary small" id="goToPM" type="button" style="margin-top:14px;">رفتن به پیام‌ها</button></div>';
    let html = '<div class="up-content active">';
    html += '<button class="btn-primary full" id="goToPM" type="button" style="margin-bottom:14px;">رفتن به پیام‌ها</button>';
    msgs.slice(0, 20).forEach(m => {
        const isMine = m.from === S.user.id;
        const otherId = isMine ? m.to : m.from;
        const other = getUserById(otherId);
        html += '<div class="notif-item" data-pm-from="' + otherId + '">' +
            '<div class="user-avatar" style="width:36px;height:36px;">' +
                (other && other.avatar ? '<img src="' + other.avatar + '" alt="">' : ini(other ? other.displayName : 'U')) +
            '</div>' +
            '<div class="notif-body"><p><strong>' + (isMine ? 'شما' : esc(other ? other.displayName : 'کاربر')) + ':</strong> ' + esc(stripHtml(m.text || '')).slice(0, 60) + '</p>' +
            '<small>' + timeAgo(m.ts) + '</small></div>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

function renderFriendsTab() {
    const u = S.user;
    const friends = u.friends || [];
    const requests = u.friendRequests || [];
    let html = '<div class="up-content active">';
    if (requests.length) {
        html += '<h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">درخواست‌ها (' + faNum(requests.length) + ')</h4>';
        const users = DB.getUsers();
        requests.forEach(rid => {
            const r = users.find(x => x.id === rid);
            if (!r) return;
            html += '<div class="notif-item">' +
                '<div class="user-avatar" style="width:36px;height:36px;">' +
                    (r.avatar ? '<img src="' + r.avatar + '" alt="">' : ini(r.displayName)) +
                '</div>' +
                '<div class="notif-body"><p><strong>' + esc(r.displayName) + '</strong> @' + esc(r.username) + '</p>' +
                '<div style="display:flex;gap:6px;margin-top:6px;">' +
                    '<button class="btn-primary small" data-accept-friend="' + rid + '" type="button">قبول</button>' +
                    '<button class="btn-ghost small" data-reject-friend="' + rid + '" type="button">رد</button>' +
                '</div></div>' +
            '</div>';
        });
    }
    html += '<h4 style="font-size:14px;font-weight:800;margin:16px 0 10px;">دوستان (' + faNum(friends.length) + ')</h4>';
    if (!friends.length) html += '<p style="text-align:center;color:var(--tx-mute);padding:20px;font-size:13px;">هنوز دوستی نداری</p>';
    else {
        const users = DB.getUsers();
        friends.forEach(fid => {
            const f = users.find(x => x.id === fid);
            if (!f) return;
            html += '<div class="notif-item">' +
                '<div class="user-avatar" style="width:36px;height:36px;">' +
                    (f.avatar ? '<img src="' + f.avatar + '" alt="">' : ini(f.displayName)) +
                '</div>' +
                '<div class="notif-body"><p><strong>' + esc(f.displayName) + '</strong></p>' +
                '<small>@' + esc(f.username) + '</small></div>' +
                '<button class="btn-ghost small" data-chat-friend="' + fid + '" type="button">پیام</button>' +
            '</div>';
        });
    }
    html += '</div>';
    return html;
}

function renderGroupsTab() {
    const u = S.user;
    const groups = DB.getGroups().filter(g => (u.groups || []).indexOf(g.id) > -1);
    if (!groups.length) return '<div class="empty-state"><h3>توی هیچ گروهی نیستی</h3></div>';
    let html = '<div class="up-content active">';
    groups.forEach(g => {
        html += '<div class="notif-item" data-group-link="' + g.id + '" style="cursor:pointer;">' +
            '<div class="user-avatar" style="width:36px;height:36px;font-size:14px;">' +
                (g.avatar ? '<img src="' + g.avatar + '" alt="">' : ini(g.name, 'G')) +
            '</div>' +
            '<div class="notif-body"><p><strong>' + esc(g.name) + '</strong></p>' +
            '<small>' + faNum(g.memberCount) + ' عضو</small></div>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

function renderBlockedTab() {
    const b = DB.getBlocks();
    const myBlocked = b[S.user.id] || [];
    if (!myBlocked.length) return '<div class="empty-state"><h3>کسی رو بلاک نکردی</h3></div>';
    const users = DB.getUsers();
    let html = '<div class="up-content active">';
    myBlocked.forEach(bid => {
        const u = users.find(x => x.id === bid);
        if (!u) return;
        html += '<div class="notif-item">' +
            '<div class="user-avatar" style="width:36px;height:36px;">' +
                (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
            '</div>' +
            '<div class="notif-body"><p><strong>' + esc(u.displayName) + '</strong></p>' +
            '<small>@' + esc(u.username) + '</small></div>' +
            '<button class="btn-ghost small" data-unblock-user="' + bid + '" type="button">رفع بلاک</button>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

function initUserPanelEvents(tab) {
    if (tab === 'activity') {
        const b = $('#logoutBtn');
        if (b) b.addEventListener('click', logoutUser);
    }
    if (tab === 'profile') {
        const chAv = $('#changeAvatarBtn'); const avInp = $('#avatarFile');
        if (chAv && avInp) {
            chAv.addEventListener('click', () => avInp.click());
            avInp.addEventListener('change', e => {
                const f = e.target.files[0];
                if (f) openCrop(f, 'avatar-user', S.user.id);
            });
        }
        const chCv = $('#changeCoverBtn'); const cvInp = $('#coverFile');
        if (chCv && cvInp) {
            chCv.addEventListener('click', () => cvInp.click());
            cvInp.addEventListener('change', e => {
                const f = e.target.files[0];
                if (f) openCrop(f, 'cover-user', S.user.id);
            });
        }
        const sv = $('#saveProfileBtn');
        if (sv) sv.addEventListener('click', async () => {
            const body = {
                title: $('#pTitle').value, firstName: $('#pFirstName').value, lastName: $('#pLastName').value,
                displayName: $('#pDisplayName').value, birthday: $('#pBirthday').value, platform: $('#pPlatform').value,
                website: $('#pWebsite').value, bio: $('#pBio').value, favGames: $('#pFavGames').value,
                favMovies: $('#pFavMovies').value, instagram: $('#pInstagram').value, telegram: $('#pTelegram').value,
                discord: $('#pDiscord').value
            };
            const ok = await act(() => API.patch('/api/me', body), ['users']);
            if (ok) { updateAuthUI(); toast('ذخیره شد'); }
        });
    }
    if (tab === 'notifications') {
        const mar = $('#markAllRead');
        if (mar) mar.addEventListener('click', async () => {
            const ok = await act(() => API.post('/api/notifs/read-all'), ['private']);
            if (ok) { updateBadges(); renderUserPanelBody('notifications'); }
        });
        $$('[data-notif-id]').forEach(el => {
            el.addEventListener('click', async () => {
                await act(() => API.post('/api/notifs/' + el.dataset.notifId + '/read'), ['private']);
                updateBadges();
                const link = el.dataset.notifLink;
                if (link) {
                    const parts = link.split(':');
                    if (parts[0] === 'post') { closeUserPanel(); showPage('post', parts[1]); }
                    else if (parts[0] === 'group') { closeUserPanel(); showPage('group', parts[1]); }
                } else renderUserPanelBody('notifications');
            });
        });
    }
    if (tab === 'messages') {
        const gpm = $('#goToPM');
        if (gpm) gpm.addEventListener('click', () => { closeUserPanel(); showPage('pm'); });
        $$('[data-pm-from]').forEach(el => el.addEventListener('click', () => {
            S.pmActiveUser = el.dataset.pmFrom;
            closeUserPanel();
            showPage('pm');
            const layout = $('#pmLayout');
            if (layout) layout.classList.add('viewing');
        }));
    }
    if (tab === 'friends') {
        $$('[data-accept-friend]').forEach(b => b.addEventListener('click', () => acceptFriend(b.dataset.acceptFriend)));
        $$('[data-reject-friend]').forEach(b => b.addEventListener('click', () => rejectFriend(b.dataset.rejectFriend)));
        $$('[data-chat-friend]').forEach(b => b.addEventListener('click', () => {
            S.pmActiveUser = b.dataset.chatFriend;
            closeUserPanel();
            showPage('pm');
            const layout = $('#pmLayout');
            if (layout) layout.classList.add('viewing');
        }));
    }
    if (tab === 'groups') {
        $$('[data-group-link]').forEach(el => el.addEventListener('click', () => {
            closeUserPanel();
            showPage('group', el.dataset.groupLink);
        }));
    }
    if (tab === 'blocked') {
        $$('[data-unblock-user]').forEach(b => b.addEventListener('click', async () => {
            await unblockUser(b.dataset.unblockUser);
            renderUserPanelBody('blocked');
        }));
    }
}

async function acceptFriend(fromId) {
    const ok = await act(() => API.post('/api/friends/' + fromId + '/accept'), ['users', 'private']);
    if (ok) { updateBadges(); renderUserPanelBody('friends'); toast('حالا دوستید'); }
}

async function rejectFriend(fromId) {
    const ok = await act(() => API.post('/api/friends/' + fromId + '/reject'), ['users', 'private']);
    if (ok) { updateBadges(); renderUserPanelBody('friends'); }
}

/* ══════════════════════════════════════════════════════════════
   ۱۹. Modals
   ══════════════════════════════════════════════════════════════ */
function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    requestAnimationFrame(() => {
        el.classList.add('on');
        if (window.innerWidth > 768) {
            const firstInput = el.querySelector('input:not([type="hidden"]):not([type="color"]), textarea, [contenteditable="true"]');
            if (firstInput) firstInput.focus({ preventScroll: true });
        }
    });
    document.body.classList.add('locked');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('on');
    setTimeout(() => {
        el.hidden = true;
        if (!document.querySelector('.modal-overlay.on') &&
            !document.querySelector('.side-modal:not([hidden])') &&
            !document.querySelector('.user-panel.on') &&
            !document.querySelector('.reply-modal-overlay.on')) {
            document.body.classList.remove('locked');
        }
    }, 220);
}

function closeAllModals() {
    ['authOverlay', 'newGroupOverlay', 'groupSettingsOverlay', 'searchOverlay', 'cropOverlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.hidden) closeModal(id);
    });
    ['adminPanel', 'editorPanel', 'authorPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.hidden) el.hidden = true;
    });
    closeReplyModal();
    closeUserPanel();
    closeDrawer();
}

/* ══════════════════════════════════════════════════════════════
   ۲۰. Auth
   ══════════════════════════════════════════════════════════════ */
function initAuth() {
    $$('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.authTab;
            $$('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
            const lf = $('#loginForm'); const rf = $('#registerForm');
            if (lf) { lf.classList.toggle('active', target === 'login'); lf.hidden = target !== 'login'; }
            if (rf) { rf.classList.toggle('active', target === 'register'); rf.hidden = target !== 'register'; }
        });
    });

    const finishAuth = async (form, apiCall) => {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        try {
            const ok = await act(apiCall, null);
            if (!ok) return;
            closeEvents(); connectEvents();
            updateAuthUI(); updateBadges();
            closeModal('authOverlay');
            form.reset();
            toast('خوش اومدی ' + (S.user ? S.user.displayName : ''));
            rerenderCurrent();
        } finally { if (btn) btn.disabled = false; }
    };

    const lf = $('#loginForm');
    if (lf) lf.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const username = String(fd.get('username') || '').toLowerCase().trim();
        const password = String(fd.get('password') || '');
        if (!username || !password) { toast('نام کاربری و رمز رو وارد کن'); return; }
        finishAuth(e.target, () => API.post('/api/login', { username, password }));
    });

    const rf = $('#registerForm');
    if (rf) rf.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const username = String(fd.get('username') || '').toLowerCase().trim();
        const displayName = String(fd.get('displayName') || '').trim();
        const password = String(fd.get('password') || '');
        const platform = fd.get('platform') || 'pc';
        if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) { toast('نام کاربری فقط با حروف انگلیسی'); return; }
        if (password.length < 6) { toast('رمز باید حداقل ۶ کاراکتر باشه'); return; }
        finishAuth(e.target, () => API.post('/api/register', { username, displayName, password, platform }));
    });
}

/* ══════════════════════════════════════════════════════════════
   ۲۱. Drawer
   ══════════════════════════════════════════════════════════════ */
function openDrawer() {
    const d = $('#drawer');
    if (!d) return;
    d.hidden = false;
    document.body.classList.add('locked');
}
function closeDrawer() {
    const d = $('#drawer');
    if (!d) return;
    d.hidden = true;
    if (!document.querySelector('.modal-overlay.on') &&
        !document.querySelector('.side-modal:not([hidden])') &&
        !document.querySelector('.user-panel.on')) {
        document.body.classList.remove('locked');
    }
}

/* ══════════════════════════════════════════════════════════════
   ۲۲. Panels
   ══════════════════════════════════════════════════════════════ */
function openAdminPanel() {
    const p = $('#adminPanel');
    if (!p) return;
    p.hidden = false;
    renderAdminTab('stats');
}
function openEditorPanel() {
    const p = $('#editorPanel');
    if (!p) return;
    p.hidden = false;
    renderEditorTab('myposts');
}
function openAuthorPanel() {
    const p = $('#authorPanel');
    if (!p) return;
    p.hidden = false;
    renderAuthorTab('myposts');
}

function renderAdminTab(tab) {
    S.adminTab = tab;
    const body = $('#adminBody');
    if (!body) return;
    $$('.sm-tab[data-admin-tab]').forEach(t => t.classList.toggle('active', t.dataset.adminTab === tab));

    const users = DB.getUsers();
    const posts = DB.getPosts();
    const groups = DB.getGroups();
    const pending = DB.getPending();

    if (tab === 'stats') {
        const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);
        const totalLikes = posts.reduce((s, p) => s + (p.comments || []).reduce((ss, c) => ss + (c.likes || []).length, 0), 0);
        const totalComments = posts.reduce((s, p) => s + (p.comments || []).length, 0);
        body.innerHTML = '<div class="admin-stats-grid">' +
            '<div class="admin-stat-card"><strong>' + faNum(users.length) + '</strong><span>کاربران</span></div>' +
            '<div class="admin-stat-card green"><strong>' + faNum(posts.length) + '</strong><span>پست‌ها</span></div>' +
            '<div class="admin-stat-card pink"><strong>' + faNum(totalViews) + '</strong><span>بازدید کل</span></div>' +
            '<div class="admin-stat-card orange"><strong>' + faNum(totalLikes) + '</strong><span>لایک کل</span></div>' +
            '<div class="admin-stat-card"><strong>' + faNum(totalComments) + '</strong><span>کامنت کل</span></div>' +
            '<div class="admin-stat-card green"><strong>' + faNum(groups.length) + '</strong><span>گروه‌ها</span></div>' +
            '<div class="admin-stat-card orange"><strong>' + faNum(pending.length) + '</strong><span>در انتظار</span></div>' +
            '<div class="admin-stat-card pink"><strong>' + faNum(DB.getActivity().length) + '</strong><span>فعالیت‌ها</span></div>' +
        '</div>';
    } else if (tab === 'users') {
        body.innerHTML = users.map(u =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div class="user-avatar" style="width:36px;height:36px;">' +
                        (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                    '</div>' +
                    '<div><strong style="font-size:13px;">' + esc(u.displayName) + '</strong>' + badgesHtml(u) +
                        '<div style="font-size:11px;color:var(--tx-mute);">@' + esc(u.username) + ' · ' + u.role + '</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<select data-role="' + u.id + '" style="padding:5px 8px;border-radius:6px;background:var(--field);border:1px solid var(--bd);font-size:11px;">' +
                        '<option value="user"' + (u.role === 'user' ? ' selected' : '') + '>کاربر</option>' +
                        '<option value="author"' + (u.role === 'author' ? ' selected' : '') + '>نویسنده</option>' +
                        '<option value="editor"' + (u.role === 'editor' ? ' selected' : '') + '>سردبیر</option>' +
                        '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>مدیر</option>' +
                    '</select>' +
                    '<button class="btn-ghost small" data-tick-blue="' + u.id + '" type="button">آبی</button>' +
                    '<button class="btn-ghost small" data-tick-gold="' + u.id + '" type="button">طلایی</button>' +
                    '<button class="btn-ghost small" data-tick-none="' + u.id + '" type="button">حذف تیک</button>' +
                    '<button class="btn-ghost small danger" data-delete-user="' + u.id + '" type="button">حذف</button>' +
                '</div>' +
            '</div>').join('');
    } else if (tab === 'posts') {
        body.innerHTML = posts.length ? posts.map(p =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div><strong style="font-size:13px;">' + esc(p.title) + '</strong>' +
                    '<div style="font-size:11px;color:var(--tx-mute);">' + esc(p.authorName || '') + ' · ' + timeAgo(p.createdAt) + '</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<button class="btn-ghost small" data-edit-post="' + p.id + '" type="button">ویرایش</button>' +
                    '<button class="btn-ghost small danger" data-delete-post="' + p.id + '" type="button">حذف</button>' +
                '</div>' +
            '</div>').join('') : '<div class="empty-state"><h3>پستی نیست</h3></div>';
    } else if (tab === 'comments') {
        if (!pending.length) { body.innerHTML = '<div class="empty-state"><h3>کامنت در انتظاری نیست</h3></div>'; }
        else {
            body.innerHTML = pending.map(item => {
                const u = getUserById(item.comment.userId);
                return '<div class="pending-item">' +
                    '<div class="pending-item-head">' +
                        '<div class="user-avatar" style="width:32px;height:32px;">' +
                            (u && u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u ? u.displayName : '؟')) +
                        '</div>' +
                        '<div><strong>' + esc(u ? u.displayName : 'ناشناس') + '</strong>' +
                        '<div style="font-size:11px;color:var(--tx-mute);">' + timeAgo(item.addedAt) + '</div></div>' +
                    '</div>' +
                    '<div class="pending-item-body">' + item.comment.content + '</div>' +
                    '<div class="pending-actions">' +
                        '<button class="btn-primary small" data-approve-comment="' + item.comment.id + '" type="button">تأیید</button>' +
                        '<button class="btn-ghost small danger" data-reject-comment="' + item.comment.id + '" type="button">رد</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
    } else if (tab === 'groups') {
        body.innerHTML = groups.length ? groups.map(g =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div class="user-avatar" style="width:36px;height:36px;font-size:14px;">' +
                        (g.avatar ? '<img src="' + g.avatar + '" alt="">' : ini(g.name, 'G')) +
                    '</div>' +
                    '<div><strong style="font-size:13px;">' + esc(g.name) + '</strong>' +
                        '<div style="font-size:11px;color:var(--tx-mute);">' + (g.type === 'public' ? 'عمومی' : 'خصوصی') + ' · ' + faNum(g.memberCount) + ' عضو</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<button class="btn-ghost small" data-view-group="' + g.id + '" type="button">مشاهده</button>' +
                    '<button class="btn-ghost small danger" data-delete-group="' + g.id + '" type="button">حذف</button>' +
                '</div>' +
            '</div>').join('') : '<div class="empty-state"><h3>گروهی نیست</h3></div>';
    } else if (tab === 'roles') {
        const authors = users.filter(u => u.role === 'author' || u.role === 'editor' || u.role === 'admin');
        body.innerHTML = '<h4 style="font-size:14px;font-weight:800;margin-bottom:14px;">تیم تحریریه و مدیریت</h4>' +
            (authors.length ? authors.map(u =>
                '<div class="admin-user-row">' +
                    '<div class="admin-user-info">' +
                        '<div class="user-avatar" style="width:36px;height:36px;">' +
                            (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                        '</div>' +
                        '<div><strong>' + esc(u.displayName) + '</strong>' + badgesHtml(u) +
                            '<div style="font-size:11px;color:var(--tx-mute);">' + u.role + '</div></div>' +
                    '</div>' +
                '</div>').join('') : '<div class="empty-state"><h3>تیم تحریریه خالیه</h3></div>');
    } else if (tab === 'broadcast') {
        body.innerHTML = renderBroadcastPanel();
        bindBroadcastPanel();
    } else if (tab === 'backup') {
        body.innerHTML = '<div style="padding:20px;border-radius:14px;background:var(--field);border:1px solid var(--bd);margin-bottom:14px;">' +
            '<h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">خروجی</h4>' +
            '<button class="btn-primary full" id="exportDataBtn" type="button">دانلود پشتیبان JSON</button></div>' +
            '<div style="padding:20px;border-radius:14px;background:var(--field);border:1px solid var(--bd);">' +
            '<h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">ورودی</h4>' +
            '<button class="btn-ghost full" id="importDataBtn" type="button">بازیابی از فایل</button>' +
            (collectLegacyLocal() ? '<button class="btn-ghost full" id="importLocalBtn" type="button" style="margin-top:8px;">انتقال داده‌های قدیمیِ این مرورگر</button>' : '') +
            '<input type="file" id="importDataInput" accept=".json" hidden></div>';
    }
}

function renderEditorTab(tab) {
    S.editorTab = tab;
    const body = $('#editorBody');
    if (!body) return;
    $$('.sm-tab[data-editor-tab]').forEach(t => t.classList.toggle('active', t.dataset.editorTab === tab));

    const posts = DB.getPosts().filter(p => p.authorId === S.user.id);
    const pending = DB.getPending();

    if (tab === 'myposts') {
        body.innerHTML = posts.length ? posts.map(p =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div><strong style="font-size:13px;">' + esc(p.title) + '</strong>' +
                    '<div style="font-size:11px;color:var(--tx-mute);">' + timeAgo(p.createdAt) + ' · ' + faNum(p.views || 0) + ' بازدید</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<button class="btn-ghost small" data-edit-post="' + p.id + '" type="button">ویرایش</button>' +
                '</div>' +
            '</div>').join('')
            : '<div class="empty-state"><h3>هنوز پستی نداری</h3></div>';
    } else if (tab === 'featured') {
        const published = DB.getPosts().filter(p => p.status === 'published');
        body.innerHTML = '<h4 style="font-size:14px;font-weight:800;margin-bottom:14px;">انتخاب پست‌های منتخب سردبیر</h4>' +
            (published.length ? published.map(p =>
                '<div class="admin-user-row">' +
                    '<div class="admin-user-info">' +
                        '<div><strong style="font-size:13px;">' + esc(p.title) + '</strong>' +
                        '<div style="font-size:11px;color:var(--tx-mute);">' + esc(p.authorName || '') + '</div></div>' +
                    '</div>' +
                    '<div class="admin-user-actions">' +
                        '<button class="btn-ghost small" data-feature-post="' + p.id + '" type="button">' +
                            (p.editorChoice ? 'حذف انتخاب' : 'انتخاب سردبیر') +
                        '</button>' +
                    '</div>' +
                '</div>').join('')
            : '<div class="empty-state"><h3>پستی نیست</h3></div>');
    } else if (tab === 'comments') {
        if (!pending.length) { body.innerHTML = '<div class="empty-state"><h3>کامنت در انتظاری نیست</h3></div>'; }
        else {
            body.innerHTML = pending.map(item => {
                const u = getUserById(item.comment.userId);
                return '<div class="pending-item">' +
                    '<div class="pending-item-head">' +
                        '<div class="user-avatar" style="width:32px;height:32px;">' +
                            (u && u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u ? u.displayName : '؟')) +
                        '</div>' +
                        '<div><strong>' + esc(u ? u.displayName : 'ناشناس') + '</strong>' +
                        '<div style="font-size:11px;color:var(--tx-mute);">' + timeAgo(item.addedAt) + '</div></div>' +
                    '</div>' +
                    '<div class="pending-item-body">' + item.comment.content + '</div>' +
                    '<div class="pending-actions">' +
                        '<button class="btn-primary small" data-approve-comment="' + item.comment.id + '" type="button">تأیید</button>' +
                        '<button class="btn-ghost small danger" data-reject-comment="' + item.comment.id + '" type="button">رد</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
    } else if (tab === 'ticks') {
        const users = DB.getUsers().filter(u => u.role !== 'admin');
        body.innerHTML = '<h4 style="font-size:14px;font-weight:800;margin-bottom:14px;">مدیریت تیک‌ها</h4>' +
            (users.length ? users.map(u =>
                '<div class="admin-user-row">' +
                    '<div class="admin-user-info">' +
                        '<div class="user-avatar" style="width:36px;height:36px;">' +
                            (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                        '</div>' +
                        '<div><strong>' + esc(u.displayName) + '</strong>' + badgesHtml(u) + '</div>' +
                    '</div>' +
                    '<div class="admin-user-actions">' +
                        '<button class="btn-ghost small" data-tick-blue="' + u.id + '" type="button">آبی</button>' +
                        '<button class="btn-ghost small" data-tick-gold="' + u.id + '" type="button">طلایی</button>' +
                        '<button class="btn-ghost small" data-tick-none="' + u.id + '" type="button">حذف</button>' +
                    '</div>' +
                '</div>').join('') : '<div class="empty-state"><h3>کاربری نیست</h3></div>');
    } else if (tab === 'broadcast') {
        body.innerHTML = renderBroadcastPanel();
        bindBroadcastPanel();
    }
}

function renderAuthorTab(tab) {
    S.authorTab = tab;
    const body = $('#authorBody');
    if (!body) return;
    $$('.sm-tab[data-author-tab]').forEach(t => t.classList.toggle('active', t.dataset.authorTab === tab));

    const posts = DB.getPosts().filter(p => p.authorId === S.user.id);

    if (tab === 'myposts') {
        const published = posts.filter(p => p.status === 'published');
        body.innerHTML = published.length ? published.map(p =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div><strong style="font-size:13px;">' + esc(p.title) + '</strong>' +
                    '<div style="font-size:11px;color:var(--tx-mute);">' + faNum(p.views || 0) + ' بازدید · ' + timeAgo(p.createdAt) + '</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<button class="btn-ghost small" data-edit-post="' + p.id + '" type="button">ویرایش</button>' +
                '</div>' +
            '</div>').join('')
            : '<div class="empty-state"><h3>هنوز پستی نداری</h3></div>';
    } else if (tab === 'drafts') {
        const drafts = posts.filter(p => p.status === 'draft');
        body.innerHTML = drafts.length ? drafts.map(p =>
            '<div class="admin-user-row">' +
                '<div class="admin-user-info">' +
                    '<div><strong style="font-size:13px;">' + esc(p.title) + '</strong>' +
                    '<div style="font-size:11px;color:var(--tx-mute);">' + timeAgo(p.createdAt) + '</div></div>' +
                '</div>' +
                '<div class="admin-user-actions">' +
                    '<button class="btn-ghost small" data-edit-post="' + p.id + '" type="button">ویرایش</button>' +
                '</div>' +
            '</div>').join('')
            : '<div class="empty-state"><h3>پیش‌نویسی نداری</h3></div>';
    }
}

/* ══════════════════════════════════════════════════════════════
   ۲۳. Broadcast
   ══════════════════════════════════════════════════════════════ */
function renderBroadcast() {
    const banner = $('#broadcastBanner');
    if (!banner) return;
    const bc = DB.getBroadcast();
    const isActive = bc && bc.active;

    if (!isActive) {
        banner.hidden = true;
        document.body.classList.remove('has-broadcast');
        return;
    }
    const dismissedBy = bc.dismissedBy || [];
    if (S.user && dismissedBy.indexOf(S.user.id) > -1) {
        banner.hidden = true;
        document.body.classList.remove('has-broadcast');
        return;
    }
    if (!S.user && store.get('nova.bc.guestDismissed', '') === bc.id) {
        banner.hidden = true;
        document.body.classList.remove('has-broadcast');
        return;
    }
    const textEl = $('#broadcastText');
    if (textEl) {
        textEl.innerHTML = '<strong>' + esc(bc.authorName || 'مدیر') + ':</strong> ' + esc(bc.text);
    }
    banner.hidden = false;
    document.body.classList.add('has-broadcast');
}

async function dismissBroadcast() {
    const bc = DB.getBroadcast();
    if (!bc) return;
    if (S.user) { try { await API.post('/api/broadcast/dismiss'); await sync(['broadcast']); } catch (e) {} }
    else store.set('nova.bc.guestDismissed', bc.id);
    const banner = $('#broadcastBanner');
    if (banner) banner.hidden = true;
    document.body.classList.remove('has-broadcast');
}

function renderBroadcastPanel() {
    const bc = DB.getBroadcast();
    const hasActive = bc && bc.active;
    return '<h4 style="font-size:14px;font-weight:800;margin-bottom:14px;">پیام سراسری</h4>' +
        (hasActive
            ? '<div style="padding:16px;border-radius:14px;background:var(--field);border:1px solid var(--bd);margin-bottom:16px;">' +
                  '<div style="font-size:11px;color:var(--tx-mute);margin-bottom:6px;">پیام فعال</div>' +
                  '<div style="font-size:13px;line-height:1.8;margin-bottom:12px;word-break:break-word;">' + esc(bc.text) + '</div>' +
                  '<div style="font-size:11px;color:var(--tx-mute);margin-bottom:12px;">' +
                      'توسط ' + esc(bc.authorName) + ' · ' + timeAgo(bc.createdAt) +
                  '</div>' +
                  '<button class="btn-ghost small danger full" id="bcDeactivate" type="button">حذف پیام</button>' +
              '</div>'
            : '') +
        '<div class="form-group" style="margin-bottom:14px;">' +
            '<label>پیام جدید</label>' +
            '<textarea id="bcText" rows="4" placeholder="متن پیام سراسری..."></textarea>' +
            '<small style="font-size:11px;color:var(--tx-mute);margin-top:6px;display:block;">این پیام به همه کاربران نمایش داده می‌شود</small>' +
        '</div>' +
        '<button class="btn-primary full" id="bcPublish" type="button">ارسال به همه</button>';
}

function bindBroadcastPanel() {
    const pub = $('#bcPublish');
    if (pub) pub.addEventListener('click', async () => {
        const text = $('#bcText').value.trim();
        if (!text) { toast('متن خالیه'); return; }
        if (!S.user) return;
        const ok = await act(() => API.post('/api/broadcast', { text }), ['broadcast']);
        if (!ok) return;
        store.del('nova.bc.guestDismissed');
        renderBroadcast();
        toast('پیام ارسال شد');
        if (S.adminTab === 'broadcast') renderAdminTab('broadcast');
        if (S.editorTab === 'broadcast') renderEditorTab('broadcast');
    });

    const deact = $('#bcDeactivate');
    if (deact) deact.addEventListener('click', async () => {
        if (!confirm('پیام حذف بشه؟')) return;
        const ok = await act(() => API.del('/api/broadcast'), ['broadcast']);
        if (!ok) return;
        renderBroadcast();
        toast('پیام حذف شد');
        if (S.adminTab === 'broadcast') renderAdminTab('broadcast');
        if (S.editorTab === 'broadcast') renderEditorTab('broadcast');
    });
}

/* ══════════════════════════════════════════════════════════════
   ۲۴. Editor
   ══════════════════════════════════════════════════════════════ */
function openEditor(postId) {
    applyEditorRoleUI();
    const u = S.user;
    if (!u) { openModal('authOverlay'); return; }
    if (u.role !== 'admin' && u.role !== 'editor' && u.role !== 'author') { toast('اجازه نداری'); return; }

    S.editingPostId = postId || null;
    const modal = $('#editorFullscreen');
    const titleEl = $('#editorTitle');
    const contentEl = $('#editorContent');
    const titleText = $('#editorTitleText');

    if (postId) {
        const post = DB.getPosts().find(p => p.id === postId);
        if (post) {
            titleEl.value = post.title;
            contentEl.innerHTML = post.content;
            $('#editorCategory').value = post.category;
            $('#editorPlatform').value = post.platform || 'all';
            $('#editorTags').value = (post.tags || []).join('، ');
            $('#editorCover').value = post.cover || '';
            $('#editorExcerpt').value = post.excerpt || '';
            $('#editorScore').value = post.score || '';
            $('#editorChoice').value = post.editorChoice ? 'true' : 'false';
            $('#editorPinned').value = post.pinned ? 'true' : 'false';
            if (titleText) titleText.textContent = 'ویرایش پست';
        }
    } else {
        titleEl.value = '';
        contentEl.innerHTML = '';
        $('#editorCategory').value = 'news';
        $('#editorPlatform').value = 'all';
        $('#editorTags').value = '';
        $('#editorCover').value = '';
        $('#editorExcerpt').value = '';
        $('#editorScore').value = '';
        $('#editorChoice').value = 'false';
        $('#editorPinned').value = 'false';
        if (titleText) titleText.textContent = 'پست جدید';

        const draftTs = +store.get('nova.draft.ts', 0);
        if (draftTs && (Date.now() - draftTs) < 86400000) {
            const draftContent = store.get('nova.draft.content', '');
            const draftTitle = store.get('nova.draft.title', '');
            if (draftContent && confirm('پیش‌نویس ذخیره‌نشده پیدا شد. بازیابی کنم؟')) {
                contentEl.innerHTML = draftContent;
                titleEl.value = draftTitle;
            } else {
                store.del('nova.draft.content');
                store.del('nova.draft.title');
                store.del('nova.draft.ts');
            }
        }
    }

    modal.hidden = false;
    document.body.classList.add('locked');
}

function closeEditor() {
    const modal = $('#editorFullscreen');
    if (modal) modal.hidden = true;
    if (!document.querySelector('.modal-overlay.on') &&
        !document.querySelector('.side-modal:not([hidden])') &&
        !document.querySelector('.user-panel.on')) {
        document.body.classList.remove('locked');
    }
}

async function savePost(isDraft) {
    const title = $('#editorTitle').value.trim();
    const content = $('#editorContent').innerHTML;
    if (!title || !content || !$('#editorContent').textContent.trim() && !/<img /.test(content)) { toast('عنوان و محتوا لازمه'); return; }
    if (S._postBusy) return;
    S._postBusy = true;
    try {
        const body = {
            title, content,
            category: $('#editorCategory').value,
            platform: $('#editorPlatform').value,
            tags: $('#editorTags').value.split(/[،,]/).map(t => t.trim()).filter(Boolean),
            cover: $('#editorCover').value.trim() || null,
            excerpt: $('#editorExcerpt').value.trim(),
            score: $('#editorScore').value ? +$('#editorScore').value : null,
            editorChoice: $('#editorChoice').value === 'true',
            pinned: $('#editorPinned').value === 'true',
            status: isDraft ? 'draft' : 'published'
        };
        const editing = S.editingPostId;
        const r = await act(() => editing ? API.put('/api/posts/' + editing, body) : API.post('/api/posts', body), ['posts', 'users', 'activity']);
        if (!r) return;
        store.del('nova.draft.content');
        store.del('nova.draft.title');
        store.del('nova.draft.ts');
        toast(isDraft ? 'پیش‌نویس ذخیره شد' : (editing ? 'ویرایش شد' : 'منتشر شد'));
        closeEditor();
        renderHome();
        updateAuthUI();
        if (S.page === 'post') renderPostPage(r.id || editing);
        S.editingPostId = null;
        refreshStaffPanels();
    } finally { S._postBusy = false; }
}

function initEditor() {
    const editor = $('#editorContent');

    if (editor) {
        editor.addEventListener('beforeinput', () => {
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            const toRemove = [];
            let n;
            while ((n = walker.nextNode())) {
                if (n.textContent === '\u200B') toRemove.push(n);
            }
            toRemove.forEach(node => {
                if (node.parentNode && document.activeElement === editor) {
                    try { node.parentNode.removeChild(node); } catch (e) {}
                }
            });
        });

        const saveDraft = () => {
            try {
                store.set('nova.draft.content', editor.innerHTML);
                const t = $('#editorTitle');
                if (t) store.set('nova.draft.title', t.value);
                store.set('nova.draft.ts', Date.now());
            } catch (e) {}
        };
        editor.addEventListener('input', () => {
            clearTimeout(editor._draftTimer);
            editor._draftTimer = setTimeout(saveDraft, 800);
        });
        const et = $('#editorTitle');
        if (et) et.addEventListener('input', saveDraft);
    }

    $$('.editor-toolbar button[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (cmd === 'bold') Ed.bold();
            else if (cmd === 'italic') Ed.italic();
            else if (cmd === 'underline') Ed.underline();
            else if (cmd === 'insertUnorderedList') {
                document.execCommand('insertUnorderedList', false, null);
            } else if (cmd === 'insertOrderedList') {
                document.execCommand('insertOrderedList', false, null);
            } else if (cmd === 'formatBlock') {
                document.execCommand('formatBlock', false, '<' + (btn.dataset.val || 'p') + '>');
            }
            editor.focus();
        });
    });

    const tImg = $('#tbImg');
    if (tImg) tImg.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
            try {
                const b64 = await uploadImage(inp.files[0]);
                document.execCommand('insertImage', false, b64);
            } catch (err) { toast(err); }
        };
        inp.click();
    });

    const tCode = $('#tbCode');
    if (tCode) {
        tCode.addEventListener('mousedown', e => e.preventDefault());
        tCode.addEventListener('click', e => { e.preventDefault(); Ed.code(); editor.focus(); });
    }

    const tSpoiler = $('#tbSpoiler');
    if (tSpoiler) {
        tSpoiler.addEventListener('mousedown', e => e.preventDefault());
        tSpoiler.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
    }

    const tRainbow = $('#tbRainbow');
    if (tRainbow) {
        tRainbow.addEventListener('mousedown', e => e.preventDefault());
        tRainbow.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
    }

    const tColor = $('#tbColor');
    if (tColor) {
        tColor.addEventListener('mousedown', e => e.preventDefault());
        tColor.addEventListener('click', e => {
            e.preventDefault();
            const p = $('#editorColorPicker');
            if (p) p.hidden = !p.hidden;
        });
    }

    const cc = $('#editorColorCustom');
    if (cc) {
        cc.addEventListener('mousedown', e => e.preventDefault());
        cc.addEventListener('input', () => Ed.color(cc.value));
    }

    $$('#editorColorPicker .color-dot').forEach(d => {
        d.addEventListener('mousedown', e => e.preventDefault());
        d.addEventListener('click', e => {
            e.preventDefault();
            Ed.color(d.dataset.color);
            const p = $('#editorColorPicker');
            if (p) p.hidden = true;
            editor.focus();
        });
    });

    const tCallout = $('#tbCallout');
    if (tCallout) {
        tCallout.addEventListener('mousedown', e => e.preventDefault());
        tCallout.addEventListener('click', e => {
            e.preventDefault();
            const t = prompt('متن کادر مهم:');
            if (t) {
                const div = document.createElement('div');
                div.className = 'callout';
                div.textContent = t;
                const sel = window.getSelection();
                if (sel && sel.rangeCount) {
                    sel.getRangeAt(0).insertNode(div);
                    const br = document.createElement('br');
                    div.parentNode.insertBefore(br, div.nextSibling);
                }
            }
        });
    }

    const saveDraft = $('#editorDraftBtn');
    if (saveDraft) saveDraft.addEventListener('click', () => savePost(true));
    const publish = $('#editorPublishBtn');
    if (publish) publish.addEventListener('click', () => savePost(false));
    const closeBtn = $('#editorCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);

    const uploadCover = $('#editorUploadCover');
    if (uploadCover) uploadCover.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
            try {
                const b64 = await uploadImage(inp.files[0]);
                $('#editorCover').value = b64;
                toast('آپلود شد');
            } catch (err) { toast(err); }
        };
        inp.click();
    });
}

/* ══════════════════════════════════════════════════════════════
   ۲۵. Crop
   ══════════════════════════════════════════════════════════════ */
function openCrop(file, mode, targetId) {
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            S.cropMode = mode; S.cropTarget = targetId; S.cropImg = img;
            S.cropZoom = 1; S.cropRotate = 0;
            const z = $('#cropZoom'); const r = $('#cropRotate');
            if (z) z.value = 100;
            if (r) r.value = 0;
            drawCropCanvas();
            openModal('cropOverlay');
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function drawCropCanvas() {
    const canvas = $('#cropCanvas');
    if (!canvas || !S.cropImg) return;
    const ctx = canvas.getContext('2d');
    const size = 300;
    canvas.width = size; canvas.height = size;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(S.cropRotate * Math.PI / 180);
    ctx.scale(S.cropZoom, S.cropZoom);
    const scale = Math.min(size / S.cropImg.width, size / S.cropImg.height);
    const w = S.cropImg.width * scale;
    const h = S.cropImg.height * scale;
    ctx.drawImage(S.cropImg, -w / 2, -h / 2, w, h);
    ctx.restore();
}

async function applyCrop() {
    const canvas = $('#cropCanvas');
    if (!canvas || !S.cropMode) return;
    const isCover = S.cropMode.indexOf('cover') > -1;
    const out = document.createElement('canvas');
    out.width = isCover ? 1200 : 500;
    out.height = isCover ? 400 : 500;
    out.getContext('2d').drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, out.width, out.height);
    const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.86));
    if (!blob) { toast('خطا در پردازش تصویر'); return; }
    let url;
    try { url = await API.upload(blob); } catch (e) { toast(e.message); return; }

    const field = isCover ? 'cover' : 'avatar';
    if (S.cropMode === 'avatar-user' || S.cropMode === 'cover-user') {
        const ok = await act(() => API.patch('/api/me', { [field]: url }), ['users']);
        if (ok) { updateAuthUI(); renderUserPanelBody('profile'); }
        else return;
    } else if (S.cropMode === 'avatar-group' || S.cropMode === 'cover-group') {
        const gid = S.cropTarget;
        const ok = await groupAct(gid, () => API.patch('/api/groups/' + gid, { [field]: url }), ['groups']);
        if (!ok) return;
    }
    closeModal('cropOverlay');
    toast('ذخیره شد');
}

/* ══════════════════════════════════════════════════════════════
   ۲۶. Search + کدهای مخفی
   ══════════════════════════════════════════════════════════════ */
async function trySecretCode(value) {
    const code = String(value || '').trim();
    if (!S.user || !/^@[A-Za-z0-9_\-]{3,60}$/.test(code)) return false;
    try {
        const r = await API.post('/api/secret', { code });
        await sync();
        updateAuthUI();
        toast('🎉 حالا ' + r.label + ' هستی');
        closeModal('searchOverlay');
        return true;
    } catch (e) { return false; }
}

function initSearch() {
    const input = $('#searchInput');
    const results = $('#searchResults');
    if (!input || !results) return;

    let searchTimer;

    input.addEventListener('input', e => {
        const raw = e.target.value;
        clearTimeout(searchTimer);
        const q = raw.trim().toLowerCase();
        if (q.length < 2) {
            results.innerHTML = '<p class="search-hint">شروع به تایپ کن</p>';
            return;
        }
        searchTimer = setTimeout(() => doSearch(q), 150);
    });

    input.addEventListener('keydown', async e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const raw = input.value;
            if (await trySecretCode(raw)) { input.value = ''; return; }
            doSearch(input.value.trim().toLowerCase());
        }
    });

    function doSearch(q) {
        const posts = DB.getPosts().filter(p => p.status === 'published' &&
            ((p.title || '').toLowerCase().indexOf(q) > -1 ||
             stripHtml(p.content).toLowerCase().indexOf(q) > -1)).slice(0, 5);
        const users = DB.getUsers().filter(u =>
            u.username.indexOf(q) > -1 ||
            (u.displayName || '').toLowerCase().indexOf(q) > -1).slice(0, 5);
        const groups = DB.getGroups().filter(g => g.type === 'public' &&
            (g.name || '').toLowerCase().indexOf(q) > -1).slice(0, 3);

        let html = '';
        if (posts.length) {
            html += '<div class="search-result-section">پست‌ها</div>';
            posts.forEach(p => {
                html += '<div class="search-result-item" data-open-post="' + p.id + '">' +
                    '<div class="search-result-icon">پ</div>' +
                    '<div class="search-result-info"><strong>' + esc(p.title) + '</strong>' +
                    '<small>' + faNum(p.views || 0) + ' بازدید</small></div></div>';
            });
        }
        if (users.length) {
            html += '<div class="search-result-section">کاربران</div>';
            users.forEach(u => {
                html += '<div class="search-result-item" data-open-user="' + u.id + '">' +
                    '<div class="search-result-icon">' +
                        (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                    '</div>' +
                    '<div class="search-result-info"><strong>' + esc(u.displayName) + '</strong>' +
                    '<small>@' + esc(u.username) + '</small></div></div>';
            });
        }
        if (groups.length) {
            html += '<div class="search-result-section">گروه‌ها</div>';
            groups.forEach(g => {
                html += '<div class="search-result-item" data-open-group="' + g.id + '">' +
                    '<div class="search-result-icon">' +
                        (g.avatar ? '<img src="' + g.avatar + '" alt="">' : ini(g.name, 'G')) +
                    '</div>' +
                    '<div class="search-result-info"><strong>' + esc(g.name) + '</strong>' +
                    '<small>' + faNum(g.memberCount) + ' عضو</small></div></div>';
            });
        }
        if (!html) html = '<p class="search-hint">نتیجه‌ای پیدا نشد</p>';
        results.innerHTML = html;

        results.querySelectorAll('[data-open-post]').forEach(el => el.addEventListener('click', () => {
            closeModal('searchOverlay'); showPage('post', el.dataset.openPost);
        }));
        results.querySelectorAll('[data-open-user]').forEach(el => el.addEventListener('click', () => {
            closeModal('searchOverlay'); showPage('profile', el.dataset.openUser);
        }));
        results.querySelectorAll('[data-open-group]').forEach(el => el.addEventListener('click', () => {
            closeModal('searchOverlay'); showPage('group', el.dataset.openGroup);
        }));
    }
}

/* ══════════════════════════════════════════════════════════════
   ۲۷. Scroll UI
   ══════════════════════════════════════════════════════════════ */
function initScrollUI() {
    const bar = $('#scrollProgress');
    const nav = $('#navShell');
    const toTop = $('#toTop');
    let raf = null;
    window.addEventListener('scroll', () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
            const y = scrollY;
            const total = document.documentElement.scrollHeight - innerHeight;
            if (bar) bar.style.width = (total > 0 ? (y / total) * 100 : 0) + '%';
            if (nav) nav.classList.toggle('scrolled', y > 40);
            if (toTop) toTop.classList.toggle('show', y > 500);
            raf = null;
        });
    }, { passive: true });
    if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/* ══════════════════════════════════════════════════════════════
   ۲۸. Auto-approve pending
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   ۲۹. Event Bindings
   ══════════════════════════════════════════════════════════════ */
function bindAllEvents() {
    /* منو */
    const menuBtn = $('#menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', openDrawer);
    const drawerClose = $('#drawerClose');
    if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
    const drawerBackdrop = $('#drawerBackdrop');
    if (drawerBackdrop) drawerBackdrop.addEventListener('click', closeDrawer);

    /* ناوبری */
    document.querySelectorAll('[data-nav]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            const page = el.dataset.nav;
            closeDrawer();
            closeUserPanel();
            showPage(page);
        });
    });

    /* لوگو → خانه */
    const brandHome = $('#brandHome');
    if (brandHome) brandHome.addEventListener('click', e => {
        e.preventDefault();
        closeDrawer();
        closeUserPanel();
        showPage('home');
    });

    /* تم */
    const themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', flipTheme);

    /* ورود */
    const loginBtn = $('#loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', () => openModal('authOverlay'));
    const drawerLoginBtn = $('#drawerLoginBtn');
    if (drawerLoginBtn) drawerLoginBtn.addEventListener('click', () => { closeDrawer(); openModal('authOverlay'); });

    /* کاربر */
    const userBtn = $('#userBtn');
    if (userBtn) userBtn.addEventListener('click', () => openUserPanel());

    /* NOTE: pmBtn حذف شد (تغییر ۱۲) */

    /* ساخت پست */
    const drawerNewPost = $('#drawerNewPost');
    if (drawerNewPost) drawerNewPost.addEventListener('click', () => { closeDrawer(); openEditor(); });
    const heroNewPost = $('#heroNewPost');
    if (heroNewPost) heroNewPost.addEventListener('click', () => openEditor());

    /* پنل‌ها */
    const drawerAdminBtn = $('#drawerAdminBtn');
    if (drawerAdminBtn) drawerAdminBtn.addEventListener('click', () => { closeDrawer(); openAdminPanel(); });
    const drawerEditorBtn = $('#drawerEditorBtn');
    if (drawerEditorBtn) drawerEditorBtn.addEventListener('click', () => { closeDrawer(); openEditorPanel(); });
    const drawerAuthorBtn = $('#drawerAuthorBtn');
    if (drawerAuthorBtn) drawerAuthorBtn.addEventListener('click', () => { closeDrawer(); openAuthorPanel(); });

    /* جستجو */
    const searchBtn = $('#searchBtn');
    if (searchBtn) searchBtn.addEventListener('click', () => {
        openModal('searchOverlay');
        setTimeout(() => { const si = $('#searchInput'); if (si) si.focus(); }, 250);
    });

    /* پیام سراسری — بستن */
    const bcClose = $('#broadcastClose');
    if (bcClose) bcClose.addEventListener('click', dismissBroadcast);

    /* گروه جدید */
    const createGroupBtn = $('#createGroupBtn');
    if (createGroupBtn) createGroupBtn.addEventListener('click', () => {
        if (!S.user || S.user.role !== 'admin') { toast('فقط مدیر'); return; }
        openModal('newGroupOverlay');
    });

    const newGroupForm = $('#newGroupForm');
    if (newGroupForm) newGroupForm.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = String(fd.get('name') || '').trim();
        const description = String(fd.get('description') || '').trim();
        const type = fd.get('type') || 'public';
        if (!name) return;
        const r = await act(() => API.post('/api/groups', { name, description, type }), ['groups', 'users', 'activity']);
        if (!r) return;
        toast('گروه ساخته شد');
        closeModal('newGroupOverlay');
        e.target.reset();
        showPage('group', r.id);
    });

    /* فیلترها */
    document.querySelectorAll('#postFilters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#postFilters .filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            S.postFilter = chip.dataset.filter;
            renderPosts();
        });
    });

    document.querySelectorAll('#timeFilter .time-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#timeFilter .time-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            S.timeFilter = chip.dataset.time;
            renderTrending();
        });
    });

    document.querySelectorAll('.group-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.group-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            S.groupFilter = tab.dataset.groupsTab;
            renderGroupsPage();
        });
    });

    document.querySelectorAll('.up-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.up-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderUserPanelBody(tab.dataset.tab);
        });
    });

    document.querySelectorAll('.sm-tab[data-admin-tab]').forEach(tab => {
        tab.addEventListener('click', () => renderAdminTab(tab.dataset.adminTab));
    });
    document.querySelectorAll('.sm-tab[data-editor-tab]').forEach(tab => {
        tab.addEventListener('click', () => renderEditorTab(tab.dataset.editorTab));
    });
    document.querySelectorAll('.sm-tab[data-author-tab]').forEach(tab => {
        tab.addEventListener('click', () => renderAuthorTab(tab.dataset.authorTab));
    });

    const userPanelClose = $('#userPanelClose');
    if (userPanelClose) userPanelClose.addEventListener('click', closeUserPanel);

    /* Delegation */
    document.addEventListener('click', e => {
        const closeBtn = e.target.closest('[data-close]');
        if (closeBtn) {
            const t = closeBtn.dataset.close;
            const map = {
                auth: 'authOverlay', newGroup: 'newGroupOverlay',
                groupSettings: 'groupSettingsOverlay', search: 'searchOverlay',
                crop: 'cropOverlay'
            };
            if (map[t]) closeModal(map[t]);
            else if (t === 'admin') { const p = $('#adminPanel'); if (p) p.hidden = true; }
            else if (t === 'editor-panel') { const p = $('#editorPanel'); if (p) p.hidden = true; }
            else if (t === 'author-panel') { const p = $('#authorPanel'); if (p) p.hidden = true; }
            return;
        }

        const tickEl = e.target.closest('[data-tick-blue],[data-tick-gold],[data-tick-none]');
        if (tickEl) {
            const id = tickEl.dataset.tickBlue || tickEl.dataset.tickGold || tickEl.dataset.tickNone;
            const val = tickEl.hasAttribute('data-tick-blue') ? 'blue' : tickEl.hasAttribute('data-tick-gold') ? 'gold' : null;
            act(() => API.patch('/api/admin/users/' + id, { tick: val }), ['users']).then(ok => {
                if (ok) { toast(val === 'blue' ? 'تیک آبی داده شد' : val === 'gold' ? 'تیک طلایی داده شد' : 'تیک حذف شد'); refreshStaffPanels(); }
            });
        }

        const delUser = e.target.closest('[data-delete-user]');
        if (delUser) {
            if (!confirm('کاربر حذف بشه؟')) return;
            act(() => API.del('/api/admin/users/' + delUser.dataset.deleteUser), ['users', 'groups', 'posts']).then(ok => {
                if (ok) { toast('حذف شد'); refreshStaffPanels(); }
            });
        }

        const editPost = e.target.closest('[data-edit-post]');
        if (editPost) {
            const p = $('#adminPanel'); if (p) p.hidden = true;
            const ep = $('#editorPanel'); if (ep) ep.hidden = true;
            const ap = $('#authorPanel'); if (ap) ap.hidden = true;
            openEditor(editPost.dataset.editPost);
        }

        const delPost = e.target.closest('[data-delete-post]');
        if (delPost) {
            if (!confirm('پست حذف بشه؟')) return;
            act(() => API.del('/api/posts/' + delPost.dataset.deletePost), ['posts']).then(ok => {
                if (ok) { toast('حذف شد'); refreshStaffPanels(); }
            });
        }

        const featurePost = e.target.closest('[data-feature-post]');
        if (featurePost) {
            act(() => API.post('/api/posts/' + featurePost.dataset.featurePost + '/feature'), ['posts']).then(ok => {
                if (ok) { toast('تغییر کرد'); refreshStaffPanels(); }
            });
        }

        const approveC = e.target.closest('[data-approve-comment]');
        if (approveC) {
            act(() => API.post('/api/pending/' + approveC.dataset.approveComment + '/approve'), ['posts', 'activity']).then(ok => {
                if (ok) { toast('تأیید شد'); refreshStaffPanels(); }
            });
        }
        const rejectC = e.target.closest('[data-reject-comment]');
        if (rejectC) {
            act(() => API.post('/api/pending/' + rejectC.dataset.rejectComment + '/reject'), ['posts']).then(ok => {
                if (ok) { toast('رد شد'); refreshStaffPanels(); }
            });
        }

        const delGroup = e.target.closest('[data-delete-group]');
        if (delGroup) {
            if (!confirm('گروه حذف بشه؟')) return;
            act(() => API.del('/api/groups/' + delGroup.dataset.deleteGroup), ['groups', 'users']).then(ok => {
                if (ok) { toast('گروه حذف شد'); refreshStaffPanels(); }
            });
        }

        const viewGroup = e.target.closest('[data-view-group]');
        if (viewGroup) {
            const p = $('#adminPanel'); if (p) p.hidden = true;
            showPage('group', viewGroup.dataset.viewGroup);
        }

        const spoiler = e.target.closest('.spoiler');
        if (spoiler && !spoiler.closest('[contenteditable="true"]')) spoiler.classList.toggle('revealed');

        if (e.target.id === 'importLocalBtn') {
            const payload = collectLegacyLocal();
            if (!payload) { toast('داده‌ی قدیمی‌ای توی این مرورگر نیست'); return; }
            if (!confirm('داده‌های قدیمی این مرورگر به سرور منتقل بشه؟')) return;
            act(() => API.post('/api/admin/import', payload), null).then(async r => {
                if (!r) return;
                await sync(); rerenderCurrent(); refreshStaffPanels();
                toast('منتقل شد: ' + faNum(r.users) + ' کاربر، ' + faNum(r.posts) + ' پست، ' + faNum(r.groups) + ' گروه');
            });
        }

        if (e.target.id === 'exportDataBtn') {
            const a = document.createElement('a');
            a.href = '/api/admin/export'; a.download = 'nova-backup.json';
            document.body.appendChild(a); a.click(); a.remove();
            toast('دانلود شد');
        }
        if (e.target.id === 'importDataBtn') {
            const inp = $('#importDataInput'); if (inp) inp.click();
        }
    });

    /* تغییر نقش (با رویداد change، نه click — باگ نسخه‌ی قبل) */
    document.addEventListener('change', e => {
        const roleSel = e.target.closest && e.target.closest('select[data-role]');
        if (!roleSel) return;
        act(() => API.patch('/api/admin/users/' + roleSel.dataset.role, { role: roleSel.value }), ['users']).then(ok => {
            if (ok) toast('نقش تغییر کرد');
            refreshStaffPanels();
        });
    });

    /* import */
    const importInput = document.getElementById('importDataInput');
    if (importInput) importInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = async () => {
            let data;
            try { data = JSON.parse(reader.result); } catch (err) { toast('فایل نامعتبر'); return; }
            const r = await act(() => API.post('/api/admin/import', data), null);
            if (!r) return;
            await sync(); rerenderCurrent(); refreshStaffPanels();
            toast('بازیابی شد: ' + faNum(r.users) + ' کاربر، ' + faNum(r.posts) + ' پست');
        };
        reader.readAsText(f);
        e.target.value = '';
    });

    /* Crop sliders */
    const cropZoom = $('#cropZoom');
    if (cropZoom) cropZoom.addEventListener('input', e => {
        S.cropZoom = +e.target.value / 100;
        drawCropCanvas();
    });
    const cropRotate = $('#cropRotate');
    if (cropRotate) cropRotate.addEventListener('input', e => {
        S.cropRotate = +e.target.value;
        drawCropCanvas();
    });
    const cropCancel = $('#cropCancel');
    if (cropCancel) cropCancel.addEventListener('click', () => closeModal('cropOverlay'));
    const cropApply = $('#cropApply');
    if (cropApply) cropApply.addEventListener('click', applyCrop);

    /* Escape */
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeAllModals();
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            openModal('searchOverlay');
        }
    });
}

/* ══════════════════════════════════════════════════════════════
   ۳۰. Boot
   ══════════════════════════════════════════════════════════════ */
async function boot() {
    try { console.log('%c🎮 نووا گیم v7.0 (با سرور)', 'color:#5b6eae;font-size:14px;font-weight:bold'); } catch (e) {}

    applyTheme(S.theme);
    document.documentElement.dataset.perf = isLowEnd() ? 'low' : 'high';
    /* فونت‌ها بدون بلاک‌شدن رندر (جایگزین onload اینلاین که CSP مسدود می‌کند) */
    const gf = document.getElementById('gfonts');
    if (gf) setTimeout(() => { gf.media = 'all'; }, 0);

    initScrollUI();
    initAuth();
    initSearch();
    initEditor();
    initReplyModal();
    bindAllEvents();

    try { await sync(); } catch (e) { toast('ارتباط با سرور برقرار نشد؛ صفحه رو دوباره باز کن'); }
    updateAuthUI();
    updateBadges();
    renderHome();
    renderBroadcast();
    connectEvents();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
               }
