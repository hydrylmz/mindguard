console.log("[NexGuard] background worker aktif");

const scoreCache = new Map(); // postId → {score, action, reason}
const knownNetworkPosts = new Set(); // Ağdan (JSON) gelen postlar

// Instagram endpoint pattern'leri
const IG_URLS = [
  "*://*.instagram.com/graphql/query*",
  "*://*.instagram.com/api/v1/feed/timeline/*",
  "*://i.instagram.com/api/v1/feed/timeline/*"
];

// Response body'yi yakala
function interceptResponse(details) {
  const filter = browser.webRequest.filterResponseData(details.requestId);
  const decoder = new TextDecoder("utf-8");
  let chunks = [];

  filter.ondata = (event) => {
    chunks.push(event.data);
    filter.write(event.data);
  };

  filter.onstop = () => {
    try {
      const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
      }

      const text = decoder.decode(merged);
      const json = JSON.parse(text);

      const posts = parseInstagramFeed(json);
      if (posts.length > 0) {
        // Zaten cache'de olanları filtrele
        const newPosts = posts.filter(p => p.id && !scoreCache.has(p.id));
        if (newPosts.length > 0) {
          console.log(`[NexGuard] ${newPosts.length} yeni post bulundu (toplam: ${posts.length})`);
          newPosts.forEach(p => knownNetworkPosts.add(p.id));
          analyzeBatch(newPosts);
        }
      }

    } catch (e) {
      // JSON değilse veya parse hatasıysa sessizce geç
    }
    filter.disconnect();
  };
}

// ─── Instagram JSON Parser ───

function parseInstagramFeed(json) {
  const posts = [];

  const edgeSources = [
    json?.data?.xdt_api__v1__feed__timeline_connection?.edges,
    json?.data?.xdt_api__v1__feed__timeline?.edges
  ];

  for (const edges of edgeSources) {
    if (!Array.isArray(edges)) continue;
    for (const edge of edges) {
      const node = edge?.node?.media || edge?.node;
      if (!node) continue;
      const caption =
        node.edge_media_to_caption?.edges?.[0]?.node?.text ||
        node.caption?.text || "";
      if (!caption) continue;
      const shortcode = node.shortcode || node.code || "";
      if (!shortcode) continue;
      const hashtags = (caption.match(/#\w+/g) || []).map(h => h.slice(1));
      posts.push({
        id: String(shortcode),
        caption: caption.slice(0, 300),
        hashtags,
        author: node.owner?.username || node.user?.username || "",
        isVideo: node.is_video || node.media_type === 2,
        platform: "instagram"
      });
    }
  }

  const timelineItems = json?.items || [];
  for (const item of timelineItems) {
    const caption = item.caption?.text || "";
    if (!caption) continue;
    const shortcode = item.code || "";
    if (!shortcode) continue;
    const hashtags = (caption.match(/#\w+/g) || []).map(h => h.slice(1));
    posts.push({
      id: String(shortcode),
      caption: caption.slice(0, 300),
      hashtags,
      author: item.user?.username || "",
      isVideo: item.media_type === 2,
      platform: "instagram"
    });
  }

  if (posts.length === 0) {
    findCaptionsDeep(json, posts, 0);
  }

  return posts;
}

function findCaptionsDeep(obj, posts, depth) {
  if (depth > 8 || posts.length >= 30) return;
  if (!obj || typeof obj !== "object") return;
  if (obj.caption && typeof obj.caption === "object" && obj.caption.text) {
    const caption = obj.caption.text;
    const hashtags = (caption.match(/#\w+/g) || []).map(h => h.slice(1));
    const shortcode = obj.shortcode || obj.code || "";
    if (shortcode && !posts.some(p => p.id === shortcode)) {
      posts.push({
        id: String(shortcode),
        caption: caption.slice(0, 300),
        hashtags,
        author: obj.owner?.username || obj.user?.username || "",
        isVideo: obj.is_video || obj.media_type === 2,
        platform: "instagram"
      });
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) findCaptionsDeep(item, posts, depth + 1);
  } else {
    for (const key of Object.keys(obj)) findCaptionsDeep(obj[key], posts, depth + 1);
  }
}

// ─── Batch Gemini Analiz (Tek İstek) ───

let batchQueue = [];
let batchTimer = null;

function analyzeBatch(posts) {
  batchQueue.push(...posts);

  // Kısa bir debounce: 500ms içinde gelen tüm postları biriktir
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    const batch = [...batchQueue];
    batchQueue = [];
    batchTimer = null;
    processBatch(batch);
  }, 500);
}

async function processBatch(posts) {
  if (posts.length === 0) return;

  // API key kontrolü
  if (!CONFIG.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY === "{{GEMINI_API_KEY}}") {
    console.warn("[NexGuard] Gemini API key ayarlanmamış!");
    return;
  }

  // Kullanıcı tercihlerini storage'dan çek
  let userProfile = { age: "Belirtilmemiş", pronoun: "Belirtilmemiş", triggers: [] };
  let activeFilters = { bodyImage: true, politics: true, violence: true, success: true, anxietyNews: true };

  try {
    const data = await browser.storage.local.get(["userProfile", "filters"]);
    if (data.userProfile) userProfile = data.userProfile;
    if (data.filters) activeFilters = data.filters;
  } catch (e) {
    console.warn("[NexGuard] Tercihler yüklenirken hata:", e);
  }

  const topicDescriptions = {
    bodyImage: "Vücut Algısı ve Diyet (zayıflama, beden algısı dayatmaları, diyetler)",
    politics: "Siyasi Tartışma ve Nefret Söylemi (kutuplaştırıcı, politik gerginlikler)",
    violence: "Şiddet ve Korku (kazalar, kavgalar, korkutucu veya ürkütücü içerikler)",
    success: "Başarı ve Servet Karşılaştırması (gösterişli hayatlar, zenginlik kıyaslaması)",
    anxietyNews: "Kaygı Tetikleyici Felaket Haberleri (savaş, salgın, ekonomik kriz)"
  };

  const selectedTopics = [];
  for (const [key, enabled] of Object.entries(activeFilters)) {
    if (enabled && topicDescriptions[key]) {
      selectedTopics.push(topicDescriptions[key]);
    }
  }

  // Eğer hiçbir filtre aktif edilmemişse direkt pass geç
  if (selectedTopics.length === 0) {
    console.log("[NexGuard] Aktif filtre bulunmadığından analiz yapılmadı.");
    for (const post of posts) {
      scoreCache.set(post.id, { score: 100, action: "pass", reason: "" });
    }
    notifyTabs({ type: "ANALYSIS_STATUS", status: "done" });
    return;
  }

  // Content script'e "analiz başladı" mesajı gönder
  notifyTabs({ type: "ANALYSIS_STATUS", status: "start", count: posts.length });

  console.log(`[NexGuard] ${posts.length} post tek istekte analiz ediliyor...`);

  // Batch prompt oluştur
  const postLines = posts.map((p, i) =>
    `[${i + 1}] @${p.author} | video:${p.isVideo ? "evet" : "hayır"} | "${p.caption.slice(0, 200)}"`
  ).join("\n");

  const prompt = `Kullanıcı Profili:
- Yaş: ${userProfile.age}
- Zamirler: ${userProfile.pronoun}
- Psikolojik Hassasiyetler: ${userProfile.triggers.join(", ") || "Belirtilmemiş"}

Kullanıcının hassas olduğu ve FILTRELENMESİNİ İSTEDİĞİ konular:
${selectedTopics.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}

Aşağıdaki ${posts.length} Instagram gönderisini analiz et.
Her gönderi için kullanıcının profili (yaşı, tetikleyicileri) ve yukarıdaki hassas konular bazında bir tetikleyicilik uyum skoru hesapla (100 = tamamen güvenli/zararsız, 0 = son derece tetikleyici/filtreye giren).

${postLines}

SADECE bir JSON array döndür, GİRİŞ veya AÇIKLAMA YAZMA. Çıktın tamamen aşağıdaki örnek formatta olmalıdır:
[
  {"n": 1, "score": 100, "action": "pass", "reason": "zararsız spor"},
  {"n": 2, "score": 20, "action": "blur", "reason": "vücut imgesi"}
]`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        console.warn("[NexGuard] Rate limit! 60 saniye bekleniyor...");
        await new Promise(r => setTimeout(r, 60000));
        return processBatch(posts); // Tekrar dene
      }
      console.error("[NexGuard] Gemini HTTP hatası:", res.status, errText.slice(0, 200));
      notifyTabs({ type: "ANALYSIS_STATUS", status: "done" });
      return;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[NexGuard] Gemini raw cevap:", raw.slice(0, 300));

    // Markdown kod bloklarını temizle
    let cleanRaw = raw.replace(/```json/gi, "").replace(/```/gi, "").trim();

    // JSON array'i bul (ilk [ ve son ] arasını al)
    const startIdx = cleanRaw.indexOf('[');
    const endIdx = cleanRaw.lastIndexOf(']');

    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      console.warn("[NexGuard] JSON array bulunamadı");
      notifyTabs({ type: "ANALYSIS_STATUS", status: "done" });
      return;
    }

    const jsonStr = cleanRaw.substring(startIdx, endIdx + 1);
    let results = [];
    try {
      results = JSON.parse(jsonStr);
    } catch (e) {
      console.warn("[NexGuard] JSON Parse Hatası:", e.message, "\\nRaw str:", jsonStr.slice(0, 100));
      notifyTabs({ type: "ANALYSIS_STATUS", status: "done" });
      return;
    }

    // İstatistik Güncelleyici
    const updateStats = (action) => {
      const today = new Date().toISOString().split("T")[0];
      browser.storage.local.get(["nexguard_stats"]).then(res => {
        let stats = res.nexguard_stats || { date: today, blurred: 0, warned: 0 };
        if (stats.date !== today) {
          stats = { date: today, blurred: 0, warned: 0 };
        }
        if (action === "blur") stats.blurred++;
        else if (action === "warn") stats.warned++;
        browser.storage.local.set({ nexguard_stats: stats });
      }).catch(err => console.error("[NexGuard] Stat hatası:", err));
    };

    // Sonuçları postlarla eşleştir
    for (const r of results) {
      const idx = (r.n || r.index || 0) - 1;
      if (idx < 0 || idx >= posts.length) continue;

      const post = posts[idx];

      // Skoru eşik değerlerine göre action belirle
      if (r.score < CONFIG.SCORE_THRESHOLD.BLUR) r.action = "blur";
      else if (r.score < CONFIG.SCORE_THRESHOLD.WARN) r.action = "warn";
      else r.action = "pass";

      const result = { score: r.score, action: r.action, reason: r.reason || "" };
      scoreCache.set(post.id, result);

      const emoji = r.action === "blur" ? "🔴" : r.action === "warn" ? "🟡" : "🟢";
      console.log(`[NexGuard] ${emoji} @${post.author} | skor:${r.score} | aksiyon:${r.action} | sebep:"${r.reason}"`);

      // Blur/warn ise content script'e bildir ve stat güncelle
      if (r.action !== "pass") {
        updateStats(r.action);
        notifyTabs({
          type: "POST_DECISION",
          postId: post.id,
          action: r.action,
          reason: r.reason,
          score: r.score
        });
      }
    }

    console.log(`[NexGuard] Batch analiz tamamlandı: ${results.length}/${posts.length} sonuç`);

  } catch (err) {
    console.error("[NexGuard] Gemini hatası:", err);
  }

  // Content script'e "analiz bitti" mesajı
  notifyTabs({ type: "ANALYSIS_STATUS", status: "done" });
}

// Aktif Instagram sekmelerine mesaj gönder
async function notifyTabs(msg) {
  try {
    const tabs = await browser.tabs.query({ url: "*://*.instagram.com/*" });
    console.log(`[NexGuard] Mesaj gönderilecek ${tabs.length} sekme bulundu.`, msg.type);
    for (const tab of tabs) {
      browser.tabs.sendMessage(tab.id, msg).catch((e) => console.warn("[NexGuard] Sekme mesaj hatası:", e));
    }
    // Eğer bulamazsa (Reels vs), aktif sekmeye atmayı dene
    if (tabs.length === 0) {
      const activeTabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        browser.tabs.sendMessage(activeTabs[0].id, msg).catch(() => { });
      }
    }
  } catch (e) {
    console.error("[NexGuard] notifyTabs hatası:", e);
  }
}

// Listener'ı kaydet
browser.webRequest.onBeforeRequest.addListener(
  interceptResponse,
  { urls: IG_URLS },
  ["blocking"]
);

console.log("[NexGuard] webRequest listener kayıtlı, Instagram istekleri dinleniyor...");

// --- İstemciden (Content Script) gelen özel analiz talepleri ---
const pendingBackgroundRequests = new Set();
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ANALYZE_DOM_POST") {
    if (msg.post && msg.post.id && !scoreCache.has(msg.post.id) && !pendingBackgroundRequests.has(msg.post.id) && !knownNetworkPosts.has(msg.post.id)) {
      pendingBackgroundRequests.add(msg.post.id);
      console.log(`[NexGuard] İlk açılış DOM postu yakalandı: ${msg.post.id}`);
      analyzeBatch([msg.post]);
    }
  }
});
