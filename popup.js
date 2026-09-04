document.addEventListener("DOMContentLoaded", () => {
  const langSelect = document.getElementById("langSelect");
  const voiceSelect = document.getElementById("voiceSelect");
  const pitchSlider = document.getElementById("pitchSlider");
  const rateSlider = document.getElementById("rateSlider");
  const pitchValue = document.getElementById("pitchValue");
  const rateValue = document.getElementById("rateValue");
  const autoSpeedCheck = document.getElementById("autoSpeedCheck");
  const rateLabel = document.getElementById("rateLabel");
  const testBtn = document.getElementById("testBtn");

  let allVoices = [];

  // 1. Sesleri Yükle ve Dilleri Grupla
  function populateLanguages() {
    allVoices = speechSynthesis.getVoices();
    if (allVoices.length === 0) return;

    // Benzersiz dilleri bul (örneğin: "tr-TR")
    const langs = [...new Set(allVoices.map((v) => v.lang))].sort();
    langSelect.innerHTML = "";

    // Dilleri listeye ekle (Türkçeyi daha anlaşılır yaz)
    langs.forEach((lang) => {
      const option = document.createElement("option");
      option.value = lang;
      option.textContent = lang.includes("tr") ? `Türkçe (${lang})` : lang;
      langSelect.appendChild(option);
    });

    // Hafızadaki ayarları yükle, yoksa Türkçe varsayılan olsun
    chrome.storage.local.get(
      ["ttsLang", "ttsVoice", "ttsPitch", "ttsRate", "ttsAutoSpeed"],
      (res) => {
        if (res.ttsLang && langs.includes(res.ttsLang)) {
          langSelect.value = res.ttsLang;
        } else {
          const trLang = langs.find((l) => l.includes("tr"));
          if (trLang) langSelect.value = trLang;
        }

        populateVoices(res.ttsVoice); // Sesi seç

        if (res.ttsPitch) {
          pitchSlider.value = res.ttsPitch;
          updateLabels();
        }
        if (res.ttsRate) {
          rateSlider.value = res.ttsRate;
          updateLabels();
        }
        if (res.ttsAutoSpeed !== undefined) {
          autoSpeedCheck.checked = res.ttsAutoSpeed;
          toggleAutoMode();
        }
      },
    );
  }

  // 2. Seçili Dile Göre Sesleri Getir
  function populateVoices(savedVoiceURI = null) {
    const selectedLang = langSelect.value;
    const filteredVoices = allVoices.filter((v) => v.lang === selectedLang);

    voiceSelect.innerHTML = "";
    filteredVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voiceURI;
      let label = voice.name;
      if (voice.name.includes("Natural")) label = "✨ " + label; // Edge Natural vurgusu
      option.textContent = label;
      voiceSelect.appendChild(option);
    });

    // Kayıtlı ses varsa seç, yoksa "Emel"i bul, yoksa ilkini seç
    if (
      savedVoiceURI &&
      filteredVoices.some((v) => v.voiceURI === savedVoiceURI)
    ) {
      voiceSelect.value = savedVoiceURI;
    } else {
      const emel = filteredVoices.find((v) => v.name.includes("Emel"));
      if (emel) voiceSelect.value = emel.voiceURI;
    }
  }

  // Arayüzü Güncelle (Değerler ve Kilit Mekanizması)
  function updateLabels() {
    pitchValue.textContent = parseFloat(pitchSlider.value).toFixed(1);
    rateValue.textContent = parseFloat(rateSlider.value).toFixed(2) + "x";
  }

  function toggleAutoMode() {
    if (autoSpeedCheck.checked) {
      rateSlider.disabled = true;
      rateLabel.textContent = "Manuel Hız (Kapalı):";
      rateValue.style.opacity = "0.5";
    } else {
      rateSlider.disabled = false;
      rateLabel.textContent = "Manuel Hız:";
      rateValue.style.opacity = "1";
    }
  }

  // Sesi Test Et
  testBtn.addEventListener("click", () => {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      "Şu anki ses ve hız ayarlarımı test ediyorsunuz.",
    );
    const selectedVoice = allVoices.find(
      (v) => v.voiceURI === voiceSelect.value,
    );
    if (selectedVoice) utter.voice = selectedVoice;

    utter.pitch = parseFloat(pitchSlider.value);
    // Test ederken auto moddaysa standart hızı (1.0) veya seçili hızı kullan
    utter.rate = autoSpeedCheck.checked ? 1.0 : parseFloat(rateSlider.value);
    speechSynthesis.speak(utter);
  });

  // Ayarları Kaydet
  function saveSettings() {
    const settings = {
      ttsLang: langSelect.value,
      ttsVoice: voiceSelect.value,
      ttsPitch: parseFloat(pitchSlider.value),
      ttsRate: parseFloat(rateSlider.value),
      ttsAutoSpeed: autoSpeedCheck.checked,
    };
    chrome.storage.local.set(settings);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0])
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings,
        });
    });
  }

  // Event Listeners
  langSelect.addEventListener("change", () => {
    populateVoices();
    saveSettings();
  });
  voiceSelect.addEventListener("change", saveSettings);
  pitchSlider.addEventListener("input", updateLabels);
  pitchSlider.addEventListener("change", saveSettings);
  rateSlider.addEventListener("input", updateLabels);
  rateSlider.addEventListener("change", saveSettings);
  autoSpeedCheck.addEventListener("change", () => {
    toggleAutoMode();
    saveSettings();
  });

  // Başlat
  populateLanguages();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateLanguages;
  }
});
