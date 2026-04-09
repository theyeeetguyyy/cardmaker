// ============================================
// Admin.js — Admin Panel Logic
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// ============================================

const ADMIN_PASSWORD = 'admin123';

let allMembers = [];
// toastEl and showToast are already defined in app.js (loaded before this file)

// --- Enter key on password field ---
document.getElementById('adminPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
});

// --- Auto-restore session ---
(function checkSession() {
    if (sessionStorage.getItem('abmgvm_admin') === 'true') {
        showDashboard();
    }
})();

// --- Login ---
function attemptLogin() {
    const pwd     = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');

    if (pwd === ADMIN_PASSWORD) {
        sessionStorage.setItem('abmgvm_admin', 'true');
        errorEl.style.display = 'none';
        showDashboard();
    } else {
        errorEl.style.display = 'block';
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').focus();
    }
}

// --- Logout ---
function logout() {
    sessionStorage.removeItem('abmgvm_admin');
    allMembers = [];
    document.getElementById('adminDashboard').classList.remove('visible');
    document.getElementById('adminGate').style.display = 'block';
    document.getElementById('adminPassword').value = '';
}

// --- Show Dashboard ---
async function showDashboard() {
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('adminDashboard').classList.add('visible');

    if (allMembers.length > 0) {
        updateStats();
        filterMembers();
        return;
    }
    await loadMembers();
}

// --- Refresh ---
async function refreshMembers() {
    allMembers = [];
    const btn = document.getElementById('btnRefresh');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    await loadMembers();
    btn.disabled = false;
    btn.innerHTML = '🔄 Refresh';
    showToast('✅ Data refreshed!', 'success');
}

// --- Load Members (metadata only, no photos) ---
async function loadMembers() {
    try {
        const snapshot = await db.collection('members').orderBy('createdAt', 'desc').get();
        allMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateStats();
        renderTable(allMembers);
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

// --- Stats ---
function updateStats() {
    document.getElementById('statTotal').textContent = allMembers.length;

    const today = new Date().toDateString();
    let todayCount = 0;
    const stateSet = new Set();

    allMembers.forEach(m => {
        if (m.createdAt && new Date(m.createdAt).toDateString() === today) todayCount++;
        if (m.state) stateSet.add(m.state);
    });

    document.getElementById('statToday').textContent  = todayCount;
    document.getElementById('statStates').textContent = stateSet.size;
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
                <div onclick="viewMember('${m.id}')"
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
                        onclick="viewMember('${m.id}')"
                        title="View">👁️</button>
                <button class="btn-view"
                        style="background:rgba(255,153,51,0.2);color:var(--saffron);border-color:rgba(255,153,51,0.4);"
                        onclick="editMember('${m.id}')"
                        title="Edit">✏️</button>
                <button class="btn-view"
                        style="background:rgba(239,68,68,0.2);color:#ef4444;border-color:rgba(239,68,68,0.4);"
                        onclick="deleteMember('${m.id}')"
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
        filterMembers();
    } catch (err) {
        console.error('Delete error:', err);
        showToast('Error deleting member', 'error');
    }
}

// --- Filter / Search ---
function filterMembers() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!query) { renderTable(allMembers); return; }

    renderTable(allMembers.filter(m =>
        (m.name        && m.name.toLowerCase().includes(query))        ||
        (m.phone       && m.phone.includes(query))                      ||
        (m.city        && m.city.toLowerCase().includes(query))         ||
        (m.state       && m.state.toLowerCase().includes(query))        ||
        (m.membershipNo && m.membershipNo.includes(query))              ||
        (m.fatherName  && m.fatherName.toLowerCase().includes(query))   ||
        (m.dob         && m.dob.includes(query))                        ||
        (m.gender      && m.gender.toLowerCase().includes(query))       ||
        (m.aadhaar     && m.aadhaar.includes(query))
    ));
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
            ${photo
                ? `<img src="${photo}" style="width:120px;height:144px;object-fit:cover;border-radius:8px;border:2px solid var(--saffron);" alt="${escapeHtml(member.name || '')}">`
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
                    <button class="btn-download png" style="padding:8px 16px;font-size:0.8rem;" onclick="downloadMemberCardPNG('${member.id}')">
                        🖼️ PNG
                    </button>
                    <button class="btn-download pdf" style="padding:8px 16px;font-size:0.8rem;" onclick="downloadMemberCardPDF('${member.id}')">
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
    const rows = allMembers.map((m, i) => [
        i + 1,
        `"${(m.name        || '').replace(/"/g, '""')}"`,
        `"${(m.fatherName  || '').replace(/"/g, '""')}"`,
        m.dob         || '',
        m.gender      || '',
        m.phone       || '',
        m.aadhaar     || '',
        m.city        || '',
        m.state       || '',
        m.membershipNo || '',
        m.issuingDate  || ''
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
