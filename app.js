// ============================================
// App.js — Card Maker Logic
// अखिल भारतीय माहौर ग्वारे वैश्य महासभा
// ============================================

// --- State ---
let uploadedPhotoDataURL = null;
let currentMemberData = null;
let originalMemberData = null;
let currentFirebaseKey = null;
let isEditMode = false;
let allowedPhoneNumbers = null;
let allowedPhoneNumbersPromise = null;

// FIX: Was triple-backtick (```text```) which is a fatal JS syntax error.
const DEFAULT_PHONE_ACCESS_ERROR = `नमस्कार, प्रिय समाज बंधु, कृपया पहले अपना जनगणना फॉर्म भरें, उसके बाद अपना मतदान कार्ड प्राप्त करें। धन्यवाद 🙏`;

// --- DOM Elements ---
const cardForm       = document.getElementById('cardForm');
const photoInput     = document.getElementById('photoInput');
const photoPreview   = document.getElementById('photoPreview');
const photoUploadArea = document.getElementById('photoUploadArea');
const cardSection    = document.getElementById('cardSection');
const btnGenerate    = document.getElementById('btnGenerate');
const toastEl        = document.getElementById('toast');

// ─── Utility helpers ───────────────────────────────────────

function getPhoneDigits(value) {
    return (value || '').replace(/\D/g, '').slice(-10);
}

function normalizeIndianPhone(value) {
    const digits = getPhoneDigits(value);
    return digits.length === 10 ? digits : '';
}

function formatAadhaarInput(value) {
    const digits = (value || '').replace(/\D/g, '').slice(0, 12);
    let formatted = '';
    for (let i = 0; i < digits.length; i++) {
        if (i > 0 && i % 4 === 0) formatted += ' ';
        formatted += digits[i];
    }
    return formatted;
}

function maskAadhaar(aadhaar) {
    const digits = (aadhaar || '').replace(/\s/g, '');
    if (digits.length !== 12) return aadhaar;
    return `XXXX XXXX ${digits.slice(-4)}`;
}

function formatDate(date) {
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

// ─── Allowed-phone list ─────────────────────────────────────

function getPhoneDigits(str) {
    return (str || "").replace(/\D/g, "");
}

async function loadAllowedPhoneNumbers() {
    if (allowedPhoneNumbers) return allowedPhoneNumbers;

    if (!allowedPhoneNumbersPromise) {
        allowedPhoneNumbersPromise = fetch(`numbers.csv?v=${Date.now()}`, {
            cache: "no-store"
        })
        .then(res => {
            if (!res.ok) {
                throw new Error(`Failed to load numbers.csv (${res.status})`);
            }
            return res.text();
        })
        .then(csvText => {
            const numbers = new Set();

            csvText
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(Boolean)
                .forEach(line => {
                    const digits = getPhoneDigits(line);
                    if (digits.length === 10) {
                        numbers.add(digits);
                    }
                });

            allowedPhoneNumbers = numbers;
            allowedPhoneNumbersPromise = null;

            return numbers;
        })
        .catch(err => {
            allowedPhoneNumbersPromise = null;
            throw err;
        });
    }

    return allowedPhoneNumbersPromise;
}

    
async function ensurePhoneIsAllowed(phoneNo) {
    const numbers = await loadAllowedPhoneNumbers();
    return numbers.has(phoneNo);
}

// ─── Modals ─────────────────────────────────────────────────

function openErrorModal(message = DEFAULT_PHONE_ACCESS_ERROR, title = 'त्रुटि / Error') {
    const modal    = document.getElementById('errorModal');
    const titleEl  = document.getElementById('errorModalTitle');
    const msgEl    = document.getElementById('errorModalMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = message;
    if (modal)   modal.classList.add('visible');
}

function closeErrorModal() {
    const modal = document.getElementById('errorModal');
    if (modal) modal.classList.remove('visible');
}

// ─── Input formatters (attached on DOMContentLoaded to be safe) ─

function attachInputFormatters() {
    const aadhaarInput = document.getElementById('aadhaarNo');
    if (aadhaarInput) {
        aadhaarInput.addEventListener('input', function () {
            this.value = formatAadhaarInput(this.value);
        });
    }

    const findAadhaarInput = document.getElementById('findAadhaar');
    if (findAadhaarInput) {
        findAadhaarInput.addEventListener('input', function () {
            this.value = formatAadhaarInput(this.value);
        });
    }

    const findPhoneInput = document.getElementById('findPhone');
    if (findPhoneInput) {
        findPhoneInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 10);
        });
    }

    const phoneNoInput = document.getElementById('phoneNo');
    if (phoneNoInput) {
        phoneNoInput.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 10);
        });
    }
}

// ─── Photo Upload ────────────────────────────────────────────
// FIX: Attach via DOMContentLoaded so photoInput is guaranteed to exist.
// The <input type="file"> now uses visually-hidden CSS (not display:none)
// for iOS Safari compatibility. Clicking the label still triggers it.

function attachPhotoUpload() {
    if (!photoInput) return;

    photoInput.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            showToast('फोटो 2MB से कम होनी चाहिए! Photo must be under 2MB.', 'error');
            this.value = '';
            return;
        }

        if (!file.type.startsWith('image/')) {
            showToast('कृपया एक इमेज फ़ाइल चुनें! Please select an image file.', 'error');
            this.value = '';
            return;
        }

        photoPreview.innerHTML = '<span class="placeholder-icon">⏳</span>';
        if (photoUploadArea) photoUploadArea.style.borderColor = 'var(--saffron)';

        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                uploadedPhotoDataURL = await compressImage(ev.target.result, 600, 720, 0.92);
                photoPreview.innerHTML = `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`;
                if (photoUploadArea) photoUploadArea.style.borderColor = 'var(--green)';
                showToast('✅ फोटो अपलोड हो गई! Photo uploaded successfully.', 'success');
            } catch (err) {
                console.error('Photo compression error:', err);
                uploadedPhotoDataURL = null;
                photoPreview.innerHTML = '<span class="placeholder-icon">📷</span>';
                if (photoUploadArea) photoUploadArea.style.borderColor = '';
                showToast('फोटो प्रोसेस नहीं हो पाई! Could not process the photo.', 'error');
            } finally {
                photoInput.value = '';
            }
        };
        reader.onerror = function () {
            console.error('Photo read error');
            uploadedPhotoDataURL = null;
            photoPreview.innerHTML = '<span class="placeholder-icon">📷</span>';
            if (photoUploadArea) photoUploadArea.style.borderColor = '';
            photoInput.value = '';
            showToast('फोटो पढ़ी नहीं जा सकी! Could not read the selected photo.', 'error');
        };
        reader.readAsDataURL(file);
    });
}

// ─── Duplicate Check ─────────────────────────────────────────

// Returns: null | 'aadhaar' | 'phone_same_gender' | 'phone_both_genders'
async function checkDuplicate(aadhaarNo, phoneNo, currentGender, previousData = null) {
    try {
        const shouldCheckAadhaar = !previousData || (previousData.aadhaar || '') !== aadhaarNo;
        const shouldCheckPhone   = !previousData || getPhoneDigits(previousData.phone) !== getPhoneDigits(phoneNo);

        if (shouldCheckAadhaar) {
            const snap = await db.collection('members').where('aadhaar', '==', aadhaarNo).get();
            if (!snap.empty) {
                if (isEditMode && currentFirebaseKey) {
                    if (snap.docs.filter(d => d.id !== currentFirebaseKey).length > 0) return 'aadhaar';
                } else {
                    return 'aadhaar';
                }
            }
        }

        if (shouldCheckPhone) {
            const snap = await db.collection('members').where('phone', '==', phoneNo).get();
            if (!snap.empty) {
                // Filter out the current card if editing
                const otherDocs = isEditMode && currentFirebaseKey
                    ? snap.docs.filter(d => d.id !== currentFirebaseKey)
                    : snap.docs;

                if (otherDocs.length === 0) {
                    // No other cards with this phone — allow
                } else if (otherDocs.length >= 2) {
                    // Both male and female cards already exist
                    return 'phone_both_genders';
                } else {
                    // Exactly 1 other card exists — check gender clash
                    const existingGender = (otherDocs[0].data().gender || '').toLowerCase();
                    const incomingGender = (currentGender || '').toLowerCase();
                    if (existingGender === incomingGender) {
                        return 'phone_same_gender';
                    }
                    // Different gender — allow the second card
                }
            }
        }

        return null;
    } catch (err) {
        console.warn('Duplicate check failed:', err);
        throw err;
    }
}

// ─── Find Card Modal ──────────────────────────────────────────

function openFindModal() {
    document.getElementById('findModal').classList.add('visible');
    document.getElementById('findPhone').value = '';
    document.getElementById('findAadhaar').value = '';
    document.getElementById('findPhone').focus();
}

function closeFindModal() {
    document.getElementById('findModal').classList.remove('visible');
}

async function submitFindCard(e) {
    e.preventDefault();

    const phoneDigits = getPhoneDigits(document.getElementById('findPhone').value.trim());
    if (phoneDigits.length !== 10) {
        showToast('फोन नंबर 10 अंकों का होना चाहिए! Phone must be 10 digits.', 'error');
        return;
    }

    const aadhaarQuery = document.getElementById('findAadhaar').value.trim();
    const finalAadhaar = formatAadhaarInput(aadhaarQuery);
    if (finalAadhaar.replace(/\s/g, '').length !== 12) {
        showToast('आधार नंबर 12 अंकों का होना चाहिए!', 'error');
        return;
    }

    const btn = document.getElementById('btnFindCardSearch');

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> खोजा जा रहा है...';

        const snapshot = await db.collection('members').where('aadhaar', '==', finalAadhaar).get();
        if (snapshot.empty) {
            showToast('❌ इस आधार नंबर से कोई कार्ड नहीं मिला!', 'error');
            return;
        }

        let foundMember = null;
        let foundKey    = null;
        snapshot.forEach(doc => {
            const dbPhoneDigits = getPhoneDigits(doc.data().phone || '');
            if (dbPhoneDigits === phoneDigits) {
                foundMember = doc.data();
                foundKey    = doc.id;
            }
        });

        if (!foundMember) {
            showToast('❌ फोन नंबर मेल नहीं खा रहा है!', 'error');
            return;
        }

        // Fetch photo on demand
        const photoSnap = await db.collection('memberPhotos').doc(foundKey).get();
        if (photoSnap.exists) foundMember.photo = photoSnap.data().photo;

        currentMemberData    = foundMember;
        originalMemberData   = { ...foundMember };
        currentFirebaseKey   = foundKey;
        isEditMode           = true;

        if (btnGenerate) btnGenerate.innerHTML = '✏️ कार्ड अपडेट करें — Update Card';

        await populateCard(currentMemberData);

        document.getElementById('memberName').value  = currentMemberData.name        || '';
        document.getElementById('fatherName').value  = currentMemberData.fatherName  || '';
        document.getElementById('dob').value         = currentMemberData.dob         || '';
        document.getElementById('gender').value      = currentMemberData.gender      || '';
        document.getElementById('aadhaarNo').value   = currentMemberData.aadhaar     || '';
        document.getElementById('phoneNo').value     = currentMemberData.phone       || '';
        document.getElementById('city').value        = currentMemberData.city        || '';
        document.getElementById('state').value       = currentMemberData.state       || '';

        uploadedPhotoDataURL = currentMemberData.photo;
        if (photoPreview) {
            photoPreview.innerHTML = uploadedPhotoDataURL
                ? `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`
                : '<span class="placeholder-icon">📷</span>';
        }
        if (photoUploadArea) photoUploadArea.style.borderColor = uploadedPhotoDataURL ? 'var(--green)' : '';

        closeFindModal();
        if (cardSection) {
            cardSection.classList.add('visible');
            cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        showToast('✅ कार्ड मिल गया! Card retrieved successfully!', 'success');

    } catch (err) {
        console.error('Find card error:', err);
        showToast('सर्च करने में त्रुटि आई! Error searching.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'खोजें — Search';
    }
}

// ─── Form Submission ──────────────────────────────────────────

function attachFormSubmit() {
    if (!cardForm) return;

    cardForm.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!uploadedPhotoDataURL) {
            showToast('कृपया अपनी फोटो अपलोड करें! Please upload your photo.', 'error');
            return;
        }

        const memberName = document.getElementById('memberName').value.trim();
        const fatherName = document.getElementById('fatherName').value.trim();
        const dob        = document.getElementById('dob').value;
        const gender     = document.getElementById('gender').value;
        const aadhaarNo  = formatAadhaarInput(document.getElementById('aadhaarNo').value.trim());
        const phoneNo    = getPhoneDigits(document.getElementById('phoneNo').value.trim());
        const city       = document.getElementById('city').value.trim();
        const state      = document.getElementById('state').value;

        if (aadhaarNo.replace(/\s/g, '').length !== 12) {
            showToast('आधार नंबर 12 अंकों का होना चाहिए! Aadhaar must be 12 digits.', 'error');
            return;
        }
        if (phoneNo.length !== 10) {
            showToast('फोन नंबर 10 अंकों का होना चाहिए! Phone must be 10 digits.', 'error');
            return;
        }

        document.getElementById('aadhaarNo').value = aadhaarNo;
        document.getElementById('phoneNo').value   = phoneNo;

        let isAllowedPhone = false;
        try {
            isAllowedPhone = await ensurePhoneIsAllowed(phoneNo);
        } catch (err) {
            console.error('Allowed phone list load failed:', err);
            showToast('फोन सूची लोड नहीं हो पाई! Could not load the approved phone list.', 'error');
            return;
        }

        if (!isAllowedPhone) {
            openErrorModal(DEFAULT_PHONE_ACCESS_ERROR);
            return;
        }

        btnGenerate.disabled  = true;
        btnGenerate.innerHTML = '<span class="spinner"></span> कार्ड बन रहा है...';

        try {
            const previousData = isEditMode && originalMemberData ? { ...originalMemberData } : null;

            const duplicate = await checkDuplicate(aadhaarNo, phoneNo, gender, previousData);
            if (duplicate === 'aadhaar') {
                showToast('❌ इस आधार नंबर से पहले ही कार्ड बन चुका है!', 'error');
                return;
            }
            if (duplicate === 'phone_same_gender') {
                const genderHindi = gender === 'Male' ? 'पुरुष (Male)' : 'महिला (Female)';
                showToast(`❌ इस फोन नंबर से ${genderHindi} का कार्ड पहले ही बन चुका है!`, 'error');
                return;
            }
            if (duplicate === 'phone_both_genders') {
                showToast('❌ इस फोन नंबर से पुरुष और महिला दोनों के कार्ड पहले ही बन चुके हैं! Both Male & Female cards already exist for this phone number.', 'error');
                return;
            }

            if (isEditMode && currentMemberData) {
                currentMemberData.name       = memberName;
                currentMemberData.fatherName = fatherName;
                currentMemberData.dob        = dob;
                currentMemberData.gender     = gender;
                currentMemberData.aadhaar    = aadhaarNo;
                currentMemberData.phone      = phoneNo;
                currentMemberData.city       = city;
                currentMemberData.state      = state;
                currentMemberData.photo      = uploadedPhotoDataURL;

                await populateCard(currentMemberData);
                const didUpdate = await updateInFirebase(currentMemberData, previousData);
                originalMemberData = { ...currentMemberData };

                isEditMode            = false;
                btnGenerate.innerHTML = '🪪 कार्ड बनाएं — Generate Card';
                cardSection.classList.add('visible');
                cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                showToast(
                    didUpdate
                        ? '✅ कार्ड अपडेट हो गया! Card updated successfully!'
                        : 'ℹ️ कोई बदलाव नहीं मिला। No changes were detected.',
                    'success'
                );
            } else {
                const membershipNo  = await getNextMembershipNo();
                const issuingDate   = formatDate(new Date());

                currentMemberData = {
                    name: memberName, fatherName, dob, gender,
                    aadhaar: aadhaarNo, phone: phoneNo, city, state,
                    photo: uploadedPhotoDataURL,
                    membershipNo, issuingDate,
                    createdAt: new Date().toISOString()
                };

                await populateCard(currentMemberData);
                await saveToFirebase(currentMemberData);
                originalMemberData = { ...currentMemberData };

                cardSection.classList.add('visible');
                cardSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                showToast('🎉 कार्ड सफलतापूर्वक बन गया! Card generated successfully!', 'success');
            }

        } catch (err) {
            console.error('Error generating card:', err);
            showToast('कार्ड बनाने में त्रुटि! Error generating card. Check console.', 'error');
        } finally {
            btnGenerate.disabled = false;
            if (!isEditMode) btnGenerate.innerHTML = '🪪 कार्ड बनाएं — Generate Card';
        }
    });
}

// ─── Edit Card ────────────────────────────────────────────────

function editCard() {
    if (!currentMemberData) return;
    isEditMode = true;

    document.getElementById('memberName').value  = currentMemberData.name        || '';
    document.getElementById('fatherName').value  = currentMemberData.fatherName  || '';
    document.getElementById('dob').value         = currentMemberData.dob         || '';
    document.getElementById('gender').value      = currentMemberData.gender      || '';
    document.getElementById('aadhaarNo').value   = currentMemberData.aadhaar     || '';
    document.getElementById('phoneNo').value     = currentMemberData.phone       || '';
    document.getElementById('city').value        = currentMemberData.city        || '';
    document.getElementById('state').value       = currentMemberData.state       || '';

    uploadedPhotoDataURL = currentMemberData.photo;
    if (photoPreview) {
        photoPreview.innerHTML = uploadedPhotoDataURL
            ? `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`
            : '<span class="placeholder-icon">📷</span>';
    }
    if (photoUploadArea) photoUploadArea.style.borderColor = uploadedPhotoDataURL ? 'var(--green)' : '';

    if (btnGenerate) btnGenerate.innerHTML = '✏️ कार्ड अपडेट करें — Update Card';

    cardSection.classList.remove('visible');
    document.getElementById('formSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('✏️ अपनी जानकारी बदलें और अपडेट करें।', 'success');
}

// ─── Image helpers ────────────────────────────────────────────

function compressImage(dataURL, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
            if (h > maxHeight) { w = (maxHeight / h) * w; h = maxHeight; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image could not be loaded for compression'));
        img.src = dataURL;
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

// ─── Cached asset loaders ─────────────────────────────────────

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

let _presidentImg = null;
function getPresidentImg() {
    if (_presidentImg) return Promise.resolve(_presidentImg);
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { _presidentImg = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.crossOrigin = 'anonymous';
        img.src = 'assets/president.jpeg';
    });
}

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

let _tarazuImg = null;
function getTarazuImg() {
    if (_tarazuImg) return Promise.resolve(_tarazuImg);
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { _tarazuImg = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.crossOrigin = 'anonymous';
        img.src = 'assets/tarazu.png';
    });
}

let _kuldeviImg = null;
function getKuldeviImg() {
    if (_kuldeviImg) return Promise.resolve(_kuldeviImg);
    return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { _kuldeviImg = img; resolve(img); };
        img.onerror = () => resolve(null);
        img.crossOrigin = 'anonymous';
        img.src = 'assets/khuldevi.jpg.jpeg';
    });
}

// ─── Canvas helpers ───────────────────────────────────────────

function getMemberMeta(data) {
    return {
        name:       data.name,
        fatherName: data.fatherName,
        dob:        data.dob    || '',
        gender:     data.gender || '',
        aadhaar:    data.aadhaar,
        phone:      data.phone,
        city:       data.city,
        state:      data.state,
    };
}

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

// ══════════════════════════════════════════════════════════
//  CANVAS CARD DRAWING — preview = download, always
// ══════════════════════════════════════════════════════════

async function drawCardFront(canvas, data) {
    const S = 3;
    const W = 500*S, H = 310*S;
    const ctx = canvas.getContext('2d');
    await document.fonts.ready;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const NAVY  = '#1a2d5a';
    const TEAL  = '#2eb8d0';
    const GOLD  = '#c8993a';
    const WHITE = '#ffffff';
    const HDR_H = 72*S;
    const FTR_H = 38*S;
    const RADIUS = 14*S;

    rr(ctx, 0, 0, W, H, RADIUS);
    ctx.fillStyle = WHITE;
    ctx.fill();

    rrTop(ctx, 0, 0, W, HDR_H, RADIUS);
    ctx.fillStyle = NAVY;
    ctx.fill();

    ctx.fillStyle = GOLD;
    ctx.fillRect(0, HDR_H, W, 3*S);

    rrBottom(ctx, 0, H - FTR_H, W, FTR_H, RADIUS);
    ctx.fillStyle = TEAL;
    ctx.fill();

    const logo = await getLogoImg();
    if (logo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(36*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, 10*S, 10*S, 52*S, 52*S);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(36*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5*S;
        ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = `${8*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Reg. No. : S/3369/SDM/NW/2018', W/2, 17*S);

    ctx.fillStyle = WHITE;
    ctx.font = `bold ${17*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('अखिल भारतीय माहौर ग्वार्रे  वैश्य महासभा®', W/2, 38*S);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${9*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', W/2, 54*S);

    const tarazuLogo = await getTarazuImg();
    if (tarazuLogo) {
        ctx.save();
        ctx.beginPath();
        ctx.arc((500-36)*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(tarazuLogo, (500-62)*S, 10*S, 52*S, 52*S);
        ctx.restore();
        ctx.beginPath();
        ctx.arc((500-36)*S, 36*S, 26*S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5*S;
        ctx.stroke();
    }

    if (logo) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.drawImage(logo, 130*S, 75*S, 170*S, 170*S);
        ctx.restore();
    }

    ctx.fillStyle = '#138808';
    ctx.font = `bold ${13.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('✦  General Member  ✦', W/2, 92*S);

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
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2*S;
    rr(ctx, px, py, pw, ph, 6*S);
    ctx.stroke();

    ctx.textAlign = 'left';
    const lx = 18*S;
    let   ly = 112*S;

    ctx.fillStyle = NAVY;
    ctx.font = `bold ${15*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText((data.name || '').toUpperCase(), lx, ly); ly += 22*S;

    ctx.fillStyle = '#333';
    ctx.font = `${10.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText(`S/o. Shri ${data.fatherName || ''}`, lx, ly); ly += 15.5*S;

    let dobText = data.dob ? data.dob.split('-').reverse().join('/') : '';
    ctx.fillText(`DOB: ${dobText}   Gender: ${data.gender || ''}`, lx, ly); ly += 15.5*S;

    const phoneDisplay = data.phone
        ? `+91 ${data.phone.slice(0, 5)} ${data.phone.slice(5)}`
        : '';
    ctx.fillText(phoneDisplay, lx, ly); ly += 15.5*S;
    ctx.fillText(`Aadhaar: ${maskAadhaar(data.aadhaar || '')}`, lx, ly); ly += 15.5*S;

    ctx.fillText((data.city  || '').toUpperCase(), lx, ly); ly += 15.5*S;
    ctx.fillText((data.state || '').toUpperCase(), lx, ly);

    ctx.fillStyle = '#7a2200';
    ctx.font = `bold ${11*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`Membership No. : ${data.membershipNo || ''}`, 16*S, H - 11*S);
    ctx.textAlign = 'right';
    ctx.fillText(`Issuing Date : ${data.issuingDate || ''}`, (500-16)*S, H - 11*S);
}

async function drawCardBack(canvas, data) {
    const S = 3;
    const W = 500*S, H = 310*S;
    const ctx = canvas.getContext('2d');
    await document.fonts.ready;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const NAVY   = '#1a2d5a';
    const TEAL   = '#2eb8d0';
    const GOLD   = '#c8993a';
    const WHITE  = '#ffffff';
    const MAROON = '#7a2200';
    const HDR_H  = 64*S;
    const FTR_H  = 36*S;
    const RADIUS = 14*S;

    rr(ctx, 0, 0, W, H, RADIUS);
    ctx.fillStyle = WHITE;
    ctx.fill();

    rrTop(ctx, 0, 0, W, HDR_H, RADIUS);
    ctx.fillStyle = NAVY;
    ctx.fill();

    ctx.fillStyle = GOLD;
    ctx.fillRect(0, HDR_H, W, 3*S);

    rrBottom(ctx, 0, H - FTR_H, W, FTR_H, RADIUS);
    ctx.fillStyle = TEAL;
    ctx.fill();

    const logo = await getLogoImg();
    if (logo) {
        ctx.save(); ctx.beginPath(); ctx.arc(36*S, 32*S, 22*S, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(logo, 14*S, 10*S, 44*S, 44*S); ctx.restore();
        ctx.beginPath(); ctx.arc(36*S, 32*S, 22*S, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5*S; ctx.stroke();

        const kuldeviLogo = await getKuldeviImg();
        if (kuldeviLogo) {
            ctx.save(); ctx.beginPath(); ctx.arc((500-36)*S, 32*S, 22*S, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(kuldeviLogo, (500-58)*S, 10*S, 44*S, 44*S); ctx.restore();
            ctx.beginPath(); ctx.arc((500-36)*S, 32*S, 22*S, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5*S; ctx.stroke();
        }
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `${7.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Reg. No. : S/3369/SDM/NW/2018', W/2, 14*S);

    ctx.fillStyle = WHITE;
    ctx.font = `bold ${16*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('अखिल भारतीय माहौर ग्वार्रे वैश्य महासभा®', W/2, 35*S);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', W/2, 50*S);

    if (logo) {
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.drawImage(logo, 160*S, 85*S, 180*S, 180*S);
        ctx.restore();
    }

    let addrY = HDR_H + 18*S;
    ctx.textAlign = 'center';
    ctx.fillStyle = MAROON;
    ctx.font = `bold ${10.5*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('कार्यालय का पता : 65 पंचवटी वस्त्र नगर, रोशनी घर के पीछे, लश्कर, ग्वालियर (म.प्र.) - 474001', W/2, addrY);

    ctx.fillStyle = '#666';
    ctx.font = `${8*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Office: 65 Panchvati, Vastra Nagar, Behind Roshni Ghar, Lashkar, Gwalior (M.P.) - 474001', W/2, addrY + 14*S);

    const sigY = addrY + 30*S;
    const sigW = 135*S, sigH = 75*S;
    const sig1X = 25*S, sig2X = 182.5*S, sig3X = 340*S;
    const sigR = 6*S;

    function drawSigBox(sx) {
        ctx.fillStyle = 'rgba(26,45,90,0.03)';
        rr(ctx, sx, sigY, sigW, sigH, sigR);
        ctx.fill();
        ctx.strokeStyle = 'rgba(26,45,90,0.1)';
        ctx.lineWidth = 1*S;
        rr(ctx, sx, sigY, sigW, sigH, sigR);
        ctx.stroke();
    }

    drawSigBox(sig1X);
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('MEMBER SIGNATURE', sig1X + sigW/2, sigY + 16*S);
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.moveTo(sig1X + 15*S, sigY + 55*S); ctx.lineTo(sig1X + sigW - 15*S, sigY + 55*S); ctx.stroke();

    drawSigBox(sig2X);
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Auth. Signature', sig2X + sigW/2, sigY + 16*S);

    const sigImg = await getPresidentSigImg();
    if (sigImg) {
        ctx.save();
        rr(ctx, sig2X, sigY, sigW, sigH, sigR);
        ctx.clip();
        const siw = sigImg.naturalWidth || sigImg.width;
        const sih = sigImg.naturalHeight || sigImg.height;
        const maxW = sigW - 10*S, maxH = 35*S;
        const scale = Math.min(maxW / siw, maxH / sih);
        ctx.drawImage(sigImg, sig2X + (sigW - siw*scale)/2, sigY + 16*S + (maxH - sih*scale)/2, siw*scale, sih*scale);
        ctx.restore();
    } else {
        ctx.beginPath(); ctx.moveTo(sig2X + 15*S, sigY + 55*S); ctx.lineTo(sig2X + sigW - 15*S, sigY + 55*S); ctx.stroke();
    }
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${7.5*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('प्रकाश चंद्र मांडिल', sig2X + sigW/2, sigY + 62*S);
    ctx.fillStyle = '#555';
    ctx.font = `${6.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('(National President)', sig2X + sigW/2, sigY + 72*S);

    drawSigBox(sig3X);
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Auth. Signature', sig3X + sigW/2, sigY + 16*S);

    const secSigImg = await loadImg('assets/sectry-signature.png');
    if (secSigImg) {
        ctx.save();
        rr(ctx, sig3X, sigY, sigW, sigH, sigR);
        ctx.clip();
        const siw = secSigImg.naturalWidth || secSigImg.width;
        const sih = secSigImg.naturalHeight || secSigImg.height;
        const maxW = sigW - 10*S, maxH = 35*S;
        const scale = Math.min(maxW / siw, maxH / sih);
        ctx.drawImage(secSigImg, sig3X + (sigW - siw*scale)/2, sigY + 16*S + (maxH - sih*scale)/2, siw*scale, sih*scale);
        ctx.restore();
    } else {
        ctx.beginPath(); ctx.moveTo(sig3X + 15*S, sigY + 55*S); ctx.lineTo(sig3X + sigW - 15*S, sigY + 55*S); ctx.stroke();
    }
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${7.5*S}px 'Nirmala UI', 'Arial Unicode MS', sans-serif`;
    ctx.fillText('सुरेश चंद गुप्ता', sig3X + sigW/2, sigY + 62*S);
    ctx.fillStyle = '#555';
    ctx.font = `${6.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('(National Secretary)', sig3X + sigW/2, sigY + 72*S);

    const instY = sigY + sigH + 16*S;

    const qrBackImg = await loadImg('assets/qr.jpeg');
    if (qrBackImg) ctx.drawImage(qrBackImg, 18*S, instY - 8*S, 45*S, 45*S);

    ctx.textAlign = 'center';
    ctx.fillStyle = NAVY;
    ctx.font = `bold ${8.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('Instructions', 250*S, instY);

    ctx.fillStyle = '#555';
    ctx.font = `${6.5*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.fillText('This card is property of Akhil Bhartiya Mahour Gware Vaishya Mahasabha and is nontransferable.', 250*S, instY + 12*S);
    ctx.fillText('The use of this card is governed by the terms and conditions of A.B.M.G.V.M registered legislation.', 250*S, instY + 22*S);
    ctx.fillText('If found, please return to the office address mentioned above.', 250*S, instY + 32*S);

    ctx.fillStyle = WHITE;
    ctx.font = `bold ${9*S}px 'Segoe UI', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('📞 President : 9826654877', 18*S, H - 11*S);
    ctx.textAlign = 'center';
    ctx.fillText('📞 Reg. Office : 6261507117', 250*S, H - 11*S);
    ctx.textAlign = 'right';
    ctx.fillText('📞 Secretary : 9893167002', (500-18)*S, H - 11*S);
}

async function populateCard(data) {
    const frontCanvas = document.getElementById('cardFront');
    const backCanvas  = document.getElementById('cardBack');
    if (!frontCanvas || !backCanvas) return;
    await Promise.all([
        drawCardFront(frontCanvas, data),
        drawCardBack(backCanvas,  data)
    ]);
}

// ─── Firebase helpers ─────────────────────────────────────────

async function getNextMembershipNo() {
    const counterRef = db.collection('meta').doc('counter');
    const num = await db.runTransaction(async (txn) => {
        const snap = await txn.get(counterRef);
        const next = (snap.exists ? snap.data().value : 0) + 1;
        txn.set(counterRef, { value: next });
        return next;
    });
    return 'JM' + String(num).padStart(4, '0');
}

async function saveToFirebase(data) {
    const memberRef = db.collection('members').doc();
    currentFirebaseKey = memberRef.id;

    const batch = db.batch();
    batch.set(memberRef, {
        ...getMemberMeta(data),
        membershipNo: data.membershipNo,
        issuingDate:  data.issuingDate,
        createdAt:    new Date().toISOString()
    });
    batch.set(db.collection('memberPhotos').doc(currentFirebaseKey), {
        photo: data.photo || null
    });
    await batch.commit();
    console.log('✅ Saved to Firestore, id:', currentFirebaseKey);
}

async function updateInFirebase(data, previousData = null) {
    if (!currentFirebaseKey) throw new Error('No Firestore ID to update');

    const nextMeta = getMemberMeta(data);
    const prevMeta = previousData ? getMemberMeta(previousData) : {};
    const changedFields = {};

    Object.keys(nextMeta).forEach((key) => {
        if (nextMeta[key] !== prevMeta[key]) changedFields[key] = nextMeta[key];
    });

    const photoChanged = data.photo !== (previousData ? previousData.photo : undefined);

    if (Object.keys(changedFields).length === 0 && !photoChanged) return false;

    const batch = db.batch();

    if (Object.keys(changedFields).length > 0) {
        changedFields.updatedAt = new Date().toISOString();
        batch.update(db.collection('members').doc(currentFirebaseKey), changedFields);
    }
    if (photoChanged) {
        batch.set(db.collection('memberPhotos').doc(currentFirebaseKey), { photo: data.photo || null });
    }

    await batch.commit();
    console.log('✅ Updated in Firestore, id:', currentFirebaseKey);
    return true;
}

// ─── Download ─────────────────────────────────────────────────

async function downloadCardPNG() {
    if (!currentMemberData) { showToast('पहले कार्ड बनाएं!', 'error'); return; }
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

        const a = document.createElement('a');
        a.download = `ABMGVM_Card_${(currentMemberData.name || 'member').replace(/\s+/g, '_')}.png`;
        a.href = out.toDataURL('image/png');
        a.click();
        showToast('✅ PNG Downloaded!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Error downloading PNG', 'error');
    }
}

async function downloadCardPDF() {
    if (!currentMemberData) { showToast('पहले कार्ड बनाएं!', 'error'); return; }
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

        pdf.save(`ABMGVM_Card_${(currentMemberData.name || 'member').replace(/\s+/g, '_')}.pdf`);
        showToast('✅ PDF Downloaded!', 'success');
    } catch(e) {
        console.error(e);
        showToast('Error downloading PDF', 'error');
    }
}

// ─── Toast ────────────────────────────────────────────────────

function showToast(message, type = 'success') {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.className = `toast ${type} visible`;
    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => toastEl.classList.remove('visible'), 4000);
}

// ─── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    attachInputFormatters();
    attachPhotoUpload();
    attachFormSubmit();

    // Close modals on overlay click
    const findModal = document.getElementById('findModal');
    if (findModal) findModal.addEventListener('click', e => { if (e.target === findModal) closeFindModal(); });

    const errorModal = document.getElementById('errorModal');
    if (errorModal) errorModal.addEventListener('click', e => { if (e.target === errorModal) closeErrorModal(); });

    // Pre-warm the phone list in background
    loadAllowedPhoneNumbers().catch(err => console.warn('Could not preload numbers.csv:', err));

    // Handle ?edit=ID URL param (admin redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const editId = urlParams.get('edit');
    if (editId && document.getElementById('cardForm')) {
        try {
            showToast('Loading member data...', 'success');
            const [snap, photoSnap] = await Promise.all([
                db.collection('members').doc(editId).get(),
                db.collection('memberPhotos').doc(editId).get()
            ]);

            if (snap.exists) {
                currentMemberData = snap.data();
                if (photoSnap.exists) currentMemberData.photo = photoSnap.data().photo;
                originalMemberData = { ...currentMemberData };
                currentFirebaseKey = editId;
                isEditMode = true;

                document.getElementById('memberName').value  = currentMemberData.name        || '';
                document.getElementById('fatherName').value  = currentMemberData.fatherName  || '';
                document.getElementById('dob').value         = currentMemberData.dob         || '';
                document.getElementById('gender').value      = currentMemberData.gender      || '';
                document.getElementById('aadhaarNo').value   = currentMemberData.aadhaar     || '';
                document.getElementById('phoneNo').value     = normalizeIndianPhone(currentMemberData.phone || '');
                document.getElementById('city').value        = currentMemberData.city        || '';
                document.getElementById('state').value       = currentMemberData.state       || '';

                uploadedPhotoDataURL = currentMemberData.photo;
                if (photoPreview && photoUploadArea && uploadedPhotoDataURL) {
                    photoPreview.innerHTML = `<img src="${uploadedPhotoDataURL}" alt="Your Photo">`;
                    photoUploadArea.style.borderColor = 'var(--green)';
                }
                if (btnGenerate) btnGenerate.innerHTML = '✏️ कार्ड अपडेट करें — Update Card';
                showToast('✏️ Edit Mode. Update details below.', 'success');
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                showToast('❌ Member not found!', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Error loading member data', 'error');
        }
    }
});
