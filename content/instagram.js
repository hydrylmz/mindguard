console.log("[NexGuard] Instagram content script yüklendi");

// ─── Analiz Overlay (Tam Ekran CSP Uyumlu) ───

let overlay = null;

const preventScroll = (e) => {
    e.preventDefault();
};

const preventKeys = (e) => {
    // Arrow keys, Space, Page Up, Page Down, Home, End
    if ([32, 33, 34, 35, 36, 37, 38, 39, 40].includes(e.keyCode)) {
        e.preventDefault();
    }
};

function showAnalysisOverlay(count) {
    // Scroll engelle (Event tabanlı, zıplamayı önler)
    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventKeys, { passive: false });

    if (overlay) {
        const textSpan = document.getElementById("nx-overlay-text");
        if (textSpan) textSpan.innerHTML = `🛡️ NexGuard: <strong>${count}</strong> içerik analiz ediliyor...`;
        return;
    }

    overlay = document.createElement("div");
    overlay.id = "nexguard-overlay";

    // Tam ekran CSP uyumlu ayarlar
    Object.assign(overlay.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        zIndex: "999999",
        background: "rgba(10, 10, 10, 0.85)",
        backdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "#ffffff",
        fontFamily: "-apple-system, system-ui, sans-serif",
        fontSize: "18px",
        gap: "24px"
    });

    // İkon container'ı (Pulsing efekti için)
    const iconContainer = document.createElement("div");
    Object.assign(iconContainer.style, {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "120px",
        height: "120px",
        background: "rgba(99,102,241,0.15)",
        borderRadius: "50%",
        boxShadow: "0 0 40px rgba(99,102,241,0.3)"
    });

    // Animasyon
    iconContainer.animate([
        { transform: "scale(0.95)", boxShadow: "0 0 20px rgba(99,102,241,0.2)" },
        { transform: "scale(1.05)", boxShadow: "0 0 60px rgba(99,102,241,0.6)" },
        { transform: "scale(0.95)", boxShadow: "0 0 20px rgba(99,102,241,0.2)" }
    ], {
        duration: 2000,
        iterations: Infinity,
        easing: "ease-in-out"
    });

    // Eklenti İkonu
    const iconImg = document.createElement("img");
    iconImg.src = chrome.runtime.getURL("assets/icon-48.png");
    Object.assign(iconImg.style, {
        width: "64px",
        height: "64px",
        borderRadius: "12px"
    });
    iconContainer.appendChild(iconImg);

    const text = document.createElement("span");
    text.id = "nx-overlay-text";
    text.innerHTML = `🛡️ NexGuard: <strong>${count}</strong> içerik analiz ediliyor...`;
    Object.assign(text.style, {
        fontWeight: "500",
        letterSpacing: "0.5px",
        textShadow: "0 2px 10px rgba(0,0,0,0.5)"
    });

    overlay.appendChild(iconContainer);
    overlay.appendChild(text);
    document.body.appendChild(overlay);

    overlay.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 400,
        easing: "ease-out"
    });
}

function hideAnalysisOverlay() {
    // Scroll kilidini kaldır
    window.removeEventListener('wheel', preventScroll);
    window.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('keydown', preventKeys);

    if (!overlay) return;
    const anim = overlay.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 400,
        easing: "ease-in"
    });

    anim.onfinish = () => {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    };
}

// ─── DOM Eşleştirme ve Filtreleme (Faz 4) ───

const decisions = new Map(); // shortcode -> {action, reason, score}
const processedArticles = new Set();

// Sayfadaki Instagram Gönderilerini (Article) Tara
function scanFeedDOM() {
    const articles = document.querySelectorAll("article");

    for (const article of articles) {
        if (processedArticles.has(article)) continue;

        // Gönderinin linkini (shortcode) bul (örn: /p/CqvKaKO6gmm/)
        const links = article.querySelectorAll("a");
        let shortcode = null;

        for (const link of links) {
            const href = link.getAttribute("href");
            if (href) {
                const match = href.match(/\/p\/([^/]+)\//);
                if (match) {
                    shortcode = match[1];
                    break;
                }
            }
        }

        if (shortcode) {
            article.dataset.shortcode = shortcode;
            processedArticles.add(article);

            console.log(`[NexGuard] Gönderi DOM'da algılandı: shortcode=${shortcode}`);

            // Zaten verilmiş bir karar var mı kontrol et
            if (decisions.has(shortcode)) {
                applyDecisionToArticle(article, decisions.get(shortcode));
            }
        }
    }

    enforceBlurPersistency();
}

function enforceBlurPersistency() {
    const articles = document.querySelectorAll("article");
    for (const article of articles) {
        if (article.dataset.nexguardUnblurred === "true") continue;
        const shortcode = article.dataset.shortcode;
        if (!shortcode) continue;
        const decision = decisions.get(shortcode);
        if (decision && decision.action === "blur") {
             const mediaContainer = findMediaContainer(article);
             if (!mediaContainer) continue;
             const overlay = mediaContainer.querySelector(".nexguard-blur-overlay");
             if (!overlay) {
                 console.log("[NexGuard] Instagram DOM güncelledi, blur perdesi tekrar uygulanıyor...");
                 article.dataset.nexguardFiltered = "false";
                 applyDecisionToArticle(article, decision);
             } else {
                 const video = mediaContainer.querySelector("video");
                 if (video && !video.paused) {
                     video.pause();
                     video.muted = true;
                 }
                 if (video && video.style.filter !== "blur(35px)") {
                     video.style.filter = "blur(35px)";
                 }
             }
        }
    }
}

// Kararı Gönderiye Uygula
function applyDecisionToArticle(article, decision) {
    if (article.dataset.nexguardFiltered === "true") return;

    if (decision.action === "blur") {
        applyBlurOverlay(article, decision.reason);
    } else if (decision.action === "warn") {
        applyWarningBanner(article, decision.reason);
    }

    article.dataset.nexguardFiltered = "true";
}

// ─── 🔴 BLUR PERDESİ (Overlay) UYGULA ───
function applyBlurOverlay(article, reason) {
    const mediaContainer = findMediaContainer(article);
    if (!mediaContainer) {
        console.warn("[NexGuard] Medya container bulunamadı, blur uygulanamadı.");
        return;
    }

    // Orijinal medya kapsayıcısını relative yap
    mediaContainer.style.position = "relative";

    // Gönderideki asıl resmi veya videoyu bulup doğrudan blur uygula (Aspect ratio ve CSP uyumlu en kesin yöntem)
    const imgOrVideo = mediaContainer.querySelector("img, video");
    let videoPlayPreventer = null;

    if (imgOrVideo) {
        imgOrVideo.style.filter = "blur(35px)";
        imgOrVideo.style.transition = "filter 0.4s ease";

        // Otomatik oynatılan videoların sesini ve kendisini durdur
        if (imgOrVideo.tagName === "VIDEO") {
            imgOrVideo.pause();
            imgOrVideo.muted = true;

            videoPlayPreventer = () => {
                if (overlay && overlay.parentElement) {
                    imgOrVideo.pause();
                } else {
                    imgOrVideo.removeEventListener("play", videoPlayPreventer);
                }
            };
            imgOrVideo.addEventListener("play", videoPlayPreventer);
        }
    }

    const overlay = document.createElement("div");
    overlay.className = "nexguard-blur-overlay";

    // CSP Uyumlu ve padding-bottom aspect ratio bug'ını (0px height) çözen stil (top:0/bottom:0)
    Object.assign(overlay.style, {
        position: "absolute",
        top: "0",
        bottom: "0",
        left: "0",
        right: "0",
        zIndex: "999",
        background: "rgba(12, 12, 12, 0.8)",
        backdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        color: "#ffffff",
        fontFamily: "-apple-system, system-ui, sans-serif",
        textAlign: "center",
        padding: "20px",
        boxSizing: "border-box",
        borderRadius: "inherit",
        transition: "opacity 0.4s ease"
    });

    const icon = document.createElement("div");
    icon.innerHTML = "🛡️";
    icon.style.fontSize = "40px";
    icon.style.marginBottom = "12px";

    const title = document.createElement("div");
    title.innerHTML = "<strong>NexGuard Perdesi</strong>";
    title.style.fontSize = "16px";
    title.style.marginBottom = "8px";

    const desc = document.createElement("div");
    desc.innerHTML = `Hassas içerik: <span style="color: #fbbf24; font-weight: 600;">${reason}</span>`;
    desc.style.fontSize = "13px";
    desc.style.marginBottom = "18px";
    desc.style.opacity = "0.9";

    const button = document.createElement("button");
    button.innerHTML = "Göster / Aç";
    Object.assign(button.style, {
        background: "#312e81",
        color: "#ffffff",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "20px",
        padding: "8px 24px",
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
    });

    button.addEventListener("mouseover", () => button.style.background = "#3730a3");
    button.addEventListener("mouseout", () => button.style.background = "#312e81");

    // Tıklayınca perdeyi kaldır ve resmi netleştir
    button.addEventListener("click", (e) => {
        e.stopPropagation();
        overlay.style.opacity = "0";
        article.dataset.nexguardUnblurred = "true";
        if (imgOrVideo) {
            imgOrVideo.style.filter = "none";
            if (imgOrVideo.tagName === "VIDEO") {
                if (videoPlayPreventer) imgOrVideo.removeEventListener("play", videoPlayPreventer);
                imgOrVideo.muted = false;
                imgOrVideo.play().catch(() => { });
            }
        }
        setTimeout(() => overlay.remove(), 400);
    });

    overlay.appendChild(icon);
    overlay.appendChild(title);
    overlay.appendChild(desc);
    overlay.appendChild(button);

    mediaContainer.appendChild(overlay);
    console.log("[NexGuard] 🔴 Blur perdesi DOM'a eklendi ve görsel buzlandı.");

    maybeShowCatMascot(article, "blur");
}

// ─── 🟡 UYARI BANDI (Warning Banner) UYGULA ───
function applyWarningBanner(article, reason) {
    const banner = document.createElement("div");
    banner.className = "nexguard-warning-banner";

    Object.assign(banner.style, {
        background: "rgba(245, 158, 11, 0.95)", // Şık Sarı/Turuncu
        color: "#000000",
        padding: "10px 16px",
        fontSize: "12px",
        fontWeight: "600",
        fontFamily: "-apple-system, system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
        boxSizing: "border-box",
        borderBottom: "1px solid rgba(0,0,0,0.1)"
    });

    banner.innerHTML = `⚠️ <span style="flex-grow: 1;">NexGuard Hassas İçerik Uyarısı: <strong>${reason}</strong> olabilir.</span>`;

    // Gönderinin en üstüne yerleştir (Header altına)
    const header = article.querySelector("header") || article.firstChild;
    if (header && header.nextSibling) {
        article.insertBefore(banner, header.nextSibling);
    } else {
        article.insertBefore(banner, article.firstChild);
    }
    console.log("[NexGuard] 🟡 Uyarı bandı DOM'a eklendi.");

    maybeShowCatMascot(article, "warn");
}

// ─── 🐱 KEDİ MASKOTU (NexGuard) ───
function maybeShowCatMascot(article, type) {
    // %50 ihtimalle çıksın (MVP için)
    if (Math.random() > 0.5) return;

    const mediaContainer = findMediaContainer(article);
    if (!mediaContainer) return;

    // Eğer bu gönderide zaten maskot varsa çıkma
    if (mediaContainer.querySelector(".nexguard-mascot-container")) return;

    mediaContainer.style.position = "relative";

    const mascotContainer = document.createElement("div");
    mascotContainer.className = "nexguard-mascot-container";
    Object.assign(mascotContainer.style, {
        position: "absolute",
        bottom: "20px",
        right: "20px",
        display: "flex",
        alignItems: "flex-end",
        gap: "10px",
        zIndex: "9999",
        pointerEvents: "none"
    });

    // Baloncuk
    const bubble = document.createElement("div");
    Object.assign(bubble.style, {
        position: "relative",
        background: "#ffffff",
        color: "#0f172a",
        padding: "16px 26px 16px 16px",
        borderRadius: "16px 16px 0 16px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        fontSize: "13px",
        fontWeight: "600",
        fontFamily: "-apple-system, sans-serif",
        maxWidth: "200px",
        opacity: "0",
        transform: "translateY(20px)",
        transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        pointerEvents: "auto",
        lineHeight: "1.4"
    });

    // Kedi resmi
    const catImg = document.createElement("img");
    catImg.src = chrome.runtime.getURL("assets/icon-48.png");
    Object.assign(catImg.style, {
        width: "50px",
        height: "50px",
        borderRadius: "50%",
        border: "3px solid #6366f1",
        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
        opacity: "0",
        transform: "scale(0.5)",
        transition: "all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.1s"
    });

    mascotContainer.appendChild(bubble);
    mascotContainer.appendChild(catImg);
    mediaContainer.appendChild(mascotContainer);

    const closeBtnHtml = `<span class="cat-close-btn" style="position:absolute; top:6px; right:10px; cursor:pointer; color:#94a3b8; font-size:18px; line-height:1; padding:0px;">&times;</span>`;

    // İçerik ayarla
    if (type === "blur") {
        bubble.innerHTML = closeBtnHtml + "Tercihlerine bağlı olarak bu videoyu kapattık, açmak istersen açabilirsin ama dikkatli ol! <br><br><em>meow~~</em> 🐾";
    } else if (type === "warn") {
        bubble.innerHTML = closeBtnHtml + `
      <div style="margin-bottom: 8px;">Bu içerik seni nasıl hissettirdi?</div>
      <div style="display: flex; gap: 8px; justify-content: center; font-size: 20px;" class="cat-emojis">
        <span style="cursor: pointer; transition: transform 0.2s;" class="c-emoji" title="Çok kötü">😡</span>
        <span style="cursor: pointer; transition: transform 0.2s;" class="c-emoji" title="Kötü">😟</span>
        <span style="cursor: pointer; transition: transform 0.2s;" class="c-emoji" title="Nötr">😐</span>
        <span style="cursor: pointer; transition: transform 0.2s;" class="c-emoji" title="İyi">😊</span>
      </div>
    `;
    }

    // Event Listener'lar
    setTimeout(() => {
        // Kapat tuşu event'i
        const closeBtn = bubble.querySelector(".cat-close-btn");
        if (closeBtn) {
            closeBtn.addEventListener("mouseover", () => closeBtn.style.color = "#ef4444");
            closeBtn.addEventListener("mouseout", () => closeBtn.style.color = "#94a3b8");
            closeBtn.addEventListener("click", () => removeMascot());
        }

        // Emoji event'i (Sadece warn)
        if (type === "warn") {
            const emojis = bubble.querySelectorAll(".c-emoji");
            emojis.forEach(emp => {
                emp.addEventListener("mouseover", () => emp.style.transform = "scale(1.2)");
                emp.addEventListener("mouseout", () => emp.style.transform = "scale(1)");
                emp.addEventListener("click", () => {
                    bubble.innerHTML = closeBtnHtml + "<div style='text-align:center; color:#10b981; font-size: 14px; margin-top:4px;'>Geri bildirimin algoritmana eklendi! 🐾</div>";

                    // Yeni oluşan kapat tuşuna da event ekle
                    const newCloseBtn = bubble.querySelector(".cat-close-btn");
                    if (newCloseBtn) {
                        newCloseBtn.addEventListener("mouseover", () => newCloseBtn.style.color = "#ef4444");
                        newCloseBtn.addEventListener("mouseout", () => newCloseBtn.style.color = "#94a3b8");
                        newCloseBtn.addEventListener("click", () => removeMascot());
                    }

                    setTimeout(() => removeMascot(), 3000);
                });
            });
        }
    }, 100);

    // Çıkış animasyonu (Request animation frame to allow DOM attach)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            bubble.style.opacity = "1";
            bubble.style.transform = "translateY(0)";
            catImg.style.opacity = "1";
            catImg.style.transform = "scale(1)";
        });
    });

    function removeMascot() {
        bubble.style.opacity = "0";
        bubble.style.transform = "translateY(20px)";
        catImg.style.opacity = "0";
        catImg.style.transform = "scale(0.5)";
        setTimeout(() => mascotContainer.remove(), 400);
    }
}

// Kapsayıcı Medya Elementini (Fotoğraf/Video wrapper) Seç
function findMediaContainer(article) {
    // Gönderideki büyük görselleri tara (Profil resmi hariç, >200px en)
    const imgs = article.querySelectorAll("img");
    for (const img of imgs) {
        if (img.width > 200 || img.naturalWidth > 200) {
            let parent = img.parentElement;
            while (parent && parent !== article) {
                if (parent.tagName === "DIV" && parent.offsetHeight > 200) {
                    return parent;
                }
                parent = parent.parentElement;
            }
        }
    }

    const video = article.querySelector("video");
    if (video) {
        let parent = video.parentElement;
        while (parent && parent !== article) {
            if (parent.tagName === "DIV" && parent.offsetHeight > 200) {
                return parent;
            }
            parent = parent.parentElement;
        }
    }

    return null;
}

// ─── Background'dan gelen mesajları dinle ───

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "ANALYSIS_STATUS") {
        if (msg.status === "start") {
            showAnalysisOverlay(msg.count);
        } else if (msg.status === "done") {
            hideAnalysisOverlay();
        }
    }

    if (msg.type === "POST_DECISION") {
        console.log(`[NexGuard] Karar alındı: shortcode=${msg.postId} aksiyon=${msg.action} sebep="${msg.reason}"`);

        // Kararı cache'le
        decisions.set(msg.postId, { action: msg.action, reason: msg.reason, score: msg.score });

        // DOM'da eşleşen article varsa hemen uygula
        const articles = document.querySelectorAll("article");
        for (const article of articles) {
            if (article.dataset.shortcode === msg.postId) {
                applyDecisionToArticle(article, decisions.get(msg.postId));
            }
        }
    }
});

// Sürekli akışı izleyen MutationObserver (Yeni postlar geldikçe tara)
const observer = new MutationObserver(() => {
    scanFeedDOM();
});
observer.observe(document.body, { childList: true, subtree: true });

// İlk açılışta tara
setTimeout(scanFeedDOM, 2000);
