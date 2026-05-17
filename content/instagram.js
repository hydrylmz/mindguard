console.log("[MindGuard] Instagram content script yüklendi");

// ─── Analiz Overlay (Tam Ekran CSP Uyumlu) ───

let overlay = null;

function showAnalysisOverlay(count) {
  if (overlay) {
    const textSpan = document.getElementById("mg-overlay-text");
    if (textSpan) textSpan.innerHTML = `🛡️ MindGuard: <strong>${count}</strong> içerik analiz ediliyor...`;
    return;
  }

  overlay = document.createElement("div");
  overlay.id = "mindguard-overlay";
  
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
  text.id = "mg-overlay-text";
  text.innerHTML = `🛡️ MindGuard: <strong>${count}</strong> içerik analiz ediliyor...`;
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
      
      console.log(`[MindGuard] Gönderi DOM'da algılandı: shortcode=${shortcode}`);
      
      // Zaten verilmiş bir karar var mı kontrol et
      if (decisions.has(shortcode)) {
        applyDecisionToArticle(article, decisions.get(shortcode));
      }
    }
  }
}

// Kararı Gönderiye Uygula
function applyDecisionToArticle(article, decision) {
  if (article.dataset.mindguardFiltered === "true") return;
  
  if (decision.action === "blur") {
    applyBlurOverlay(article, decision.reason);
  } else if (decision.action === "warn") {
    applyWarningBanner(article, decision.reason);
  }
  
  article.dataset.mindguardFiltered = "true";
}

// ─── 🔴 BLUR PERDESİ (Overlay) UYGULA ───
function applyBlurOverlay(article, reason) {
  const mediaContainer = findMediaContainer(article);
  if (!mediaContainer) {
    console.warn("[MindGuard] Medya container bulunamadı, blur uygulanamadı.");
    return;
  }

  // Orijinal medya kapsayıcısını relative yap
  mediaContainer.style.position = "relative";

  // Gönderideki asıl resmi veya videoyu bulup doğrudan blur uygula (Aspect ratio ve CSP uyumlu en kesin yöntem)
  const imgOrVideo = mediaContainer.querySelector("img, video");
  if (imgOrVideo) {
    imgOrVideo.style.filter = "blur(35px)";
    imgOrVideo.style.transition = "filter 0.4s ease";
  }

  const overlay = document.createElement("div");
  overlay.className = "mindguard-blur-overlay";
  
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
  title.innerHTML = "<strong>MindGuard Perdesi</strong>";
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
    if (imgOrVideo) {
      imgOrVideo.style.filter = "none";
    }
    setTimeout(() => overlay.remove(), 400);
  });

  overlay.appendChild(icon);
  overlay.appendChild(title);
  overlay.appendChild(desc);
  overlay.appendChild(button);
  
  mediaContainer.appendChild(overlay);
  console.log("[MindGuard] 🔴 Blur perdesi DOM'a eklendi ve görsel buzlandı.");
}

// ─── 🟡 UYARI BANDI (Warning Banner) UYGULA ───
function applyWarningBanner(article, reason) {
  const banner = document.createElement("div");
  banner.className = "mindguard-warning-banner";
  
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

  banner.innerHTML = `⚠️ <span style="flex-grow: 1;">MindGuard Hassas İçerik Uyarısı: <strong>${reason}</strong> olabilir.</span>`;
  
  // Gönderinin en üstüne yerleştir (Header altına)
  const header = article.querySelector("header") || article.firstChild;
  if (header && header.nextSibling) {
    article.insertBefore(banner, header.nextSibling);
  } else {
    article.insertBefore(banner, article.firstChild);
  }
  console.log("[MindGuard] 🟡 Uyarı bandı DOM'a eklendi.");
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
    console.log(`[MindGuard] Karar alındı: shortcode=${msg.postId} aksiyon=${msg.action} sebep="${msg.reason}"`);
    
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

