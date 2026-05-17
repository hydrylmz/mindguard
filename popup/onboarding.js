document.addEventListener("DOMContentLoaded", () => {
  let currentStep = 1;
  const totalSteps = 5;

  // Form Verileri
  const userData = {
    age: null,
    pronoun: null,
    triggers: [],
    filters: {
      bodyImage: false,
      politics: false,
      violence: false,
      success: false,
      anxietyNews: false
    }
  };

  // DOM Elemanları
  const steps = Array.from({ length: totalSteps }, (_, i) => document.getElementById(`step-${i + 1}`));
  const progressDots = Array.from(document.querySelectorAll(".progress-dot"));
  const btnPrev = document.getElementById("btn-prev");
  const btnNext = document.getElementById("btn-next");

  // Step 2 Elemanları
  const inputAge = document.getElementById("user-age");
  const pronounCards = document.querySelectorAll("#pronoun-options .option-card");

  // Step 3 Elemanları
  const triggerCards = document.querySelectorAll("#trigger-options .option-card");
  const noTriggerCard = document.getElementById("no-trigger-card");

  // Step 4 Elemanları
  const filterCards = document.querySelectorAll("#filter-options .option-card");

  // ─── ADIM GEÇİŞLERİ ───
  function showStep(stepNum) {
    steps.forEach((step, idx) => {
      if (idx === stepNum - 1) {
        step.classList.add("active");
      } else {
        step.classList.remove("active");
      }
    });

    progressDots.forEach((dot, idx) => {
      if (idx < stepNum) {
        dot.classList.add("active");
      } else {
        dot.classList.remove("active");
      }
    });

    // Buton ayarları
    if (stepNum === 1) {
      btnPrev.disabled = true;
      btnNext.innerHTML = "Başlayalım";
    } else if (stepNum === totalSteps) {
      btnPrev.style.display = "none";
      btnNext.innerHTML = "Instagram'a Git 🛡️";
    } else {
      btnPrev.disabled = false;
      btnPrev.style.display = "block";
      btnNext.innerHTML = "Devam Et";
    }

    validateStep(stepNum);
  }

  function validateStep(stepNum) {
    if (stepNum === 2) {
      const ageVal = parseInt(inputAge.value, 10);
      const isAgeValid = ageVal >= 10 && ageVal <= 120;
      const isPronounSelected = !!userData.pronoun;
      btnNext.disabled = !(isAgeValid && isPronounSelected);
    } else if (stepNum === 3) {
      btnNext.disabled = userData.triggers.length === 0;
    } else if (stepNum === 4) {
      // En az bir filtre seçilmiş olmalı
      const hasActiveFilter = Object.values(userData.filters).some(val => val === true);
      btnNext.disabled = !hasActiveFilter;
    } else {
      btnNext.disabled = false;
    }
  }

  // Buton Eventleri
  btnPrev.addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep--;
      showStep(currentStep);
    }
  });

  btnNext.addEventListener("click", async () => {
    if (currentStep < totalSteps) {
      currentStep++;
      showStep(currentStep);
    } else {
      // 5. Adım: Kaydet ve Kapat
      await saveOnboardingData();
      window.open("https://www.instagram.com", "_blank");
      window.close();
    }
  });

  // ─── ADIM 2: YAŞ VE ZAMİRLER ───
  inputAge.addEventListener("input", () => {
    userData.age = parseInt(inputAge.value, 10);
    validateStep(2);
  });

  pronounCards.forEach(card => {
    card.addEventListener("click", () => {
      pronounCards.forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      userData.pronoun = card.dataset.val;
      validateStep(2);
    });
  });

  // ─── ADIM 3: TETİKLEYİCİLER ───
  triggerCards.forEach(card => {
    card.addEventListener("click", () => {
      const val = card.dataset.val;

      if (card === noTriggerCard) {
        // "Hiçbiri" seçildiyse diğerlerini sıfırla
        triggerCards.forEach(c => c.classList.remove("selected"));
        noTriggerCard.classList.add("selected");
        userData.triggers = [val];
      } else {
        // Normal bir tetikleyici seçildiyse "Hiçbiri"ni kaldır
        noTriggerCard.classList.remove("selected");
        card.classList.toggle("selected");

        if (card.classList.contains("selected")) {
          if (!userData.triggers.includes(val)) userData.triggers.push(val);
          // "Hiçbiri" varsa listeden çıkar
          userData.triggers = userData.triggers.filter(t => t !== "Hiçbiri");
        } else {
          userData.triggers = userData.triggers.filter(t => t !== val);
        }
      }
      validateStep(3);
    });
  });

  // ─── ADIM 4: FİLTRE TERCİHLERİ ───
  filterCards.forEach(card => {
    card.addEventListener("click", () => {
      const val = card.dataset.val;
      card.classList.toggle("selected");
      userData.filters[val] = card.classList.contains("selected");
      validateStep(4);
    });
  });

  // ─── VERİ KAYDETME (chrome.storage) ───
  async function saveOnboardingData() {
    return new Promise((resolve) => {
      const storage = typeof chrome !== "undefined" ? chrome.storage.local : browser.storage.local;
      storage.set({
        isOnboarded: true,
        userProfile: {
          age: userData.age,
          pronoun: userData.pronoun,
          triggers: userData.triggers
        },
        filters: userData.filters
      }, () => {
        console.log("[NexGuard] Onboarding verileri başarıyla kaydedildi.");
        resolve();
      });
    });
  }

  // İlk yükleme
  showStep(1);
});
