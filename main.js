// Import Firestore và Auth từ home.js
import { db, auth, signInWithGoogle, signOutUser, getRedirectResultAuth } from "./home.js";

// auth helper imports for signup
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

// Import các hàm Firestore từ Firebase CDN
import {
    collection,
    addDoc,
    serverTimestamp,
    getDocs,
    query,
    orderBy,
    doc,
    getDoc,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
// 1) LƯU BÀI CHIA SẺ / DỮ LIỆU
export async function savePost(text) {
    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Người dùng chưa đăng nhập.');
        }
        await addDoc(collection(db, "posts"), {
            content: text,
            authorId: user.uid,
            authorName: user.displayName || user.email || 'Người dùng',
            createdAt: serverTimestamp()
        });
        console.log("Lưu thành công");
    } catch (error) {
        console.error("Lỗi lưu dữ liệu:", error);
        throw error;
    }
}
// 2) TẢI DANH SÁCH BÀI CHIA SẺ
export async function loadPosts() {

    const q = query(
        collection(db, "posts"),
        orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);

    let result = [];
    snap.forEach(doc => {
        result.push({
            id: doc.id,
            ...doc.data()
        });
    });

    return result;
}
// 3) HÀM HIỂN THỊ LÊN HTML (TIỆN DÙNG)
export async function renderPosts(containerId) {
    const list = await loadPosts();
    const box = document.getElementById(containerId);

    if (!box) {
        console.error("Không tìm thấy container:", containerId);
        return;
    }

    box.innerHTML = "";

    list.forEach(item => {
        const div = document.createElement("div");
        div.className = "post-item";
        const time = item.createdAt && item.createdAt.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : '');
        div.innerHTML = `
            <p>${item.content}</p>
            <small>${item.authorName ? 'Bởi: ' + escapeHtml(item.authorName) + ' — ' : ''}${escapeHtml(time)}</small>
            <hr>
        `;
        box.appendChild(div);
    });
}

// Subscribe to posts in real-time and render into container
export function subscribeToPosts(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return () => {};
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        snapshot.forEach(docSnap => {
            const item = docSnap.data() || {};
            const div = document.createElement('div');
            div.className = 'post-item';
            const time = item.createdAt && item.createdAt.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleString() : (item.createdAt ? new Date(item.createdAt).toLocaleString() : '');
            div.innerHTML = `
                <p>${escapeHtml(item.content || '')}</p>
                <small>${escapeHtml(item.authorName || 'Người dùng')} — ${escapeHtml(time)}</small>
            `;

            // comments container + form
            const commentsWrap = document.createElement('div');
            commentsWrap.className = 'comment-wrap';
            commentsWrap.innerHTML = `
                <div class="comment-list" id="comments-for-${docSnap.id}"></div>
                <form class="comment-form" data-post-id="${docSnap.id}">
                    <input type="text" name="comment" placeholder="Viết bình luận..." required />
                    <button type="submit">Bình luận</button>
                </form>
            `;

            container.appendChild(div);
            container.appendChild(commentsWrap);

            // subscribe comments for this post
            try {
                subscribeToComments(docSnap.id, `comments-for-${docSnap.id}`);
            } catch (e) {
                console.error('subscribeToComments error for', docSnap.id, e);
            }

            // attach submit handler for comment form (delegated)
            const form = commentsWrap.querySelector('.comment-form');
            if (form) {
                // disable form if user not logged in
                const inputEl = form.querySelector('input[name="comment"]');
                const btnEl = form.querySelector('button[type="submit"]');
                if (!auth.currentUser) {
                    if (inputEl) inputEl.disabled = true;
                    if (btnEl) btnEl.disabled = true;
                    // show login hint
                    const hint = document.createElement('div');
                    hint.className = 'comment-login-hint';
                    hint.innerHTML = 'Vui lòng <a href="đăng-nhập.html">đăng nhập</a> để bình luận.';
                    commentsWrap.insertBefore(hint, form);
                }

                form.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const postId = form.getAttribute('data-post-id');
                    const input = form.querySelector('input[name="comment"]');
                    const text = input && input.value.trim();
                    if (!text) return;
                    try {
                        console.log('Submitting comment', { postId, text, user: auth.currentUser });
                        await addComment(postId, text);
                        input.value = '';
                        // update debug panel if present
                        try { updateDebugPanel(); } catch(e){}
                    } catch (err) {
                        console.error('addComment error', err);
                        // show informative alert including Firestore/auth error code when available
                        const code = err && err.code ? err.code : null;
                        const msg = err && err.message ? err.message : String(err);
                        if (code) {
                            alert(`Không thể gửi bình luận (${code}): ${msg}`);
                        } else {
                            alert(`Không thể gửi bình luận. Vui lòng thử lại.\n${msg}`);
                        }
                        // if not authenticated, redirect to login
                        if (msg && msg.includes('chưa đăng nhập')) {
                            window.location.href = './đăng-nhập.html';
                        }
                        // expose last error for debugging UI
                        try { window.__lastCommentError = { code, message: msg }; updateDebugPanel(); } catch(e){}
                    }
                });
            }
        });
    }, (err) => {
        console.error('posts onSnapshot error', err);
    });
    return unsubscribe;
}

// Add a comment under a post (requires authenticated user)
export async function addComment(postId, text) {
    const user = auth.currentUser;
    console.log('addComment called', { postId, text, user });
    if (!user) throw new Error('Người dùng chưa đăng nhập.');
    const colRef = collection(db, 'posts', postId, 'comments');
    try {
        await addDoc(colRef, {
            content: text,
            authorId: user.uid,
            authorName: user.displayName || user.email || 'Người dùng',
            createdAt: serverTimestamp()
        });
    } catch (err) {
        console.error('addDoc failed', err);
        // rethrow so caller sees it (but keep err.code available)
        throw err;
    }
}

// Subscribe to comments for a given post and render into containerId
export function subscribeToComments(postId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return () => {};
    const col = collection(db, 'posts', postId, 'comments');
    const q = query(col, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
        container.innerHTML = '';
        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            const div = document.createElement('div');
            div.className = 'comment-item';
            const time = data.createdAt && data.createdAt.seconds ? new Date(data.createdAt.seconds * 1000).toLocaleString() : '';
            div.innerHTML = `<strong>${escapeHtml(data.authorName || 'Người dùng')}</strong>: ${escapeHtml(data.content || '')} <br><small>${escapeHtml(time)}</small>`;
            container.appendChild(div);
        });
    }, (err) => { console.error('comments onSnapshot error', err); });
    return unsubscribe;
}

// enable or disable comment forms already rendered on the page
export function enableCommentForms(enable) {
    const forms = document.querySelectorAll('.comment-form');
    forms.forEach(form => {
        const input = form.querySelector('input[name="comment"]');
        const btn = form.querySelector('button[type="submit"]');
        if (input) input.disabled = !enable;
        if (btn) btn.disabled = !enable;
        // remove or add login hint
        const wrap = form.parentElement;
        if (!wrap) return;
        const existingHint = wrap.querySelector('.comment-login-hint');
        if (!enable && !existingHint) {
            const hint = document.createElement('div');
            hint.className = 'comment-login-hint';
            hint.innerHTML = 'Vui lòng <a href="đăng-nhập.html">đăng nhập</a> để bình luận.';
            wrap.insertBefore(hint, form);
        } else if (enable && existingHint) {
            existingHint.remove();
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// --- Simple Share UI handlers (preview selected file and send) ---
document.addEventListener('DOMContentLoaded', () => {
    const attachInput = document.getElementById('attach-file');
    const attachName = document.getElementById('attach-name');
    const sendBtn = document.getElementById('share-send');
    const shareText = document.getElementById('share-text');

    if (attachInput && attachName) {
        attachInput.addEventListener('change', (ev) => {
            const f = attachInput.files && attachInput.files[0];
            attachName.textContent = f ? f.name : 'Chưa chọn tệp';
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            const text = shareText ? shareText.value.trim() : '';
            // For now we only save text posts when user is logged in
            try {
                await savePost(text || '(Đính kèm)');
                alert('Cảm ơn! Chia sẻ đã được lưu.');
                if (shareText) shareText.value = '';
                if (attachName) attachName.textContent = 'Chưa chọn tệp';
                if (attachInput) attachInput.value = '';
            } catch (e) {
                console.error('share send error', e);
                alert('Không thể gửi. Vui lòng đăng nhập hoặc thử lại sau.');
            }
        });
    }
    const postsContainer = document.getElementById('posts-container');
    if (postsContainer) {
        try {
            // subscribe to real-time updates so new posts show up immediately
            subscribeToPosts('posts-container');
        } catch (err) {
            console.error('subscribeToPosts invocation failed', err);
        }
    }

    // Debug panel to help diagnose auth/comment issues (shows current user & last error)
    try {
        const existing = document.getElementById('debug-panel');
        if (!existing) {
            const panel = document.createElement('div');
            panel.id = 'debug-panel';
            panel.style.position = 'fixed';
            panel.style.right = '12px';
            panel.style.bottom = '12px';
            panel.style.background = 'rgba(0,0,0,0.7)';
            panel.style.color = '#fff';
            panel.style.padding = '8px 10px';
            panel.style.borderRadius = '8px';
            panel.style.fontSize = '12px';
            panel.style.zIndex = 9999;
            panel.style.maxWidth = '300px';
            panel.innerHTML = `<div><strong>Debug</strong></div><div id="debug-auth">Auth: ...</div><div id="debug-last">Last error: none</div>`;
            document.body.appendChild(panel);
        }
    } catch (e) { console.warn('debug panel create failed', e); }

    // helper to update debug panel (callable globally)
    window.updateDebugPanel = function() {
        try {
            const a = document.getElementById('debug-auth');
            const l = document.getElementById('debug-last');
            const u = auth && auth.currentUser;
            if (a) a.textContent = 'Auth: ' + (u ? (u.email || u.uid) : 'not signed in');
            const last = window.__lastCommentError || null;
            if (l) l.textContent = 'Last error: ' + (last ? (last.code ? last.code + ' — ' + last.message : last.message) : 'none');
        } catch (e) { /* ignore */ }
    };
    try { updateDebugPanel(); } catch(e){}
});

// ===== STREAK LOGIC: số ngày liên tiếp đăng nhập =====
function formatLocalDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return formatLocalDate(d);
}

export function updateStreak() {
    const key = 'loginStreak';
    const raw = localStorage.getItem(key);
    let data = raw ? JSON.parse(raw) : null;
    const today = formatLocalDate(new Date());

    if (data && data.last === today) {
        return data.streak || 1;
    }

    let streak = 1;
    if (data && data.last === yesterdayStr()) {
        streak = (data.streak || 0) + 1;
    }

    data = { last: today, streak };
    localStorage.setItem(key, JSON.stringify(data));
    return streak;
}

export function displayStreak(n) {
    // tìm phần tử hiển thị streak (hỗ trợ cả .consecutive-streak và .streak-badge)
    const el = document.querySelector('.consecutive-streak, .streak-badge');
    if (!el) return;
    if (n <= 0) el.textContent = '0 ngày';
    else if (n === 1) el.textContent = '1 ngày liên tiếp';
    else el.textContent = n + ' ngày liên tiếp';
}

export function initStreak() {
    try {
        const streak = updateStreak();
        displayStreak(streak);
        // Update hourly
        setInterval(() => {
            try {
                const s = updateStreak();
                displayStreak(s);
            } catch (e) {
                console.error('Streak update error', e);
            }
        }, 1000 * 60 * 60);
    } catch (e) {
        console.error('Streak init error', e);
    }
}

// ===== STUDY TIMER: tổng thời gian học =====
function loadTotalSeconds() {
    const raw = localStorage.getItem('totalStudySeconds');
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
}

function saveTotalSeconds(sec) {
    localStorage.setItem('totalStudySeconds', String(Math.max(0, Math.floor(sec))));
}

export function formatDuration(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours} giờ ${minutes} phút`;
    if (minutes > 0) return `${minutes} phút ${seconds} giây`;
    return `${seconds} giây`;
}

export function initStudyTimer() {
    try {
        // tìm phần tử hiển thị thời gian (hỗ trợ cả .total-study-time và .study-badge)
        const display = document.querySelector('.total-study-time, .study-badge');
        let total = loadTotalSeconds();
        let sessionSeconds = 0;
        let tick = null;

        function updateDisplay() {
            if (display) display.textContent = formatDuration(total + sessionSeconds);
        }
        function startTick() {
            if (tick) return;
            tick = setInterval(() => {
                sessionSeconds += 1;
                updateDisplay();
            }, 1000);
        }

        function stopTick() {
            if (tick) { clearInterval(tick); tick = null; }
        }

        updateDisplay();
        startTick();
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopTick(); else startTick();
        });
        window.addEventListener('beforeunload', () => {
            total += sessionSeconds;
            saveTotalSeconds(total);
        });
        return {
            getTotalSeconds: () => total + sessionSeconds,
            flush: () => { total += sessionSeconds; sessionSeconds = 0; saveTotalSeconds(total); updateDisplay(); }
        };
    } catch (e) {
        console.error('initStudyTimer error', e);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signup-form');
    const signupMsg = document.getElementById('signup-message');
    const btnGoogle = document.getElementById('btn-google');
    const loginForm = document.getElementById('login-form');
    const loginMsg = document.getElementById('login-message');

    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            try {
                await signInWithGoogle();
            } catch (e) {
                console.error('Google signin error', e);
                if (signupMsg) signupMsg.textContent = 'Lỗi đăng nhập Google: ' + (e.message || e);
                if (loginMsg) loginMsg.textContent = 'Lỗi đăng nhập Google: ' + (e.message || e);
            }
        });
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            if (signupMsg) { signupMsg.textContent = ''; signupMsg.style.color = ''; }
            const name = document.getElementById('displayName').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const password2 = document.getElementById('password2').value;

            if (password !== password2) {
                if (signupMsg) signupMsg.textContent = 'Mật khẩu nhập lại không khớp.';
                return;
            }

            try {
                const cred = await createUserWithEmailAndPassword(auth, email, password);
                if (name) {
                    try { await updateProfile(cred.user, { displayName: name }); } catch (e) { console.warn('updateProfile failed', e); }
                }
                if (signupMsg) { signupMsg.style.color = '#178f17'; signupMsg.textContent = 'Đăng ký thành công! Bạn đã được đăng nhập.'; }
                setTimeout(() => { window.location.href = './index.html'; }, 900);
            } catch (e) {
                console.error('signup error', e);
                if (signupMsg) { signupMsg.style.color = '#c0392b'; signupMsg.textContent = e.message || 'Lỗi đăng ký, thử lại.'; }
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            if (loginMsg) { loginMsg.textContent = ''; loginMsg.style.color = ''; }
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            try {
                const cred = await signInWithEmailAndPassword(auth, email, password);
                if (loginMsg) { loginMsg.style.color = '#178f17'; loginMsg.textContent = 'Đăng nhập thành công!'; }
                setTimeout(() => { window.location.href = './index.html'; }, 700);
            } catch (e) {
                console.error('login error', e);
                if (loginMsg) { loginMsg.style.color = '#c0392b'; loginMsg.textContent = e.message || 'Lỗi đăng nhập, thử lại.'; }
            }
        });
    }
});

// ===== AUTH UI + FIRESTORE SYNC =====
let _autoSyncInterval = null;

async function syncFromFirestore(uid) {
    try {
        const ref = doc(db, 'users', uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const data = snap.data() || {};

        // merge totalStudySeconds: keep the larger value
        const localTotal = loadTotalSeconds();
        const remoteTotal = Number(data.totalStudySeconds || 0);
        const mergedTotal = Math.max(localTotal, remoteTotal);
        saveTotalSeconds(mergedTotal);

        // merge streak: take the larger streak
        let localStreak = 0;
        try { const raw = localStorage.getItem('loginStreak'); localStreak = raw ? (JSON.parse(raw).streak || 0) : 0; } catch(e){}
        const remoteStreak = Number(data.streak || 0);
        const mergedStreak = Math.max(localStreak, remoteStreak);
        const today = formatLocalDate(new Date());
        localStorage.setItem('loginStreak', JSON.stringify({ last: today, streak: mergedStreak }));

        console.log('Synced from Firestore:', { mergedTotal, mergedStreak });
    } catch (e) {
        console.warn('syncFromFirestore failed', e);
    }
}

async function syncLocalToFirestore(uid) {
    try {
        const total = loadTotalSeconds();
        let streak = 0;
        try { const raw = localStorage.getItem('loginStreak'); streak = raw ? (JSON.parse(raw).streak || 0) : 0; } catch (e) {}
        const ref = doc(db, 'users', uid);
        await setDoc(ref, {
            totalStudySeconds: total,
            streak: streak,
            lastSynced: serverTimestamp()
        }, { merge: true });
        //console.log('Synced to Firestore', { total, streak });
    } catch (e) {
        console.warn('syncLocalToFirestore failed', e);
    }
}

function renderAuthArea(user) {
    // Tìm vùng header (hỗ trợ cả .nav3 và .nav)
    const nav = document.querySelector('.nav3, .nav');
    if (!nav) return null;
    let container = nav.querySelector('.user-area');
    if (!container) {
        container = document.createElement('div');
        container.className = 'user-area';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '8px';
        container.style.marginLeft = '12px';
        // nếu có một menu (.nav-item), chèn user-area ngay sau menu để giữ layout
        const menu = nav.querySelector('.nav-item');
        if (menu && menu.parentNode) menu.parentNode.insertBefore(container, menu.nextSibling);
        else nav.appendChild(container);
    }
    if (!user) {
        container.innerHTML = '';
        return container;
    }

    const photo = document.createElement('img');
    photo.src = user.photoURL || 'https://via.placeholder.com/36?text=U';
    photo.alt = user.displayName || user.email || 'User';
    photo.style.width = '36px';
    photo.style.height = '36px';
    photo.style.borderRadius = '50%';

    const name = document.createElement('span');
    name.textContent = user.displayName || user.email || 'Người dùng';
    name.style.fontWeight = '700';
    name.style.color = '#023A5A';

    const outBtn = document.createElement('button');
    outBtn.textContent = 'Đăng xuất';
    outBtn.className = 'button';
    outBtn.style.background = '#fff';
    outBtn.style.color = '#023A5A';
    outBtn.addEventListener('click', async () => {
        try {
            // flush local and sync before signout
            try { await syncLocalToFirestore(user.uid); } catch(e){}
            await signOutUser();
        } catch (e) { console.error('Sign out failed', e); }
    });

    container.innerHTML = '';
    container.appendChild(photo);
    container.appendChild(name);
    container.appendChild(outBtn);
    return container;
}

// Kiểm tra redirect result từ Google Sign-In
getRedirectResultAuth().then((result) => {
    if (result?.user) {
        console.log("Google Sign-In thành công sau redirect:", result.user.email);
    }
}).catch((error) => {
    console.error("Lỗi xử lý redirect:", error.message);
});

// listen for auth changes and sync
onAuthStateChanged(auth, async (user) => {
    try {
        // Cập nhật nav (ẩn/hiện các liên kết) theo trạng thái đăng nhập
        try { updateNavForAuth && updateNavForAuth(!!user); } catch(e) { console.warn('updateNavForAuth error', e); }
        if (user) {
            renderAuthArea(user);
            // enable comment forms when user logs in
            try { enableCommentForms(true); } catch(e) { /* ignore */ }
            try { if (window.updateDebugPanel) updateDebugPanel(); } catch(e){}
            // merge remote → local
            await syncFromFirestore(user.uid);
            // start periodic sync
            if (_autoSyncInterval) clearInterval(_autoSyncInterval);
            _autoSyncInterval = setInterval(() => syncLocalToFirestore(user.uid), 60 * 1000);
            // also sync once now
            await syncLocalToFirestore(user.uid);
            // ensure we flush on unload
            window.addEventListener('beforeunload', () => { try { syncLocalToFirestore(user.uid); } catch(e){} });
        } else {
            renderAuthArea(null);
            try { enableCommentForms(false); } catch(e) { /* ignore */ }
            try { if (window.updateDebugPanel) updateDebugPanel(); } catch(e){}
            if (_autoSyncInterval) { clearInterval(_autoSyncInterval); _autoSyncInterval = null; }
        }
    } catch (e) { console.error('onAuthStateChanged handler error', e); }
});

// Hàm hiển thị/ẩn các liên kết trong header theo trạng thái đăng nhập
function updateNavForAuth(isLoggedIn) {
    try {
        const anon = document.querySelectorAll('.anon-only');
        const authOnly = document.querySelectorAll('.auth-only');
        if (isLoggedIn) {
            anon.forEach(el => { el.style.display = 'none'; });
            authOnly.forEach(el => { el.style.display = ''; });
        } else {
            anon.forEach(el => { el.style.display = ''; });
            authOnly.forEach(el => { el.style.display = 'none'; });
        }
    } catch (e) { console.warn('updateNavForAuth failed', e); }
}

// Khi trang vừa load, cập nhật lần đầu dựa trên trạng thái hiện tại (nếu auth đã sẵn sàng)
document.addEventListener('DOMContentLoaded', () => {
    try {
        updateNavForAuth(!!auth.currentUser);
    } catch (e) { /* ignore */ }
});

// Gắn helper ra window để dễ debug từ DevTools (tùy chọn)
try {
    window.__updateNavForAuth = updateNavForAuth;
    window.__renderAuthArea = renderAuthArea;
    window.__auth = auth;
} catch (e) { /* ignore in older browsers */ }

// Đôi khi Firebase auth khởi tạo hơi muộn — thử render lại sau 800ms nếu cần
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            updateNavForAuth(!!auth.currentUser);
            renderAuthArea(auth.currentUser);
        } catch (e) { /* ignore */ }
    }, 800);
});
