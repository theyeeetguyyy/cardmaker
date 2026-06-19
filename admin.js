// ============================================
// Admin.js — Admin Panel Logic
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// ============================================

// ─── Admin Email Whitelist ───────────────────────────────────
// Add more admin emails to this array to grant access
const ADMIN_EMAILS = [
    'astitvabandil@gmail.com', 'laxmisalesefl@gmail.com', 'prakashchandramandil@gmail.com'
];

let allMembers = [];
let lastVisibleDoc = null;
let isLoadingMore = false;

// Sort state
let sortKey = 'createdAt';
let sortDir = 'desc'; // 'asc' | 'desc'
// toastEl and showToast are already defined in app.js (loaded before this file)

// ─── Firebase Google Auth ────────────────────────────────────

const googleProvider = new firebase.auth.GoogleAuthProvider();

function isAdminEmail(email) {
    return ADMIN_EMAILS.includes((email || '').toLowerCase());
}

// Listen for auth state changes (handles page reload, session restore)
auth.onAuthStateChanged(function (user) {
    const gate       = document.getElementById('adminGate');
    const dashboard  = document.getElementById('adminDashboard');
    const loadingEl  = document.getElementById('authLoading');
    const errorEl    = document.getElementById('loginError');
    const signInBtn  = document.getElementById('btnGoogleSignIn');

    if (user && isAdminEmail(user.email)) {
        // Authenticated admin — show dashboard
        if (errorEl) errorEl.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'none';
        showDashboard();
    } else if (user && !isAdminEmail(user.email)) {
        // Signed in but NOT an admin — sign them out and show error
        auth.signOut();
        if (gate) gate.style.display = 'block';
        if (dashboard) dashboard.classList.remove('visible');
        if (errorEl) errorEl.style.display = 'block';
        if (signInBtn) signInBtn.style.display = '';
        if (loadingEl) loadingEl.style.display = 'none';
    } else {
        // Not signed in — show login gate
        if (gate) gate.style.display = 'block';
        if (dashboard) dashboard.classList.remove('visible');
        if (errorEl) errorEl.style.display = 'none';
        if (signInBtn) signInBtn.style.display = '';
        if (loadingEl) loadingEl.style.display = 'none';
    }
});

async function signInWithGoogle() {
    const errorEl   = document.getElementById('loginError');
    const loadingEl = document.getElementById('authLoading');
    const signInBtn = document.getElementById('btnGoogleSignIn');

    try {
        if (errorEl) errorEl.style.display = 'none';
        if (signInBtn) signInBtn.style.display = 'none';
        if (loadingEl) loadingEl.style.display = 'block';

        await auth.signInWithPopup(googleProvider);
        // onAuthStateChanged will handle the rest
    } catch (err) {
        console.error('Google Sign-In error:', err);
        if (signInBtn) signInBtn.style.display = '';
        if (loadingEl) loadingEl.style.display = 'none';

        if (err.code === 'auth/popup-closed-by-user') {
            // User closed the popup, do nothing
        } else if (err.code === 'auth/cancelled-popup-request') {
            // Multiple popups, ignore
        } else {
            if (errorEl) {
                errorEl.textContent = `❌ Login failed: ${err.message}`;
                errorEl.style.display = 'block';
            }
        }
    }
}

// --- Logout ---
async function logout() {
    try {
        await auth.signOut();
    } catch (e) {
        console.error('Sign out error:', e);
    }
    allMembers = [];
    document.getElementById('adminDashboard').classList.remove('visible');
    document.getElementById('adminGate').style.display = 'block';
}

// --- Show Dashboard ---
async function showDashboard() {
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('adminDashboard').classList.add('visible');

    if (allMembers.length > 0) {
        renderTable(allMembers);
        updateStats();
        return;
    }
    await loadMembers();
}

// --- Update Stats (computed from loaded allMembers) ---
function updateStats() {
    const total = allMembers.length;
    document.getElementById('statTotal').textContent = total;

    // Today count — createdAt is stored as ISO string e.g. "2026-05-01T..."
    const todayPrefix = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const todayCount  = allMembers.filter(m => (m.createdAt || '').startsWith(todayPrefix)).length;
    document.getElementById('statToday').textContent = todayCount;

    // Unique states
    const statesSet = new Set(allMembers.map(m => (m.state || '').trim()).filter(Boolean));
    document.getElementById('statStates').textContent = statesSet.size;

    // Populate state filter dropdown
    populateStateFilter(statesSet);
}

function populateStateFilter(statesSet) {
    const sel = document.getElementById('filterState');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">All States</option>';
    [...statesSet].sort().forEach(s => {
        const opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        if (s === current) opt.selected = true;
        sel.appendChild(opt);
    });
}

// --- Refresh ---
async function refreshMembers() {
    allMembers = [];
    lastVisibleDoc = null;
    const btn = document.getElementById('btnRefresh');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    // Reset filters
    const si = document.getElementById('searchInput');
    const fg = document.getElementById('filterGender');
    const fs = document.getElementById('filterState');
    if (si) si.value = '';
    if (fg) fg.value = '';
    if (fs) fs.value = '';
    await loadMembers();
    btn.disabled = false;
    btn.innerHTML = '🔄 Refresh';
    showToast('✅ Data refreshed!', 'success');
}

// --- Load Members (metadata only, no photos) ---
async function loadMembers() {
    try {
        const snapshot = await db.collection('members').orderBy('createdAt', 'desc').limit(100).get();
        if (!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        }
        allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateStats();
        applyFiltersAndRender();

        const loadMoreBtn = document.getElementById('btnLoadMore');
        if (loadMoreBtn) loadMoreBtn.style.display = snapshot.docs.length < 100 ? 'none' : 'block';
    } catch (err) {
        console.error('Error loading members:', err);
        document.getElementById('membersTableBody').innerHTML = `
            <tr>
                <td colspan="13" style="text-align:center;padding:40px;color:var(--red);">
                    ❌ Error loading data. Check Firebase configuration.
                    <br><small style="color:var(--gray-500);">${err.message}</small>
                </td>
            </tr>`;
    }
}

// --- Load More Members ---
async function loadMoreMembers() {
    if (isLoadingMore || !lastVisibleDoc) return;
    isLoadingMore = true;
    const btn = document.getElementById('btnLoadMore');
    if (btn) btn.innerHTML = '<span class="spinner"></span> Loading...';

    try {
        const snapshot = await db.collection('members').orderBy('createdAt', 'desc').startAfter(lastVisibleDoc).limit(100).get();
        if (!snapshot.empty) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
            const newMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            allMembers = [...allMembers, ...newMembers];
            updateStats();
            applyFiltersAndRender();
        }

        if (btn) {
            btn.innerHTML = '🔽 Load More Members';
            btn.style.display = snapshot.docs.length < 100 ? 'none' : 'block';
        }
    } catch (err) {
        console.error('Error loading more members:', err);
        showToast('Error loading more members.', 'error');
        if (btn) btn.innerHTML = '🔽 Load More Members';
    } finally {
        isLoadingMore = false;
    }
}

// --- Render Table ---
function renderTable(members) {
    const tbody = document.getElementById('membersTableBody');

    if (members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="13" style="text-align:center;padding:40px;color:var(--gray-500);">
                    कोई सदस्य नहीं मिला — No members found
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = members.map((m, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>
                <div onclick="viewMember('${escapeHtml(m.id)}')"
                     title="Click to view photo"
                     style="width:40px;height:48px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);
                            border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;">
                    📷
                </div>
            </td>
            <td style="font-weight:600;color:var(--white);">${escapeHtml(m.name       || '—')}</td>
            <td>${escapeHtml(m.fatherName  || '—')}</td>
            <td>${escapeHtml(m.dob         || '—')}</td>
            <td>${escapeHtml(m.gender      || '—')}</td>
            <td>${escapeHtml(m.phone       || '—')}</td>
            <td>${escapeHtml(m.aadhaar     || '—')}</td>
            <td>${escapeHtml(m.city        || '—')}</td>
            <td>${escapeHtml(m.state       || '—')}</td>
            <td style="color:var(--saffron);font-weight:700;">${escapeHtml(m.membershipNo || '—')}</td>
            <td>${escapeHtml(m.issuingDate || '—')}</td>
            <td style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn-view"
                        onclick="viewMember('${escapeHtml(m.id)}')"
                        title="View">👁️</button>
                <button class="btn-view"
                        style="background:rgba(255,153,51,0.2);color:var(--saffron);border-color:rgba(255,153,51,0.4);"
                        onclick="editMember('${escapeHtml(m.id)}')"
                        title="Edit">✏️</button>
                <button class="btn-view"
                        style="background:rgba(239,68,68,0.2);color:#ef4444;border-color:rgba(239,68,68,0.4);"
                        onclick="deleteMember('${escapeHtml(m.id)}')"
                        title="Delete">🗑️</button>
            </td>
        </tr>
    `).join('');
}

// --- Edit Member ---
function editMember(id) {
    window.location.href = `index.html?edit=${id}`;
}

// --- Delete Member ---
async function deleteMember(id) {
    if (!confirm('Are you sure you want to permanently delete this member?')) return;
    try {
        const batch = db.batch();
        batch.delete(db.collection('members').doc(id));
        batch.delete(db.collection('memberPhotos').doc(id));
        await batch.commit();
        showToast('🗑️ Member deleted successfully', 'success');
        allMembers = allMembers.filter(m => m.id !== id);
        updateStats();
        applyFiltersAndRender();
    } catch (err) {
        console.error('Delete error:', err);
        const msg = err.code === 'permission-denied'
            ? '❌ Permission denied — check Firestore rules.'
            : `❌ Delete failed: ${err.message}`;
        showToast(msg, 'error');
    }
}

// --- Sort by column header ---
function sortBy(key) {
    if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey = key;
        sortDir = 'asc';
    }
    updateSortIndicators();
    applyFiltersAndRender();
}

function updateSortIndicators() {
    document.querySelectorAll('.members-table th[data-sort]').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.sort === sortKey) {
            th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// --- Apply filters + sort, then render ---
function applyFiltersAndRender() {
    const query  = (document.getElementById('searchInput')?.value  || '').toLowerCase().trim();
    const gender = (document.getElementById('filterGender')?.value || '').toLowerCase();
    const state  = (document.getElementById('filterState')?.value  || '').toLowerCase();

    let filtered = allMembers.filter(m => {
        if (gender && (m.gender || '').toLowerCase() !== gender) return false;
        if (state  && (m.state  || '').toLowerCase() !== state)  return false;
        if (query) {
            return (
                (m.name         && m.name.toLowerCase().includes(query))         ||
                (m.phone        && m.phone.includes(query))                       ||
                (m.city         && m.city.toLowerCase().includes(query))          ||
                (m.state        && m.state.toLowerCase().includes(query))         ||
                (m.membershipNo && m.membershipNo.toLowerCase().includes(query))  ||
                (m.fatherName   && m.fatherName.toLowerCase().includes(query))    ||
                (m.dob          && m.dob.includes(query))                         ||
                (m.gender       && m.gender.toLowerCase().includes(query))        ||
                (m.aadhaar      && m.aadhaar.includes(query))
            );
        }
        return true;
    });

    // Sort
    filtered.sort((a, b) => {
        let av = (a[sortKey] || '').toLowerCase();
        let bv = (b[sortKey] || '').toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ?  1 : -1;
        return 0;
    });

    renderTable(filtered);
}

// Keep old name for inline oninput handlers
function filterMembers() { applyFiltersAndRender(); }

// --- Server DB Search ---
async function searchDatabase() {
    const q = document.getElementById('serverSearchInput').value.trim();
    if (!q) {
        showToast('Please enter a phone, aadhaar, or member No to search.', 'error');
        return;
    }
    
    const digits = q.replace(/\D/g, '');
    let snapshot;
    const btn = document.getElementById('btnSearchDB');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;

    try {
        if (digits.length === 10) {
            // Search by Phone
            snapshot = await db.collection('members').where('phone', '==', digits).get();
        } else if (digits.length === 12) {
            // Format Aadhaar exactly how it's stored
            let formattedAadhaar = '';
            for (let i = 0; i < digits.length; i++) {
                if (i > 0 && i % 4 === 0) formattedAadhaar += ' ';
                formattedAadhaar += digits[i];
            }
            snapshot = await db.collection('members').where('aadhaar', '==', formattedAadhaar).get();
        } else if (/^(JM|S\/)/i.test(q)) {
            // Search by Member No — supports both JM prefix and legacy S/ prefix
            snapshot = await db.collection('members').where('membershipNo', '==', q.toUpperCase()).get();
        } else {
            showToast('Enter a valid 10-digit phone, 12-digit Aadhaar, or Member No (JM...).', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        if (snapshot.empty) {
            showToast('❌ No matching record found in the database.', 'error');
        } else {
            allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderTable(allMembers);
            
            // Hide the load more button since we're displaying isolated search results
            const loadMoreBtn = document.getElementById('btnLoadMore');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            
            showToast('✅ Record found!', 'success');
        }
    } catch (e) {
        console.error(e);
        showToast('Error searching database.', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- View Member Details ---
async function viewMember(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `<div style="text-align:center;padding:20px;color:var(--gray-500);">
        <span class="spinner"></span> Loading...
    </div>`;
    document.getElementById('memberModal').classList.add('visible');

    let photo = null;
    try {
        const snap = await db.collection('memberPhotos').doc(memberId).get();
        if (snap.exists) photo = snap.data().photo;
    } catch (e) {
        console.warn('Could not load photo:', e);
    }

    // Sanitize photo: only allow data: URLs (base64) — block any other scheme
    const safePhoto = (photo && typeof photo === 'string' && photo.startsWith('data:image/')) ? photo : null;

    modalBody.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <h3 style="color:var(--saffron);font-family:var(--font-hindi);font-size:1.3rem;">
                ${escapeHtml(member.name || '—')}
            </h3>
            <p style="color:var(--gray-500);font-size:0.8rem;">
                Membership No: ${escapeHtml(member.membershipNo || '—')}
            </p>
        </div>

        <div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;justify-content:center;">
            ${safePhoto
                ? `<img src="${safePhoto}" style="width:120px;height:144px;object-fit:cover;border-radius:8px;border:2px solid var(--saffron);" alt="${escapeHtml(member.name || '')}">`
                : '<div style="width:120px;height:144px;background:rgba(255,255,255,0.05);border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--gray-500);">📷</div>'
            }
            <div style="flex:1;min-width:200px;">
                <table style="width:100%;font-size:0.9rem;border-collapse:collapse;text-align:left;">
                    <tr><td style="padding:4px 0;color:var(--gray-400);">Name</td>     <td style="padding:4px 0;color:var(--white);font-weight:600;">${escapeHtml(member.name       || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">Father</td>   <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.fatherName  || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">DOB</td>      <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.dob         || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">Gender</td>   <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.gender      || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">Phone</td>    <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.phone       || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">Aadhaar</td>  <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.aadhaar     || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">City</td>     <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.city        || '—')}</td></tr>
                    <tr><td style="padding:4px 0;color:var(--gray-400);">State</td>    <td style="padding:4px 0;color:var(--white);">${escapeHtml(member.state       || '—')}</td></tr>
                </table>
                <div style="margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="btn-download png" style="padding:8px 16px;font-size:0.8rem;" onclick="downloadMemberCardPNG('${escapeHtml(member.id)}')">
                        🖼️ PNG
                    </button>
                    <button class="btn-download pdf" style="padding:8px 16px;font-size:0.8rem;" onclick="downloadMemberCardPDF('${escapeHtml(member.id)}')">
                        📄 PDF
                    </button>
                </div>
            </div>
        </div>
    `;
}

function closeModal() {
    document.getElementById('memberModal').classList.remove('visible');
}

document.getElementById('memberModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
});

// --- Export CSV ---
function exportCSV() {
    if (allMembers.length === 0) {
        showToast('कोई डेटा नहीं है! No data to export.', 'error');
        return;
    }

    const headers = ['#', 'Name', 'Father Name', 'DOB', 'Gender', 'Phone', 'Aadhaar', 'City', 'State', 'Membership No', 'Issuing Date'];

    // Helper: wrap every field in quotes and escape internal quotes
    function csvField(val) {
        const str = String(val || '').replace(/"/g, '""');
        return `"${str}"`;
    }

    const rows = allMembers.map((m, i) => [
        i + 1,
        csvField(m.name),
        csvField(m.fatherName),
        csvField(m.dob),
        csvField(m.gender),
        csvField(m.phone),
        csvField(m.aadhaar),
        csvField(m.city),
        csvField(m.state),
        csvField(m.membershipNo),
        csvField(m.issuingDate)
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => { csv += row.join(',') + '\n'; });

    const blob    = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link    = document.createElement('a');
    link.href     = blobUrl;
    link.download = `ABMGVM_Members_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(blobUrl);
    showToast('✅ CSV exported!', 'success');
}

// --- Fetch photo for a member ---
async function fetchMemberPhoto(memberId) {
    try {
        const snap = await db.collection('memberPhotos').doc(memberId).get();
        return snap.exists ? snap.data().photo : null;
    } catch (e) {
        return null;
    }
}

// --- Admin card downloads ---
async function downloadMemberCardPNG(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;
    showToast('🖼️ PNG बन रहा है...', 'success');
    try {
        const photo = await fetchMemberPhoto(memberId);
        const memberWithPhoto = { ...member, photo };

        const frontCanvas = document.createElement('canvas');
        frontCanvas.width = 1500; frontCanvas.height = 930;
        await drawCardFront(frontCanvas, memberWithPhoto);

        const backCanvas = document.createElement('canvas');
        backCanvas.width = 1500; backCanvas.height = 930;
        await drawCardBack(backCanvas, memberWithPhoto);

        const combined = document.createElement('canvas');
        combined.width = 1500; combined.height = 1920;
        const ctx = combined.getContext('2d');
        ctx.fillStyle = '#1a2d5a';
        ctx.fillRect(0, 0, combined.width, combined.height);
        ctx.drawImage(frontCanvas, 0, 0);
        ctx.drawImage(backCanvas, 0, 990);

        const link = document.createElement('a');
        link.download = `ABMGVM_Card_${(member.name || 'Member').replace(/\s+/g, '_')}.png`;
        link.href = combined.toDataURL('image/png');
        link.click();
        showToast('✅ PNG डाउनलोड हो गया!', 'success');
    } catch (err) {
        console.error(err);
        showToast('PNG डाउनलोड में त्रुटि!', 'error');
    }
}

async function downloadMemberCardPDF(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;
    showToast('📄 PDF बन रहा है...', 'success');
    try {
        const photo = await fetchMemberPhoto(memberId);
        const memberWithPhoto = { ...member, photo };

        const frontCanvas = document.createElement('canvas');
        frontCanvas.width = 1500; frontCanvas.height = 930;
        await drawCardFront(frontCanvas, memberWithPhoto);

        const backCanvas = document.createElement('canvas');
        backCanvas.width = 1500; backCanvas.height = 930;
        await drawCardBack(backCanvas, memberWithPhoto);

        const { jsPDF } = window.jspdf;
        const cardW = 85.6, cardH = 53.98;
        const pdf   = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const xOff  = (pageW - cardW) / 2;

        pdf.setFillColor(245, 245, 245);
        pdf.rect(0, 0, pageW, pdf.internal.pageSize.getHeight(), 'F');
        pdf.setFontSize(11); pdf.setTextColor(26, 45, 90);
        pdf.text('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', pageW / 2, 14, { align: 'center' });
        pdf.setFontSize(8); pdf.setTextColor(80, 80, 80);
        pdf.text('Membership Card', pageW / 2, 20, { align: 'center' });
        pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', xOff, 26, cardW, cardH);
        pdf.addImage(backCanvas.toDataURL('image/png'),  'PNG', xOff, 26 + cardH + 12, cardW, cardH);

        pdf.save(`ABMGVM_Card_${(member.name || 'Member').replace(/\s+/g, '_')}.pdf`);
        showToast('✅ PDF डाउनलोड हो गया!', 'success');
    } catch (err) {
        console.error(err);
        showToast('PDF डाउनलोड में त्रुटि!', 'error');
    }
}

// --- XSS escape ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Progress overlay helpers ──────────────────────────────────────────────

function showProgress(icon, title, msg) {
    const el = document.getElementById('progressOverlay');
    document.getElementById('progressIcon').textContent  = icon;
    document.getElementById('progressTitle').textContent = title;
    document.getElementById('progressMsg').textContent   = msg;
    document.getElementById('progressBar').style.width   = '0%';
    document.getElementById('progressCount').textContent = '';
    el.style.display = 'flex';
}

function updateProgress(done, total, msg) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    document.getElementById('progressBar').style.width   = pct + '%';
    document.getElementById('progressCount').textContent = `${done} / ${total}`;
    if (msg) document.getElementById('progressMsg').textContent = msg;
}

function hideProgress() {
    document.getElementById('progressOverlay').style.display = 'none';
}

// ─── Full JSON Backup (Export All) ────────────────────────────────────────

async function exportAllData() {
    const btn = document.getElementById('btnExportAll');
    const orig = btn.innerHTML;

    try {
        btn.disabled = true;
        showProgress('📦', 'Fetching all members...', 'Please wait, do not close this tab.');

        // ── Step 1: Paginate through ALL members (no 100-limit) ──
        let allDocs = [];
        let lastDoc = null;

        while (true) {
            let q = db.collection('members').orderBy('createdAt', 'desc').limit(500);
            if (lastDoc) q = q.startAfter(lastDoc);
            const snap = await q.get();
            if (snap.empty) break;
            allDocs = allDocs.concat(snap.docs);
            lastDoc = snap.docs[snap.docs.length - 1];
            updateProgress(allDocs.length, allDocs.length, `Fetched ${allDocs.length} members...`);
            if (snap.docs.length < 500) break;
        }

        const total = allDocs.length;
        if (total === 0) {
            hideProgress();
            showToast('No members found to export.', 'error');
            return;
        }

        // ── Step 2: Load photos in parallel batches of 50 ──
        showProgress('📷', 'Loading photos...', `0 / ${total} photos loaded`);
        const members = [];
        const PHOTO_BATCH = 50;

        for (let i = 0; i < allDocs.length; i += PHOTO_BATCH) {
            const chunk = allDocs.slice(i, i + PHOTO_BATCH);

            const photos = await Promise.all(
                chunk.map(doc =>
                    db.collection('memberPhotos').doc(doc.id).get()
                        .then(ps => (ps.exists ? ps.data().photo : null))
                        .catch(() => null)
                )
            );

            chunk.forEach((doc, j) => {
                const data = doc.data();
                // _id is stored separately so restore can use exact Firestore doc IDs
                members.push({ _id: doc.id, ...data, photo: photos[j] || null });
            });

            updateProgress(Math.min(i + PHOTO_BATCH, total), total,
                `${Math.min(i + PHOTO_BATCH, total)} / ${total} photos loaded`);
        }

        // ── Step 3: Bundle and download ──
        updateProgress(total, total, 'Packaging file...');

        const payload = {
            version:    2,
            exportedAt: new Date().toISOString(),
            exportedBy: auth?.currentUser?.email || 'admin',
            count:      members.length,
            members
        };

        const json = JSON.stringify(payload);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `ABMGVM_Backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);

        hideProgress();
        showToast(`✅ Backup complete — ${members.length} members exported!`, 'success');

    } catch (err) {
        console.error('Export error:', err);
        hideProgress();
        showToast(`❌ Backup failed: ${err.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ─── Full JSON Restore (Import All) ───────────────────────────────────────

function triggerImport() {
    document.getElementById('importFileInput').click();
}

async function handleImportFile(e) {
    const file = e.target.files[0];
    e.target.value = ''; // reset so same file can re-trigger
    if (!file) return;

    // ── Parse file ──
    let payload;
    try {
        payload = JSON.parse(await file.text());
    } catch {
        showToast('❌ Could not parse file. Make sure it is a valid ABMGVM backup JSON.', 'error');
        return;
    }

    if (!payload.members || !Array.isArray(payload.members) || payload.members.length === 0) {
        showToast('❌ Invalid backup file — no members array found.', 'error');
        return;
    }

    const count      = payload.members.length;
    const exportDate = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString('en-IN') : 'unknown date';

    // ── Confirm ──
    const confirmed = confirm(
        `📥 Restore Backup\n\n` +
        `File: ${file.name}\n` +
        `Members: ${count}\n` +
        `Backup date: ${exportDate}\n\n` +
        `⚠️ Existing records with matching IDs will be OVERWRITTEN.\n` +
        `New records will be ADDED.\n\n` +
        `Proceed?`
    );
    if (!confirmed) return;

    const btn  = document.getElementById('btnImport');
    const orig = btn.innerHTML;

    try {
        btn.disabled = true;
        showProgress('📥', 'Restoring backup...', 'Writing members to database...');

        // ── Batch write in chunks of 200 (= 400 Firestore ops, under 500 limit) ──
        const CHUNK      = 200;
        let   imported   = 0;
        let   maxCounter = 0;

        for (let i = 0; i < payload.members.length; i += CHUNK) {
            const chunk = payload.members.slice(i, i + CHUNK);
            const batch = db.batch();

            chunk.forEach(m => {
                const { _id, photo, ...meta } = m;

                // Resolve doc ID — use stored _id if valid, else generate new
                const docId = (typeof _id === 'string' && _id.length > 0)
                    ? _id
                    : db.collection('members').doc().id;

                // Track highest membership number for counter sync
                if (meta.membershipNo) {
                    const num = parseInt((meta.membershipNo || '').replace(/\D/g, ''), 10);
                    if (!isNaN(num) && num > maxCounter) maxCounter = num;
                }

                // Write member metadata (set = create-or-overwrite)
                batch.set(db.collection('members').doc(docId), {
                    name:         meta.name         || '',
                    fatherName:   meta.fatherName   || '',
                    dob:          meta.dob          || '',
                    gender:       meta.gender       || '',
                    aadhaar:      meta.aadhaar      || '',
                    phone:        meta.phone        || '',
                    city:         meta.city         || '',
                    state:        meta.state        || '',
                    membershipNo: meta.membershipNo || '',
                    issuingDate:  meta.issuingDate  || '',
                    createdAt:    meta.createdAt    || new Date().toISOString(),
                    ...(meta.updatedAt ? { updatedAt: meta.updatedAt } : {})
                });

                // Write photo separately (null-safe)
                batch.set(db.collection('memberPhotos').doc(docId), {
                    photo: (typeof photo === 'string' && photo.startsWith('data:')) ? photo : null
                });
            });

            await batch.commit();
            imported += chunk.length;
            updateProgress(imported, count, `${imported} / ${count} members written...`);
        }

        // ── Sync membership counter ──
        if (maxCounter > 0) {
            try {
                const counterRef  = db.collection('meta').doc('counter');
                const counterSnap = await counterRef.get();
                const currentVal  = counterSnap.exists ? (counterSnap.data().value || 0) : 0;
                if (maxCounter > currentVal) {
                    await counterRef.set({ value: maxCounter });
                    console.log(`Counter synced to ${maxCounter}`);
                }
            } catch (counterErr) {
                console.warn('Counter sync failed (non-fatal):', counterErr);
            }
        }

        updateProgress(count, count, 'Done! Refreshing table...');

        // ── Reload table ──
        allMembers    = [];
        lastVisibleDoc = null;
        await loadMembers();

        hideProgress();
        showToast(`✅ Restore complete — ${imported} members imported!`, 'success');

    } catch (err) {
        console.error('Import error:', err);
        hideProgress();
        showToast(`❌ Restore failed: ${err.message}`, 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = orig;
    }
}
