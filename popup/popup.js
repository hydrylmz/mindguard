document.addEventListener("DOMContentLoaded", () => {
  const storage = typeof chrome !== "undefined" ? chrome.storage.local : browser.storage.local;

  const onboardingView = document.getElementById("onboarding-view");
  const dashboardView = document.getElementById("dashboard-view");

  const btnStartOnboarding = document.getElementById("btn-start-onboarding");
  const btnReOnboard = document.getElementById("btn-re-onboard");

  const profilePronoun = document.getElementById("profile-pronoun");
  const profileAge = document.getElementById("profile-age");
  const profileTriggers = document.getElementById("profile-triggers");

  // Filtre Switch'leri
  const filterKeys = ["bodyImage", "politics", "violence", "success", "anxietyNews"];
  const switches = {};
  filterKeys.forEach(key => {
    switches[key] = document.getElementById(`filter-${key}`);
  });

  // Kurulum Durumunu Kontrol Et
  storage.get(["isOnboarded", "userProfile", "filters"], (data) => {
    if (!data.isOnboarded) {
      // Kurulmamış: Onboarding'e yönlendir
      onboardingView.style.display = "block";
      dashboardView.style.display = "none";
    } else {
      // Kurulmuş: Dashboard'u göster
      onboardingView.style.display = "none";
      dashboardView.style.display = "block";
      
      // Profili Doldur
      const profile = data.userProfile || {};
      profilePronoun.textContent = `Zamirler: ${profile.pronoun || "Belirtilmemiş"}`;
      profileAge.textContent = `Yaş: ${profile.age || "-"}`;
      
      const triggers = profile.triggers || [];
      profileTriggers.textContent = `Hassasiyetler: ${triggers.join(", ") || "Yok"}`;

      // Switch durumlarını yükle
      const filters = data.filters || {};
      filterKeys.forEach(key => {
        if (switches[key]) {
          switches[key].checked = !!filters[key];
        }
      });
    }
  });

  // Kuruluma Başla Butonu
  btnStartOnboarding.addEventListener("click", () => {
    const url = typeof chrome !== "undefined" 
      ? chrome.runtime.getURL("popup/onboarding.html") 
      : browser.runtime.getURL("popup/onboarding.html");
      
    if (typeof chrome !== "undefined") {
      chrome.tabs.create({ url });
    } else {
      browser.tabs.create({ url });
    }
  });

  // Yeniden Yapılandır Butonu
  btnReOnboard.addEventListener("click", () => {
    storage.set({ isOnboarded: false }, () => {
      const url = typeof chrome !== "undefined" 
        ? chrome.runtime.getURL("popup/onboarding.html") 
        : browser.runtime.getURL("popup/onboarding.html");
        
      if (typeof chrome !== "undefined") {
        chrome.tabs.create({ url });
      } else {
        browser.tabs.create({ url });
      }
      window.close(); // Popup'ı kapat
    });
  });

  // Switch Değişikliklerini Dinle ve Kaydet
  filterKeys.forEach(key => {
    if (switches[key]) {
      switches[key].addEventListener("change", () => {
        storage.get("filters", (data) => {
          const currentFilters = data.filters || {};
          currentFilters[key] = switches[key].checked;
          
          storage.set({ filters: currentFilters }, () => {
            console.log(`[MindGuard] Filtre güncellendi: ${key} = ${switches[key].checked}`);
          });
        });
      });
    }
  });
});
