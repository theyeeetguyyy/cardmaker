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

// --- Phone formatting ---
const phoneInput = document.getElementById('phoneNo');
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

// --- Photo Upload ---
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
    document.getElementById('findPhone').value = '';
    document.getElementById('findAadhaar').value = '';
}

function closeFindModal() {
    document.getElementById('findModal').classList.remove('visible');
}

// Close find modal on overlay click
document.getElementById('findModal').addEventListener('click', function (e) {
    if (e.target === this) closeFindModal();
});

async function submitFindCard(e) {
    e.preventDefault();
    
    let phoneQuery = document.getElementById('findPhone').value.trim();
    const aadhaarQuery = document.getElementById('findAadhaar').value.trim();
    const btn = document.getElementById('btnFindCardSearch');

    // Format phone exactly as we do in the input
    let valPhone = phoneQuery.replace(/[^\d+]/g, '');
    if (!valPhone.startsWith('+91') && !valPhone.startsWith('+')) {
        if (valPhone.startsWith('91') && valPhone.length > 10) {
            valPhone = '+' + valPhone;
        } else if (valPhone.length <= 10) {
            valPhone = '+91 ' + valPhone;
        }
    }
    phoneQuery = valPhone;

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
            if (child.val().phone === phoneQuery) {
                foundMember = child.val();
                foundKey = child.key;
            }
        });

        if (!foundMember) {
            showToast('❌ फोन नंबर मेल नहीं खा रहा है!', 'error');
            return;
        }

        // Successfully found! Load the data to current mode
        currentMemberData = foundMember;
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

// --- Mask Aadhaar to show only last 4 digits ---
function maskAadhaar(aadhaar) {
    // aadhaar is stored as "XXXX XXXX XXXX" (with spaces)
    const digits = aadhaar.replace(/\s/g, '');
    if (digits.length !== 12) return aadhaar;
    const last4 = digits.slice(-4);
    return `XXXX XXXX ${last4}`;
}

// --- Populate card with data ---
function populateCard(data) {
    document.getElementById('cardName').textContent = data.name.toUpperCase();
    document.getElementById('cardFather').textContent = `S/o. Shri ${data.fatherName}`;
    document.getElementById('cardPhone').textContent = data.phone;
    document.getElementById('cardAadhaar').textContent = `Aadhaar: ${maskAadhaar(data.aadhaar)}`;
    document.getElementById('cardCity').textContent = data.city.toUpperCase();
    document.getElementById('cardState').textContent = data.state.toUpperCase();
    document.getElementById('cardMemberNo').textContent = data.membershipNo;
    document.getElementById('cardDate').textContent = data.issuingDate;
    document.getElementById('cardPhoto').src = data.photo;

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

// --- Render card to canvas — force exact size via injected style, then capture ---
async function renderCardToCanvas(sourceEl) {
    // Inject a style that hard-locks both card elements to their natural size
    const styleEl = document.createElement('style');
    styleEl.id = '__card-capture-style__';
    styleEl.textContent = `
        #cardFront, #cardBack {
            width: 500px !important;
            height: 310px !important;
            min-width: 500px !important;
            min-height: 310px !important;
            max-height: 310px !important;
            transform: none !important;
            flex-shrink: 0 !important;
            overflow: hidden !important;
        }
        .card-flip-container {
            transform: none !important;
        }
    `;
    document.head.appendChild(styleEl);

    // One paint cycle for the styles to apply
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(sourceEl, {
        scale: 3,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: 500,
        height: 310
    });

    // Remove the injected style
    document.head.removeChild(styleEl);

    return canvas;
}

// --- Download PNG ---
async function downloadCardPNG() {
    if (!currentMemberData) {
        showToast('पहले कार्ड बनाएं! Please generate a card first.', 'error');
        return;
    }
    showToast('🖼️ PNG बन रहा है... Generating PNG...', 'success');

    try {
        const frontCanvas = await renderCardToCanvas(document.getElementById('cardFront'));
        const backCanvas  = await renderCardToCanvas(document.getElementById('cardBack'));

        // Create combined canvas (front on top, back below)
        const gap = 60;
        const combinedCanvas = document.createElement('canvas');
        combinedCanvas.width  = frontCanvas.width;
        combinedCanvas.height = frontCanvas.height + gap + backCanvas.height;
        const ctx = combinedCanvas.getContext('2d');

        // Light grey background
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);

        ctx.drawImage(frontCanvas, 0, 0);
        ctx.drawImage(backCanvas,  0, frontCanvas.height + gap);

        const safeName = (currentMemberData.name || 'member').replace(/\s+/g, '_');
        const link = document.createElement('a');
        link.download = `ABMGVM_Card_${safeName}.png`;
        link.href = combinedCanvas.toDataURL('image/png');
        link.click();

        showToast('✅ PNG डाउनलोड हो गया! PNG Downloaded!', 'success');
    } catch (err) {
        console.error('PNG download error:', err);
        showToast('PNG डाउनलोड में त्रुटि! Error downloading PNG.', 'error');
    }
}

// --- Download PDF ---
async function downloadCardPDF() {
    if (!currentMemberData) {
        showToast('पहले कार्ड बनाएं! Please generate a card first.', 'error');
        return;
    }
    showToast('📄 PDF बन रहा है... Generating PDF...', 'success');

    try {
        const { jsPDF } = window.jspdf;

        const frontCanvas = await renderCardToCanvas(document.getElementById('cardFront'));
        const backCanvas  = await renderCardToCanvas(document.getElementById('cardBack'));

        // Card dimensions in mm (standard ID card: 85.6mm x 53.98mm)
        const cardW = 85.6;
        const cardH = 53.98;

        // A4 page
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();

        // Center cards on page
        const xOffset = (pageW - cardW) / 2;
        let yOffset = 30;

        // Title
        pdf.setFontSize(12);
        pdf.setTextColor(26, 45, 90);
        pdf.text('Akhil Bhartiya Mahour Gware Vaishya Mahasabha', pageW / 2, 15, { align: 'center' });
        pdf.setFontSize(9);
        pdf.text('Membership Card — Front & Back', pageW / 2, 22, { align: 'center' });

        // Front card
        pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', xOffset, yOffset, cardW, cardH);

        // Back card
        yOffset += cardH + 15;
        pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', xOffset, yOffset, cardW, cardH);

        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Generated by ABMGVM Card Maker', pageW / 2, pageH - 10, { align: 'center' });

        const safeName = (currentMemberData.name || 'member').replace(/\s+/g, '_');
        pdf.save(`ABMGVM_Card_${safeName}.pdf`);

        showToast('✅ PDF डाउनलोड हो गया! PDF Downloaded!', 'success');
    } catch (err) {
        console.error('PDF download error:', err);
        showToast('PDF डाउनलोड में त्रुटि! Error downloading PDF.', 'error');
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
