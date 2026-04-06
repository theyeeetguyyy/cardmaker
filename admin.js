// ============================================
// Admin.js — Admin Panel Logic
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// Uses Firebase Realtime Database
// ============================================

let allMembers = [];
const toastEl = document.getElementById('toast');

// --- Enter key for login ---
document.getElementById('adminPassword').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') attemptLogin();
});

// --- Check if already logged in ---
(function checkSession() {
    if (sessionStorage.getItem('abmgvm_admin') === 'true') {
        showDashboard();
    }
})();

// --- Login ---
function attemptLogin() {
    const pwd = document.getElementById('adminPassword').value;
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
    document.getElementById('adminDashboard').classList.remove('visible');
    document.getElementById('adminGate').style.display = 'block';
    document.getElementById('adminPassword').value = '';
}

// --- Show Dashboard ---
async function showDashboard() {
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('adminDashboard').classList.add('visible');
    await loadMembers();
}

// --- Load Members from Firebase Realtime Database ---
async function loadMembers() {
    try {
        const snapshot = await db.ref('members').orderByChild('createdAt').once('value');
        
        allMembers = [];
        if (snapshot.exists()) {
            snapshot.forEach(childSnap => {
                allMembers.push({ id: childSnap.key, ...childSnap.val() });
            });
        }

        // Reverse to show newest first
        allMembers.reverse();

        updateStats();
        renderTable(allMembers);

    } catch (err) {
        console.error('Error loading members:', err);
        document.getElementById('membersTableBody').innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: var(--red);">
                    ❌ Error loading data. Check Firebase configuration.
                    <br><small style="color: var(--gray-500);">${err.message}</small>
                </td>
            </tr>
        `;
    }
}

// --- Update Stats ---
function updateStats() {
    document.getElementById('statTotal').textContent = allMembers.length;

    // Count today's members
    const today = new Date().toDateString();
    let todayCount = 0;
    const stateSet = new Set();

    allMembers.forEach(m => {
        if (m.createdAt) {
            const memberDate = new Date(m.createdAt);
            if (memberDate.toDateString() === today) todayCount++;
        }
        if (m.state) stateSet.add(m.state);
    });

    document.getElementById('statToday').textContent = todayCount;
    document.getElementById('statStates').textContent = stateSet.size;
}

// --- Render Table ---
function renderTable(members) {
    const tbody = document.getElementById('membersTableBody');

    if (members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: var(--gray-500);">
                    कोई सदस्य नहीं मिला — No members found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = members.map((m, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>
                ${m.photo
                    ? `<img src="${m.photo}" class="member-photo-thumb" alt="${escapeHtml(m.name || '')}">`
                    : '<span style="color: var(--gray-500);">N/A</span>'
                }
            </td>
            <td style="font-weight: 600; color: var(--white);">${escapeHtml(m.name || '—')}</td>
            <td>${escapeHtml(m.fatherName || '—')}</td>
            <td>${escapeHtml(m.phone || '—')}</td>
            <td>${escapeHtml(m.aadhaar || '—')}</td>
            <td>${escapeHtml(m.city || '—')}</td>
            <td>${escapeHtml(m.state || '—')}</td>
            <td style="color: var(--saffron); font-weight: 700;">${escapeHtml(m.membershipNo || '—')}</td>
            <td>${escapeHtml(m.issuingDate || '—')}</td>
            <td>
                <button class="btn-view" onclick="viewMember('${m.id}')">👁️ View</button>
            </td>
        </tr>
    `).join('');
}

// --- Filter Members ---
function filterMembers() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();

    if (!query) {
        renderTable(allMembers);
        return;
    }

    const filtered = allMembers.filter(m =>
        (m.name && m.name.toLowerCase().includes(query)) ||
        (m.phone && m.phone.includes(query)) ||
        (m.city && m.city.toLowerCase().includes(query)) ||
        (m.state && m.state.toLowerCase().includes(query)) ||
        (m.membershipNo && m.membershipNo.includes(query)) ||
        (m.fatherName && m.fatherName.toLowerCase().includes(query))
    );

    renderTable(filtered);
}

// --- View Member Details ---
function viewMember(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <h3 style="color: var(--saffron); font-family: var(--font-hindi); margin-bottom: 4px;">
                सदस्य विवरण — Member Details
            </h3>
            <p style="color: var(--gray-500); font-size: 0.8rem;">
                Membership No: ${escapeHtml(member.membershipNo || '—')}
            </p>
        </div>

        <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; justify-content: center;">
            ${member.photo
                ? `<img src="${member.photo}" style="width: 120px; height: 144px; object-fit: cover; border-radius: 8px; border: 2px solid var(--saffron);" alt="${escapeHtml(member.name || '')}">`
                : ''
            }
            <div style="flex: 1; min-width: 200px;">
                </table>
                <div style="margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="btn-download png" style="padding: 8px 16px; font-size: 0.8rem;" onclick="downloadMemberCardPNG('${member.id}')">
                        🖼️ PNG
                    </button>
                    <button class="btn-download pdf" style="padding: 8px 16px; font-size: 0.8rem;" onclick="downloadMemberCardPDF('${member.id}')">
                        📄 PDF
                    </button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('memberModal').classList.add('visible');
}

// --- Close Modal ---
function closeModal() {
    document.getElementById('memberModal').classList.remove('visible');
}

// Close modal on overlay click
document.getElementById('memberModal').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
});

// Close modal on Escape
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
});

// --- Export CSV ---
function exportCSV() {
    if (allMembers.length === 0) {
        showToast('कोई डेटा नहीं है! No data to export.', 'error');
        return;
    }

    const headers = ['#', 'Name', 'Father Name', 'Phone', 'Aadhaar', 'City', 'State', 'Membership No', 'Issuing Date'];
    const rows = allMembers.map((m, i) => [
        i + 1,
        `"${(m.name || '').replace(/"/g, '""')}"`,
        `"${(m.fatherName || '').replace(/"/g, '""')}"`,
        m.phone || '',
        m.aadhaar || '',
        m.city || '',
        m.state || '',
        m.membershipNo || '',
        m.issuingDate || ''
    ]);

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.join(',') + '\n';
    });

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ABMGVM_Members_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    showToast('✅ CSV डाउनलोड हो गया! CSV exported!', 'success');
}

// --- Card Download Logic for Admin ---

function populateRenderCard(data) {
    // Kept empty in case HTML-reference is still needed briefly, 
    // but canvas draws directly from the 'data' object now.
}

async function downloadMemberCardPNG(memberId) {
    const member = allMembers.find(m => m.id === memberId);
    if (!member) return;
    
    showToast('🖼️ PNG बन रहा है... Generating PNG...', 'success');

    try {
        const frontCanvas = document.createElement('canvas');
        frontCanvas.width = 1500;
        frontCanvas.height = 930;
        await drawCardFront(frontCanvas, member);

        const backCanvas = document.createElement('canvas');
        backCanvas.width = 1500;
        backCanvas.height = 930;
        await drawCardBack(backCanvas, member);

        const gap = 60;
        const combinedCanvas = document.createElement('canvas');
        combinedCanvas.width = 1500;
        combinedCanvas.height = 930 * 2 + gap;
        const ctx = combinedCanvas.getContext('2d');
        ctx.fillStyle = '#1a2d5a';
        ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
        ctx.drawImage(frontCanvas, 0, 0);
        ctx.drawImage(backCanvas, 0, 930 + gap);

        const safeName = (member.name || 'Member').replace(/\s+/g, '_');
        const link = document.createElement('a');
        link.download = `ABMGVM_Card_${safeName}.png`;
        link.href = combinedCanvas.toDataURL('image/png');
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
        const frontCanvas = document.createElement('canvas');
        frontCanvas.width = 1500;
        frontCanvas.height = 930;
        await drawCardFront(frontCanvas, member);

        const backCanvas = document.createElement('canvas');
        backCanvas.width = 1500;
        backCanvas.height = 930;
        await drawCardBack(backCanvas, member);

        const { jsPDF } = window.jspdf;
        const cardW = 85.6, cardH = 53.98;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const xOff = (pageW - cardW) / 2;

        pdf.setFillColor(245, 245, 245);
        pdf.rect(0, 0, pageW, pageH, 'F');

        pdf.setFontSize(11);
        pdf.setTextColor(26, 45, 90);
        pdf.text('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', pageW / 2, 14, { align: 'center' });
        pdf.setFontSize(8); 
        pdf.setTextColor(80, 80, 80);
        pdf.text('Membership Card', pageW / 2, 20, { align: 'center' });
        
        pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', xOff, 26, cardW, cardH);
        pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', xOff, 26 + cardH + 12, cardW, cardH);

        const safeName = (member.name || 'Member').replace(/\s+/g, '_');
        pdf.save(`ABMGVM_Card_${safeName}.pdf`);
        showToast('✅ PDF डाउनलोड हो गया!', 'success');
    } catch (err) {
        console.error(err);
        showToast('PDF डाउनलोड में त्रुटि!', 'error');
    }
}

// --- Escape HTML for XSS prevention ---
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// --- Toast notification ---
function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = `toast ${type} visible`;

    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => {
        toastEl.classList.remove('visible');
    }, 4000);
}
