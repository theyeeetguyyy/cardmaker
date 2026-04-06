// ============================================
// App.js — Card Maker Logic
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// Uses Firebase Realtime Database
// ============================================

// --- State ---
let uploadedPhotoDataURL = null;
let currentMemberData = null;
let currentFirebaseKey = null; // Track the Firebase key for edits
let isEditMode = false;

// --- DOM Elements ---
const cardForm = document.getElementById('cardForm');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const photoUploadArea = document.getElementById('photoUploadArea');
const cardSection = document.getElementById('cardSection');
const btnGenerate = document.getElementById('btnGenerate');
const toastEl = document.getElementById('toast');

// --- Aadhaar formatting ---
const aadhaarInput = document.getElementById('aadhaarNo');
if (aadhaarInput) {
    aadhaarInput.addEventListener('input', function () {
        let val = this.value.replace(/\D/g, '');
        if (val.length > 12) val = val.slice(0, 12);
        // Format: XXXX XXXX XXXX
        let formatted = '';
        for (let i = 0; i < val.length; i++) {
            if (i > 0 && i % 4 === 0) formatted += ' ';
            formatted += val[i];
        }
        this.value = formatted;
    });
}

// --- Phone formatting ---
const phoneInput = document.getElementById('phoneNo');
if (phoneInput) {
    phoneInput.addEventListener('input', function () {
        let val = this.value.replace(/[^\d+]/g, '');
        if (!val.startsWith('+91') && !val.startsWith('+')) {
            if (val.startsWith('91') && val.length > 10) {
                val = '+' + val;
            } else if (val.length <= 10) {
                val = '+91 ' + val;
            }
        }
        this.value = val;
    });
}

// --- Photo Upload ---
if (photoInput) {
    photoInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file size (2MB max)
        if (file.size > 2 * 1024 * 1024) {
            showToast('फोटो 2MB से कम होनी चाहिए! Photo must be under 2MB.', 'error');
            return;
        }

        // Validate it's an image
        if (!file.type.startsWith('image/')) {
            showToast('कृपया एक इमेज फ़ाइल चुनें! Please select an image file.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (ev) {
            uploadedPhotoDataURL = ev.target.result;
            photoPreview.innerHTML = `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`;
            photoUploadArea.style.borderColor = 'var(--green)';
        };
        reader.readAsDataURL(file);
    });
}

// --- Duplicate Check: Aadhaar & Phone ---
async function checkDuplicate(aadhaarNo, phoneNo) {
    try {
        // Check Aadhaar
        const aadhaarSnap = await db.ref('members')
            .orderByChild('aadhaar')
            .equalTo(aadhaarNo)
            .once('value');
        if (aadhaarSnap.exists()) {
            // In edit mode, allow if the match is the current record
            if (isEditMode && currentFirebaseKey) {
                const keys = Object.keys(aadhaarSnap.val());
                const otherKeys = keys.filter(k => k !== currentFirebaseKey);
                if (otherKeys.length > 0) return 'aadhaar';
            } else {
                return 'aadhaar';
            }
        }

        // Check Phone
        const phoneSnap = await db.ref('members')
            .orderByChild('phone')
            .equalTo(phoneNo)
            .once('value');
        if (phoneSnap.exists()) {
            if (isEditMode && currentFirebaseKey) {
                const keys = Object.keys(phoneSnap.val());
                const otherKeys = keys.filter(k => k !== currentFirebaseKey);
                if (otherKeys.length > 0) return 'phone';
            } else {
                return 'phone';
            }
        }

        return null; // No duplicate
    } catch (err) {
        console.warn('Duplicate check failed (Firebase may be unreachable):', err);
        return null; // Allow if check fails
    }
}

// --- Find Card Logic ---
function openFindModal() {
    document.getElementById('findModal').classList.add('visible');
    document.getElementById('findPhone').value = '+91 ';
    document.getElementById('findAadhaar').value = '';
    document.getElementById('findPhone').focus();
}



function closeFindModal() {
    document.getElementById('findModal').classList.remove('visible');
}

// Close find modal on overlay click
const findModal = document.getElementById('findModal');
if (findModal) {
    findModal.addEventListener('click', function (e) {
        if (e.target === this) closeFindModal();
    });
}

async function submitFindCard(e) {
    e.preventDefault();
    
    let phoneQuery = document.getElementById('findPhone').value.trim();
    const aadhaarQuery = document.getElementById('findAadhaar').value.trim();
    const btn = document.getElementById('btnFindCardSearch');

    // Normalize: keep only last 10 digits for comparison
    const phoneDigits = phoneQuery.replace(/\D/g, '').slice(-10);

    // Format aadhaar exactly as we do in the input
    let valAadhaar = aadhaarQuery.replace(/\D/g, '');
    if (valAadhaar.length > 12) valAadhaar = valAadhaar.slice(0, 12);
    let formattedAadhaar = '';
    for (let i = 0; i < valAadhaar.length; i++) {
        if (i > 0 && i % 4 === 0) formattedAadhaar += ' ';
        formattedAadhaar += valAadhaar[i];
    }
    const finalAadhaar = formattedAadhaar;

    if (finalAadhaar.replace(/\s/g, '').length !== 12) {
        showToast('आधार नंबर 12 अंकों का होना चाहिए!', 'error');
        return;
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> खोजा जा रहा है...';

        const snapshot = await db.ref('members').orderByChild('aadhaar').equalTo(finalAadhaar).once('value');
        if (!snapshot.exists()) {
            showToast('❌ इस आधार नंबर से कोई कार्ड नहीं मिला!', 'error');
            return;
        }

        let foundMember = null;
        let foundKey = null;
        snapshot.forEach(child => {
            const dbPhoneDigits = (child.val().phone || '').replace(/\D/g, '').slice(-10);
            if (dbPhoneDigits === phoneDigits) {
                foundMember = child.val();
                foundKey = child.key;
            }
        });

        if (!foundMember) {
            showToast('❌ फोन नंबर मेल नहीं खा रहा है!', 'error');
            return;
        }

        // Successfully found! Load the data to current mode
        currupdaentMemberData = foundMember;
        currentFirebaseKey = foundKey;
        isEditMode = true; // Technically they can edit it now, but we'll adapt to just showing it
        
        btnGenerate.innerHTML = '✏️ कार्ड अपडेट करें — Update Card';
        
        // Populate card
        populateCard(currentMemberData);
        
        // Pre-fill form fields
        document.getElementById('memberName').value = currentMemberData.name || '';
        document.getElementById('fatherName').value = currentMemberData.fatherName || '';
        document.getElementById('aadhaarNo').value = currentMemberData.aadhaar || '';
        document.getElementById('phoneNo').value = currentMemberData.phone || '';
        document.getElementById('city').value = currentMemberData.city || '';
        document.getElementById('state').value = currentMemberData.state || '';
        
        uploadedPhotoDataURL = currentMemberData.photo;
        photoPreview.innerHTML = `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`;
        photoUploadArea.style.borderColor = 'var(--green)';

        closeFindModal();
        
        // Show card section
        cardSection.classList.add('visible');
        cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        showToast('✅ कार्ड मिल गया! Card retrieved successfully!', 'success');
        
    } catch (err) {
        console.error("Find card error:", err);
        showToast('सर्च करने में त्रुटि आई! Error searching.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'खोजें — Search';
    }
}

// --- Form Submission ---
if (cardForm) {
    cardForm.addEventListener('submit', async function (e) {
        e.preventDefault();

    // Validate photo
    if (!uploadedPhotoDataURL) {
        showToast('कृपया अपनी फोटो अपलोड करें! Please upload your photo.', 'error');
        return;
    }

    // Collect data
    const memberName = document.getElementById('memberName').value.trim();
    const fatherName = document.getElementById('fatherName').value.trim();
    const aadhaarNo = document.getElementById('aadhaarNo').value.trim();
    const phoneNo = document.getElementById('phoneNo').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value;

    // Validate Aadhaar (12 digits)
    const aadhaarDigits = aadhaarNo.replace(/\s/g, '');
    if (aadhaarDigits.length !== 12) {
        showToast('आधार नंबर 12 अंकों का होना चाहिए! Aadhaar must be 12 digits.', 'error');
        return;
    }

    // Disable button
    btnGenerate.disabled = true;
    btnGenerate.innerHTML = '<span class="spinner"></span> कार्ड बन रहा है...';

    try {
        // Check for duplicate Aadhaar / Phone
        const duplicate = await checkDuplicate(aadhaarNo, phoneNo);
        if (duplicate === 'aadhaar') {
            showToast('❌ इस आधार नंबर से पहले ही कार्ड बन चुका है! Card already exists with this Aadhaar number.', 'error');
            return;
        }
        if (duplicate === 'phone') {
            showToast('❌ इस फोन नंबर से पहले ही कार्ड बन चुका है! Card already exists with this phone number.', 'error');
            return;
        }

        if (isEditMode && currentMemberData) {
            // --- EDIT MODE: Update existing card ---
            currentMemberData.name = memberName;
            currentMemberData.fatherName = fatherName;
            currentMemberData.aadhaar = aadhaarNo;
            currentMemberData.phone = phoneNo;
            currentMemberData.city = city;
            currentMemberData.state = state;
            currentMemberData.photo = uploadedPhotoDataURL;

            // Populate card
            populateCard(currentMemberData);

            // Update in Firebase
            await updateInFirebase(currentMemberData);

            // Exit edit mode
            isEditMode = false;
            btnGenerate.innerHTML = '🪪 कार्ड बनाएं — Generate Card';

            // Show card section
            cardSection.classList.add('visible');
            cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            showToast('✅ कार्ड अपडेट हो गया! Card updated successfully!', 'success');
        } else {
            // --- NEW CARD MODE ---
            const membershipNo = await getNextMembershipNo();
            const issuingDate = formatDate(new Date());

            currentMemberData = {
                name: memberName,
                fatherName: fatherName,
                aadhaar: aadhaarNo,
                phone: phoneNo,
                city: city,
                state: state,
                photo: uploadedPhotoDataURL,
                membershipNo: membershipNo,
                issuingDate: issuingDate,
                createdAt: new Date().toISOString()
            };

            // Populate card
            populateCard(currentMemberData);

            // Save to Firebase
            await saveToFirebase(currentMemberData);

            // Show card section
            cardSection.classList.add('visible');
            cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

            showToast('🎉 कार्ड सफलतापूर्वक बन गया! Card generated successfully!', 'success');
        }

    } catch (err) {
        console.error('Error generating card:', err);
        showToast('कार्ड बनाने में त्रुटि! Error generating card. Check console.', 'error');
    } finally {
        btnGenerate.disabled = false;
        if (!isEditMode) {
            btnGenerate.innerHTML = '🪪 कार्ड बनाएं — Generate Card';
        }
    }
});
}

// --- Mask Aadhaar ---
function maskAadhaar(aadhaar) {
    const digits = (aadhaar || '').replace(/\s/g, '');
    if (digits.length !== 12) return aadhaar;
    return `XXXX XXXX ${digits.slice(-4)}`;
}

// ══════════════════════════════════════════════════════════
//  CANVAS CARD DRAWING — preview = download, always
// ══════════════════════════════════════════════════════════

// Cached logo
let _logoImg = null;
function getLogoImg() {
    if (_logoImg) return Promise.resolve(_logoImg);
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { _logoImg = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.crossOrigin = 'anonymous';
        img.src = 'assets/logo-main.png';
    });
}


// Cached president signature
let _presidentSigImg = null;
function getPresidentSigImg() {
    if (_presidentSigImg) return Promise.resolve(_presidentSigImg);
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { _presidentSigImg = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.crossOrigin = 'anonymous';
        img.src = 'assets/president-signature.png';
    });
}

function loadImg(src) {
    return new Promise(resolve => {
        if (!src) return resolve(null);
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

// Rounded rectangle path helper
function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
// Top-rounded only
function rrTop(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
// Bottom-rounded only
function rrBottom(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y);
    ctx.closePath();
}

// Draw a centered image cropped to fill a rounded rect
function drawFitImage(ctx, img, x, y, w, h, r) {
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    const iw = img.naturalWidth  || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
}

// ── FRONT CARD ───────────────────────────────────────────
async function drawCardFront(canvas, data) {
    const S = 3;           // canvas is 1500×930 (3× for crisp downloads)
    const W = 500*S, H = 310*S;
    const ctx = canvas.getContext('2d');
    await document.fonts.ready;
    ctx.clearRect(0, 0, W, H);

    const NAVY   = '#1a2d5a';
    const TEAL   = '#2eb8d0';
    const GOLD   = '#c8993a';
    const WHITE  = '#ffffff';
    const HDR_H  = 72*S;
    const FTR_H  = 38*S;
    const RADIUS = 14*S;

    // ── Card background ──
    rr(ctx, 0, 0, W, H, RADIUS);
    ctx.fillStyle = WHITE;
    ctx.fill();

    // ── Header (navy, top-rounded) ──
    rrTop(ctx, 0, 0, W, HDR_H, RADIUS);
    ctx.fillStyle = NAVY;
    ctx.fill();

    // Gold accent line below header
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, HDR_H, W, 3*S);

    // ── Footer (teal, bottom-rounded) ──
    rrBottom(ctx, 0, H - FTR_H, W, FTR_H, RADIUS);
    ctx.fillStyle = TEAL;
    ctx.fill();

    // ── Logo (left, circular clip) ──
    const logo = await getLogoImg();
    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(36*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, 10*S, 10*S, 52*S, 52*S);
        ctx.restore();
        // thin white ring around logo
        ctx.beginPath();
        ctx.arc(36*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5*S;
        ctx.stroke();
    }

    // ── Header text ──
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${8*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Reg. No. : S/3369/SDM/NW/2018', W/2, 17*S);

    ctx.fillStyle = WHITE;
    ctx.font = `bold ${17*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('अखिल भारतीय माहौर ग्वारे वैश्य महासभा', W/2, 38*S);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${9*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', W/2, 54*S);

    // ── Right logo (same logo, right side) ──
    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc((500-36)*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, (500-62)*S, 10*S, 52*S, 52*S);
        ctx.restore();
        ctx.beginPath();
        ctx.arc((500-36)*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5*S;
        ctx.stroke();
    }

    // ── Watermark ──
    if (logo) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.drawImage(logo, 130*S, 75*S, 170*S, 170*S);
        ctx.restore();
    }

    // ── Member type badge ──
    ctx.fillStyle = '#138808';
    ctx.font = `bold ${11.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('✦  General Member  ✦', W/2, 92*S);

    // ── Member photo ──
    const photoImg = await loadImg(data.photo);
    const px = 358*S, py = 80*S, pw = 116*S, ph = 155*S;
    if (photoImg) {
        drawFitImage(ctx, photoImg, px, py, pw, ph, 6*S);
    } else {
        ctx.fillStyle = '#dde3f0';
        rr(ctx, px, py, pw, ph, 6*S);
        ctx.fill();
        ctx.fillStyle = '#aab';
        ctx.font = `${28*S}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('📷', px + pw/2, py + ph/2 + 8*S);
    }
    // Photo border
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2*S;
    rr(ctx, px, py, pw, ph, 6*S);
    ctx.stroke();

    // ── Member details ──
    ctx.textAlign = 'left';
    const lx = 18*S;
    let   ly = 112*S;

    ctx.fillStyle = NAVY;
    ctx.font = `bold ${15*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText((data.name || '').toUpperCase(), lx, ly); ly += 22*S;

    ctx.fillStyle = '#333';
    ctx.font = `${10.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText(`S/o. Shri ${data.fatherName || ''}`, lx, ly); ly += 18*S;
    ctx.fillText(data.phone || '', lx, ly); ly += 18*S;
    ctx.fillText(`Aadhaar: ${maskAadhaar(data.aadhaar || '')}`, lx, ly); ly += 18*S;

    ctx.font = `bold ${10.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText((data.city  || '').toUpperCase(), lx, ly); ly += 18*S;
    ctx.fillText((data.state || '').toUpperCase(), lx, ly);

    // ── Footer text ──
    ctx.fillStyle = '#7a2200';
    ctx.font = `bold ${11*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`Membership No. : ${data.membershipNo || ''}`, 16*S, H - 11*S);
    ctx.textAlign = 'right';
    ctx.fillText(`Issuing Date : ${data.issuingDate || ''}`, (500-16)*S, H - 11*S);
}

// ── BACK CARD ────────────────────────────────────────────
async function drawCardBack(canvas, data) {
    const S = 3;
    const W = 500*S, H = 310*S;
    const ctx = canvas.getContext('2d');
    await document.fonts.ready;
    ctx.clearRect(0, 0, W, H);

    const NAVY    = '#1a2d5a';
    const TEAL    = '#2eb8d0';
    const GOLD    = '#c8993a';
    const WHITE   = '#ffffff';
    const MAROON  = '#7a2200';
    const HDR_H   = 64*S;
    const FTR_H   = 36*S;
    const RADIUS  = 14*S;

    // ── Card background ──
    rr(ctx, 0, 0, W, H, RADIUS);
    ctx.fillStyle = WHITE;
    ctx.fill();

    // ── Header (navy, top-rounded) ──
    rrTop(ctx, 0, 0, W, HDR_H, RADIUS);
    ctx.fillStyle = NAVY;
    ctx.fill();

    // Gold accent line below header
    ctx.fillStyle = GOLD;
    ctx.fillRect(0, HDR_H, W, 3*S);

    // ── Footer (teal, bottom-rounded) ──
    rrBottom(ctx, 0, H - FTR_H, W, FTR_H, RADIUS);
    ctx.fillStyle = TEAL;
    ctx.fill();

    // ── Header logos ──
    const logo = await getLogoImg();
    if (logo) {
        // Left
        ctx.save(); ctx.beginPath(); ctx.arc(36*S, 32*S, 22*S, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logo, 14*S, 10*S, 44*S, 44*S); ctx.restore();
        ctx.beginPath(); ctx.arc(36*S, 32*S, 22*S, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5*S; ctx.stroke();
        // Right
        ctx.save(); ctx.beginPath(); ctx.arc((500-36)*S, 32*S, 22*S, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logo, (500-58)*S, 10*S, 44*S, 44*S); ctx.restore();
        ctx.beginPath(); ctx.arc((500-36)*S, 32*S, 22*S, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5*S; ctx.stroke();
    }

    // ── Header text ──
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `${7.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Reg. No. : S/3369/SDM/NW/2018', W/2, 14*S);

    ctx.fillStyle = WHITE;
    ctx.font = `bold ${16*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('अखिल भारतीय माहौर ग्वारे वैश्य महासभा', W/2, 35*S);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', W/2, 50*S);

    // ── Watermark (center) ──
    if (logo) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.drawImage(logo, 160*S, 85*S, 180*S, 180*S);
        ctx.restore();
    }

    // ── Address Section (Top Center) ──
    let addrY = HDR_H + 18*S;
    ctx.textAlign = 'center';
    ctx.fillStyle = MAROON;
    ctx.font = `bold ${9*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('कार्यालय का पता : 65 पंचवटी वरूण नगर, रोशनी घर के पीछे, लश्कर, ग्वालियर (म.प्र.)', W/2, addrY);
    
    ctx.fillStyle = '#666';
    ctx.font = `${7.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Office: 65 Panchvati, Varun Nagar, Behind Roshni Ghar, Lashkar, Gwalior (M.P.)', W/2, addrY + 12*S);

    // ── Signature Boxes ──
    const sigY = addrY + 28*S; // y = ~122
    const sigW = 160*S;
    const sigH = 80*S;
    const sig1X = 50*S; // left box
    const sig2X = (500 - 50 - 160)*S; // right box
    const sigR = 6*S;

    // Left Box: MEMBER SIGNATURE
    ctx.fillStyle = 'rgba(26,45,90,0.03)';
    rr(ctx, sig1X, sigY, sigW, sigH, sigR);
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,45,90,0.1)';
    ctx.lineWidth = 1*S;
    rr(ctx, sig1X, sigY, sigW, sigH, sigR);
    ctx.stroke();

    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('MEMBER SIGNATURE', sig1X + sigW/2, sigY + 16*S);

    // Blank line
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1*S;
    ctx.beginPath();
    ctx.moveTo(sig1X + 15*S, sigY + 60*S);
    ctx.lineTo(sig1X + sigW - 15*S, sigY + 60*S);
    ctx.stroke();

    // Right Box: AUTH. SIGNATURE
    ctx.fillStyle = 'rgba(26,45,90,0.03)';
    rr(ctx, sig2X, sigY, sigW, sigH, sigR);
    ctx.fill();
    ctx.strokeStyle = 'rgba(26,45,90,0.1)';
    ctx.lineWidth = 1*S;
    rr(ctx, sig2X, sigY, sigW, sigH, sigR);
    ctx.stroke();

    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('AUTH. SIGNATURE', sig2X + sigW/2, sigY + 16*S);

    // President Signature Image (with multiply blending to remove white background)
    const sigImg = await getPresidentSigImg();
    if (sigImg) {
        ctx.save();
        rr(ctx, sig2X, sigY, sigW, sigH, sigR); // clip to box
        ctx.clip();
        const siw = sigImg.naturalWidth || sigImg.width;
        const sih = sigImg.naturalHeight || sigImg.height;
        // Trim some margins
        const maxW = sigW - 10*S;
        const maxH = 40*S;
        const scale = Math.min(maxW / siw, maxH / sih) * 1.5; 
        const dw = siw * scale;
        const dh = sih * scale;
        const dx = sig2X + (sigW - dw)/2;
        const dy = sigY + 22*S + (maxH - dh)/2;

        ctx.drawImage(sigImg, dx, dy, dw, dh);
        ctx.restore();
    } else {
        // Fallback line
        ctx.beginPath(); ctx.moveTo(sig2X + 15*S, sigY + 50*S); ctx.lineTo(sig2X + sigW - 15*S, sigY + 50*S); ctx.stroke();
    }

    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('प्रकाश चंद्र मांडिल', sig2X + sigW/2, sigY + 62*S);

    ctx.fillStyle = '#555';
    ctx.font = `${6.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('(National President)', sig2X + sigW/2, sigY + 72*S);

    // ── Instructions ──
    const instY = sigY + sigH + 16*S; 
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Instruction :', 20*S, instY);

    ctx.fillStyle = '#555';
    ctx.font = `${6.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('This card is property of Akhil Bhartiya Mahour Gware Vaishya Mahasabha and is nontransferable.', 20*S, instY + 12*S);
    ctx.fillText('The use of this card is governed by the terms and conditions of A.B.M.G.V.M registered legislation.', 20*S, instY + 22*S);
    ctx.fillText('If found, please return to the office address mentioned above.', 20*S, instY + 32*S);

    // ── Footer contacts ──
    ctx.fillStyle = WHITE;
    ctx.font = `bold ${9*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('📞 President : 9826654877', 18*S, H - 11*S);
    ctx.textAlign = 'right';
    ctx.fillText('📞 Media Prabhari : 9893167002', (500-18)*S, H - 11*S);
}

// ── Populate card (calls both canvas draw functions) ─────
async function populateCard(data) {
    const frontCanvas = document.getElementById('cardFront');
    const backCanvas  = document.getElementById('cardBack');
    await Promise.all([
        drawCardFront(frontCanvas, data),
        drawCardBack(backCanvas, data)
    ]);
}



// --- Get next membership number (Firebase RTDB transaction) ---
async function getNextMembershipNo() {
    try {
        const counterRef = db.ref('meta/counter');
        const result = await counterRef.transaction(function (current) {
            return (current || 1000) + 1;
        });
        return result.snapshot.val().toString();
    } catch (err) {
        console.warn('Firebase counter error, using random:', err);
        // Fallback: generate a random number
        return (1000 + Math.floor(Math.random() * 9000)).toString();
    }
}

// --- Save to Firebase Realtime Database ---
async function saveToFirebase(data) {
    try {
        // Compress the photo for storage (reduce base64 size)
        const compressedPhoto = await compressImage(data.photo, 300, 360, 0.7);

        const newMemberRef = db.ref('members').push();
        currentFirebaseKey = newMemberRef.key; // Track key for future edits
        await newMemberRef.set({
            name: data.name,
            fatherName: data.fatherName,
            aadhaar: data.aadhaar,
            phone: data.phone,
            city: data.city,
            state: data.state,
            photo: compressedPhoto,
            membershipNo: data.membershipNo,
            issuingDate: data.issuingDate,
            createdAt: new Date().toISOString()
        });
        console.log('✅ Saved to Firebase RTDB, key:', currentFirebaseKey);
    } catch (err) {
        console.error('Firebase save error:', err);
    }
}

// --- Update existing record in Firebase ---
async function updateInFirebase(data) {
    if (!currentFirebaseKey) {
        console.warn('No Firebase key to update');
        return;
    }
    try {
        const compressedPhoto = await compressImage(data.photo, 300, 360, 0.7);

        await db.ref('members/' + currentFirebaseKey).update({
            name: data.name,
            fatherName: data.fatherName,
            aadhaar: data.aadhaar,
            phone: data.phone,
            city: data.city,
            state: data.state,
            photo: compressedPhoto,
            updatedAt: new Date().toISOString()
        });
        console.log('✅ Updated in Firebase RTDB, key:', currentFirebaseKey);
    } catch (err) {
        console.error('Firebase update error:', err);
    }
}

// --- Edit Card: go back to form with pre-filled data ---
function editCard() {
    if (!currentMemberData) return;

    isEditMode = true;

    // Pre-fill the form
    document.getElementById('memberName').value = currentMemberData.name;
    document.getElementById('fatherName').value = currentMemberData.fatherName;
    document.getElementById('aadhaarNo').value = currentMemberData.aadhaar;
    document.getElementById('phoneNo').value = currentMemberData.phone;
    document.getElementById('city').value = currentMemberData.city;
    document.getElementById('state').value = currentMemberData.state;

    // Photo is already loaded
    uploadedPhotoDataURL = currentMemberData.photo;
    photoPreview.innerHTML = `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`;
    photoUploadArea.style.borderColor = 'var(--green)';

    // Change button text to indicate edit
    btnGenerate.innerHTML = '✏️ कार्ड अपडेट करें — Update Card';

    // Hide card section, scroll to form
    cardSection.classList.remove('visible');
    document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('✏️ अपनी जानकारी बदलें और अपडेट करें। Edit your details and click Update.', 'success');
}

// --- Compress image for Firebase storage ---
function compressImage(dataURL, maxWidth, maxHeight, quality) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let w = img.width;
            let h = img.height;

            if (w > maxWidth) {
                h = (maxWidth / w) * h;
                w = maxWidth;
            }
            if (h > maxHeight) {
                w = (maxHeight / h) * w;
                h = maxHeight;
            }

            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataURL;
    });
}

// --- Format date ---
function formatDate(date) {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

// --- Download PNG: just combine the two canvases directly ---
async function downloadCardPNG() {
    if (!currentMemberData) {
        showToast('पहले कार्ड बनाएं!', 'error'); return;
    }
    try {
        const fc = document.getElementById('cardFront');
        const bc = document.getElementById('cardBack');
        const CW = fc.width, CH = fc.height, GAP = 60;

        const out = document.createElement('canvas');
        out.width  = CW;
        out.height = CH * 2 + GAP;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#1a2d5a';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(fc, 0, 0);
        ctx.drawImage(bc, 0, CH + GAP);

        const safeName = (currentMemberData.name || 'member').replace(/\s+/g, '_');
        const a = document.createElement('a');
        a.download = `ABMGVM_Card_${safeName}.png`;
        a.href = out.toDataURL('image/png');
        a.click();
        showToast('✅ PNG Downloaded!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Error downloading PNG', 'error');
    }
}

// --- Download PDF: same canvases → jsPDF ---
async function downloadCardPDF() {
    if (!currentMemberData) {
        showToast('पहले कार्ड बनाएं!', 'error'); return;
    }
    try {
        const { jsPDF } = window.jspdf;
        const fc = document.getElementById('cardFront');
        const bc = document.getElementById('cardBack');

        const cardW = 85.6, cardH = 53.98;
        const pdf   = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const xOff  = (pageW - cardW) / 2;

        pdf.setFillColor(245, 245, 245);
        pdf.rect(0, 0, pageW, pageH, 'F');

        pdf.setFontSize(11); pdf.setTextColor(26, 45, 90);
        pdf.text('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', pageW/2, 14, { align:'center' });
        pdf.setFontSize(8); pdf.setTextColor(80, 80, 80);
        pdf.text('Membership Card', pageW/2, 20, { align:'center' });

        pdf.addImage(fc.toDataURL('image/png'), 'PNG', xOff, 26, cardW, cardH);
        pdf.addImage(bc.toDataURL('image/png'), 'PNG', xOff, 26 + cardH + 12, cardW, cardH);

        const safeName = (currentMemberData.name || 'member').replace(/\s+/g, '_');
        pdf.save(`ABMGVM_Card_${safeName}.pdf`);
        showToast('✅ PDF Downloaded!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Error downloading PDF', 'error');
    }
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
