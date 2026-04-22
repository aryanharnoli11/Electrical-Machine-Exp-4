jsPlumb.ready(function () {

  // ✅ GLOBAL showPopup so it works before jsPlumb.ready fires
  window.showPopup = function (message, title = "Alert") {
    const modal = document.getElementById("warningModal");
    if (!modal) return;
    const box = modal.querySelector(".modal-box");
    const msg = document.getElementById("modalMessage");
    const ttl = document.getElementById("modalTitle");
    const sound = document.getElementById("alertSound");

    if (ttl) ttl.textContent = title;
    if (msg) msg.innerHTML = message;
    if (box) box.classList.add("danger");
    modal.classList.add("show");

    if (sound && window.isGuideActive && window.isGuideActive()) {
      sound.currentTime = 0;
      sound.play().catch(() => { });
    }
  };


  // =====================
  // 🔊 AUDIO ENGINE (GLOBAL)
  // =====================
  // labSpeech (TTS) removed — replaced with pre-recorded audio files.
  // All audio files must be placed in the  audio/  folder next to your HTML.
  //
  // AUDIO FILE LIST (put these files in your audio/ folder):
  //   audio/intro.wav                  — "Let's connect the components"
  //   audio/Connect point ... .wav      — Each of the 11 connection steps
  //   audio/wrong_connection.wav       — Wrong wire drawn
  //   audio/connections_complete.wav   — All 11 connections done
  //   audio/connections_verified.wav   — Check clicked, already verified
  //   audio/connections_correct.wav    — Check passed successfully
  //   audio/no_connections.wav         — Check clicked with 0 wires
  //   audio/dc_turned_on.wav           — MCB turned ON
  //   audio/dc_on_start_starter.wav    — Guide tap when DC already ON
  //   audio/starter_engaged.wav        — Starter handle moved to right
  //   audio/starter_on.wav             — Guide tap when starter already ON
  //   audio/field_locked.wav           — Field knob released / locked
  //   audio/field_set_readings.wav     — Guide tap when field already set
  //   audio/field_resistance_set.wav   — onFieldResistanceSet() fires
  //   audio/voltage_132.wav            — Armature knob step 1 (132V)
  //   audio/voltage_139.wav            — Armature knob step 2 (139V)
  //   audio/voltage_152.wav            — Armature knob step 3 (152V)
  //   audio/voltage_166.wav            — Armature knob step 4 (166V)
  //   audio/voltage_176.wav            — Armature knob step 5 (176V)
  //   audio/voltage_198.wav            — Armature knob step 6 (198V)
  //   audio/voltage_220.wav            — Armature knob step 7 (220V)
  //   audio/reading_added.wav          — Reading added to table (<5)
  //   audio/five_readings.wav          — 5th reading added
  //   audio/seven_readings.wav         — 7th reading added (max)
  //   audio/graph_plotted.wav          — Graph drawn successfully
  //   audio/report_generated.wav       — Report button clicked
  //   audio/experiment_reset.wav       — Reset button clicked

  // ── active audio tracker (so we can stop the current clip on reset) ──
  let guideActive = false;
  let _activeAudio = null;
  const CONNECTION_STEP_AUDIO_FILES = [
    "audiosimulation/Connect point P1 to point G exp 4.wav",
    "audiosimulation/Connect point P2 to point H (2).wav",
    "audiosimulation/Connect point P1 to point L (2).wav",
    "audiosimulation/Connect point F to point D.wav",
    "audiosimulation/Connect point E to point F1.wav",
    "audiosimulation/Connect point A2 to point F2.wav",
    "audiosimulation/Connect point A to point B.wav",
    "audiosimulation/Connect point C to point K.wav",
    "audiosimulation/Connect point M to point A1.wav",
    "audiosimulation/Connect point I to point A1.wav",
    "audiosimulation/Connect point J to point A2.wav"
  ];

  function playConnectionStepAudio(stepNo) {
    const index = Number(stepNo) - 1;
    const src = CONNECTION_STEP_AUDIO_FILES[index];
    if (!src) return;
    playAudio(src);
  }

  function playAudio(src) {
    // Never play guide audio unless voice guidance is enabled.
    if (!guideActive) return;

    // Stop any currently playing guide audio before starting the next one
    if (_activeAudio) {
      _activeAudio.pause();
      _activeAudio.currentTime = 0;
      _activeAudio = null;
    }
    const audio = new Audio(src);
    _activeAudio = audio;
    audio.play().catch(() => { });
    audio.addEventListener("ended", () => {
      if (_activeAudio === audio) _activeAudio = null;
    });
  }

  function stopAudio() {
    if (_activeAudio) {
      _activeAudio.pause();
      _activeAudio.currentTime = 0;
      _activeAudio = null;
    }
  }

  // guidedSpeak — only plays when the guide is active.
  // Pass the audio file path (not text).
  function guidedSpeak(audioFile) {
    if (window.isGuideActive && window.isGuideActive()) {
      playAudio(audioFile);
    }
  }


  let mcbState = "OFF";
  let mcbReady = false;
  const mcbImg = document.querySelector(".mcb-toggle");

  let currentVoltage = 0;
  let currentRPM = 0;
  let currentArmatureResistance = 0;
  let armatureReadingReady = false;

  let currentStepIndex = 0;
  let isPreparingPrint = false;
  let isPrintGraphPrepared = false;

  let checkClickedAfterCompletion = false;

  let introSpoken = false;
  let fieldRheostatAudioPlayed = false;

  // =====================
  // 🎯 HIGHLIGHT SYSTEM
  // =====================
  const SPEAK_HIGHLIGHT_CLASS = "speak-glow";
  const SPEAK_LINE_COLOR = "#f59e0b";
  const SPEAK_LINE_WIDTH = 7;
  const activeSpeakLabels = new Set();
  const activeSpeakConnections = new Map();

  function getPointLabelEl(id) {
    const suffix = String(id || "").replace(/^point/i, "");
    if (!suffix) return null;
    return document.querySelector(`.point-${suffix}`);
  }

  function addSpeakGlow(el, bucket) {
    if (!el) return;
    el.classList.add(SPEAK_HIGHLIGHT_CLASS);
    bucket.add(el);
  }

  function clearSpeakGlow(bucket) {
    bucket.forEach(el => el.classList.remove(SPEAK_HIGHLIGHT_CLASS));
    bucket.clear();
  }

  function clearSpeakConnectionHighlights() {
    activeSpeakConnections.forEach((style, conn) => {
      if (conn && typeof conn.setPaintStyle === "function" && style) {
        conn.setPaintStyle(style);
      }
    });
    activeSpeakConnections.clear();
  }

  function clearSpeakHighlights() {
    clearSpeakGlow(activeSpeakLabels);
    clearSpeakConnectionHighlights();
  }

  function highlightStep(fromId, toId) {
    clearSpeakHighlights();

    addSpeakGlow(getPointLabelEl(fromId), activeSpeakLabels);
    addSpeakGlow(getPointLabelEl(toId), activeSpeakLabels);

    if (typeof jsPlumb !== "undefined" && typeof jsPlumb.getAllConnections === "function") {
      const key = connectionKey(fromId, toId);
      jsPlumb.getAllConnections().forEach(conn => {
        if (connectionKey(conn.sourceId, conn.targetId) !== key) return;

        const baseStyle =
          typeof conn.getPaintStyle === "function"
            ? conn.getPaintStyle()
            : conn.paintStyle;
        const storedStyle = baseStyle
          ? { ...baseStyle }
          : { stroke: "#1b6fb8", strokeWidth: 4 };

        activeSpeakConnections.set(conn, storedStyle);

        const baseWidth = Number(storedStyle.strokeWidth) || 4;
        if (typeof conn.setPaintStyle === "function") {
          conn.setPaintStyle({
            ...storedStyle,
            stroke: SPEAK_LINE_COLOR,
            strokeWidth: Math.max(SPEAK_LINE_WIDTH, baseWidth + 2)
          });
        }
      });
    }
  }


  // =====================================================================
  // 🔊 speakCurrentStep — plays audio for whatever step the guide is on
  // Logic is unchanged — only labSpeech.speak() → playAudio() swapped
  // =====================================================================
  function speakCurrentStep() {
    if (!guideActive) return;

    // ── CONDITION 1: All connections verified, MCB still OFF ──
    if (checkClickedAfterCompletion && mcbState === "OFF") {
      const connections = jsPlumb.getAllConnections();
      const allStillConnected = requiredPairs.every(pair => {
        const [a, b] = pair.split("-");
        return isPairConnected(a, b, connections);
      });

      if (allStillConnected) {
        clearSpeakHighlights();
        // 🔊 AUDIO: plays when connections already verified, waiting for dc supply
        playAudio("audiosimulation/connections_verified.wav");
        return;
      } else {
        checkClickedAfterCompletion = false;
        currentStepIndex = getFirstMissingStepIndex();
      }
    }

    // ── CONDITION 2: DC supply ON but starter not yet moved ──
    if (mcbState === "ON" && !starterEngaged) {
      clearSpeakHighlights();
      // 🔊 AUDIO: plays when guide tapped and DC is already ON
      playAudio("audiosimulation/dc_on_start_starter.wav");
      return;
    }

    // ── CONDITION 3: Starter ON but field resistance not set ──
    if (starterEngaged && !fieldLocked) {
      clearSpeakHighlights();
      // 🔊 AUDIO: plays when guide tapped and starter already engaged
      playAudio("audiosimulation/After starter ON.wav");
      return;
    }

    // ── CONDITION 4: Starter ON and field resistance already set ──
    if (starterEngaged && fieldLocked) {
      clearSpeakHighlights();
      // 🔊 AUDIO: plays when guide tapped and field is already locked
      playAudio("audiosimulation/FieldRheostatSet.wav");
      return;
    }

    // ── CONDITION 5: All 11 connections done, Check not clicked yet ──
    if (
      currentStepIndex >= requiredPairs.length &&
      !checkClickedAfterCompletion
    ) {
      const connections = jsPlumb.getAllConnections();
      const allStillConnected = requiredPairs.every(pair => {
        const [a, b] = pair.split("-");
        return isPairConnected(a, b, connections);
      });

      if (allStillConnected) {
        clearSpeakHighlights();
        // 🔊 AUDIO: plays when all connections made, prompt to click Check
        playAudio("audiosimulation/connections_complete.wav");
        return;
      } else {
        currentStepIndex = getFirstMissingStepIndex();
      }
    }

    // ── CONDITION 6: Step-by-step connection guide ──
    const [a, b] = requiredPairs[currentStepIndex].split("-");
    const stepNo = currentStepIndex + 1;

    highlightStep(a, b);

    // 🔊 AUDIO: plays the instruction for each specific step
    playConnectionStepAudio(stepNo);
  }


  const speakBtn = document.querySelector(".speak-btn");

  if (speakBtn) {
    speakBtn.addEventListener("click", () => {

      if (!guideActive) {
        // ── Guide turned ON ──
        guideActive = true;
        speakBtn.setAttribute("aria-pressed", "true");
        speakBtn.querySelector(".speak-btn__label").textContent = "Guiding...";

        currentStepIndex = getFirstMissingStepIndex();

        if (currentStepIndex >= requiredPairs.length) {
          speakCurrentStep();
          return;
        }

        if (!introSpoken && !completedByAutoConnect) {
          // 🔊 AUDIO LOCATION 1 — "TAP TO LISTEN" button first click
          // Plays: "Let's connect the components"
          const audio = new Audio("audiosimulation/Connections.wav");
          _activeAudio = audio;

          audio.play().catch(() => { });

          audio.addEventListener("ended", () => {
            if (guideActive) speakCurrentStep();
          });

          introSpoken = true;
        } else {
          speakCurrentStep();
        }

        return;
      }

      // ── Guide turned OFF ──
      guideActive = false;
      wrongConnectionCount = 0;
      stopAudio(); // stop any playing audio
      clearSpeakHighlights();
      speakBtn.setAttribute("aria-pressed", "false");
      speakBtn.querySelector(".speak-btn__label").textContent = "AI Guide";

    });

  }

  window.isGuideActive = () => guideActive;

  let voiceStage = "idle";

  // =====================================================================
  // 🔊 Stage callback functions — each plays a pre-recorded audio file
  // These fire automatically as the experiment progresses
  // =====================================================================

  function onFieldResistanceSet(current, rpm) {
    // 🔊 AUDIO LOCATION 2 — fires when field knob is released (voiceStage=idle)
    // Plays: "Field resistance is set. The current is X ampere and speed is Y RPM. Now click Add to Table."
    guidedSpeak("audiosimulation/field_resistance_set.wav");
    voiceStage = "field_set";
  }

  function onReadingAdded(total) {
    if (total === 1) {
      showPopup(
        "Reading added to the observation table.",
        "Observation"
      );
    }

    if (total === 1) {
      guidedSpeak("audiosimulation/1streadingadd.wav");
      voiceStage = "reading_added";
    } else if (total === 2) {
      guidedSpeak("audiosimulation/2ndreadingadd.wav");
      voiceStage = "reading_added";
    } else if (total === 3) {
      guidedSpeak("audiosimulation/3rdreadingadd.wav");
      voiceStage = "reading_added";
    } else if (total === 4 || total === 6) {
      guidedSpeak("audiosimulation/1streadingadd.wav");
      voiceStage = "reading_added";
    }

    if (total === 5) {
      showPopup(
        "You have added five readings. Now you can plot the graph by clicking on the graph button or add more readings to the table.",
        "Graph Ready"
      );
      guidedSpeak("audiosimulation/5readingsGraph.wav");
      voiceStage = "five_completed";
    }

    if (total === MAX_OBSERVATION_READINGS) {
      guidedSpeak("audiosimulation/7readingsdone.wav");
      voiceStage = "max_completed";
    }
  }

  function onGraphPlotted() {
    // 🔊 AUDIO LOCATION 6 — after graph is plotted successfully
    // Plays: "Graph plotted. Now click the Report button."
    guidedSpeak("audiosimulation/graph_plotted.wav");
    voiceStage = "graph_done";
  }

  function onReportGenerated() {
    // 🔊 AUDIO LOCATION 7 — after report is generated
    // Plays: "Report generated. You can print it. Now click Reset to repeat."
    guidedSpeak("audiosimulation/report_generated.wav");
    voiceStage = "report_done";
  }

  function onExperimentReset() {
    // 🔊 AUDIO LOCATION 8 — after Reset button clicked
    // Plays: "Experiment reset. Start again by making connections."
    guidedSpeak("audiosimulation/Reset.wav");
    voiceStage = "idle";
  }

  const graphReadings = [];
  const MIN_GRAPH_POINTS = 5;

  function showPopup(message, title = "Alert") {
    const modal = document.getElementById("warningModal");
    const box = modal.querySelector(".modal-box");
    const msg = document.getElementById("modalMessage");
    const ttl = document.getElementById("modalTitle");
    const sound = document.getElementById("alertSound");

    ttl.textContent = title;
    msg.innerHTML = message;

    box.classList.add("danger");
    modal.classList.add("show");

    if (sound) {
      sound.currentTime = 0;
      sound.play();
    }
  }

  function closeModal() {
    const modal = document.getElementById("warningModal");
    const box = modal.querySelector(".modal-box");
    const sound = document.getElementById("alertSound");

    box.classList.add("closing");

    setTimeout(() => {
      modal.classList.remove("show");
      box.classList.remove("closing");
    }, 500);

    if (sound) sound.pause();

    // ✅ Stop any guide audio that was playing when popup appeared
    stopAudio();

    // ✅ Also stop the components intro audio if it's still playing
    if (window._activeComponentIntroAudio) {
      window._activeComponentIntroAudio.pause();
      window._activeComponentIntroAudio.currentTime = 0;
      window._activeComponentIntroAudio = null;
    }
  }

  function isModalOpen() {
    const modal = document.getElementById("warningModal");
    return modal && modal.classList.contains("show");
  }

  function waitForWarningModalAcknowledgement() {
    return new Promise((resolve) => {
      const modal = document.getElementById("warningModal");
      if (!modal) {
        resolve();
        return;
      }

      const closeBtn = modal.querySelector("[data-modal-close]");
      let resolved = false;

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        closeBtn?.removeEventListener("click", onClose);
        modal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEsc);
        resolve();
      };

      const onClose = () => cleanup();
      const onBackdrop = (event) => {
        if (event.target === modal) cleanup();
      };
      const onEsc = (event) => {
        if (event.key === "Escape") cleanup();
      };

      closeBtn?.addEventListener("click", onClose, { once: true });
      modal.addEventListener("click", onBackdrop, { once: true });
      document.addEventListener("keydown", onEsc, { once: true });
    });
  }

  window.closeModal = closeModal;

  document.addEventListener("click", function (e) {
    if (e.target.matches("[data-modal-close]")) {
      e.stopPropagation();
      closeModal();
    }
  });

  const observationContainer = document.getElementById("observation-container");
  let observationBody;

  function createObservationTable() {
    observationContainer.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>S NO.</th>
          <th>Armature Resistance (&Omega;)</th>
          <th>Armature Voltage (V)</th>
          <th>Speed (RPM)</th>
        </tr>
      </thead>
      <tbody id="observationBody">
</tbody>
    </table>
  `;
    observationBody = document.getElementById("observationBody");
  }

  function formatArmatureResistance(value) {
    if (!Number.isFinite(value)) return "-";
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function addObservationRow() {
    if (!fieldLocked) {
      showPopup("First, set the field rheostat. ", "Step Required");
      if (window.isGuideActive()) {
      playAudio("audiosimulation/BeforeaddingreadingAddToTable.wav");
    }
    return;
    }

    if (!armatureReadingReady) {
      showPopup("Slide the armature rheostat knob to take a reading first.", "Step Required");
      return;
    }

    if (graphReadings.length >= MAX_OBSERVATION_READINGS) {
      showPopup(`You can add a maximum of ${MAX_OBSERVATION_READINGS} readings to the table. Now, click the Graph button.`, "Maximum Readings Reached");
      guidedSpeak("audiosimulation/Formaxreadings.wav");
      return;
    }

    const duplicateExists = graphReadings.some(reading =>
      reading.voltage === currentVoltage &&
      reading.rpm === currentRPM &&
      reading.resistance === currentArmatureResistance
    );
    if (duplicateExists) {
      showPopup("This reading is already added to the table.", "Duplicate Entry");
      guidedSpeak("audiosimulation/duplicatereading.wav");
      return;
    }

    const placeholder = observationBody.querySelector(".placeholder-row");
    if (placeholder) placeholder.remove();

    const serial = observationBody.querySelectorAll("tr").length + 1;
    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>${serial}</td>
    <td>${formatArmatureResistance(currentArmatureResistance)}</td>
    <td>${currentVoltage}</td>
    <td>${currentRPM}</td>
  `;
    observationBody.appendChild(tr);

    graphReadings.push({
      resistance: currentArmatureResistance,
      voltage: currentVoltage,
      rpm: currentRPM
    });
    onReadingAdded(graphReadings.length);
    updateGraphButtonState();
  }

  function updateGraphButtonState() {
    const plotGraphBtn = document.getElementById("plotGraphBtn");
    if (!plotGraphBtn) return;
    const shouldDisable = graphReadings.length < MIN_GRAPH_POINTS;
    plotGraphBtn.disabled = shouldDisable;
    plotGraphBtn.style.opacity = shouldDisable ? "0.5" : "1";
    plotGraphBtn.style.cursor = shouldDisable ? "not-allowed" : "pointer";
    plotGraphBtn.style.pointerEvents = shouldDisable ? "none" : "auto";
  }

  const GRAPH_X_AXIS_LABEL = "<b>Armature Voltage (V)</b>";
  const GRAPH_Y_AXIS_LABEL = "<b>Speed (RPM)</b>";
  const GRAPH_TITLE_LABEL = "<b>Speed (RPM) vs Armature Voltage (V)</b>";

  function drawGraph(options = {}) {
    const minPoints = Number.isFinite(options.minPoints) ? options.minPoints : MIN_GRAPH_POINTS;
    const silent = Boolean(options.silent);

    if (graphReadings.length < minPoints) {
      if (!silent) {
        showPopup("⚠️ Please add at least 5 readings to plot the graph.", "Insufficient Data");
      }
      return Promise.resolve(false);
    }
    if (!silent && isGuideActive()) playAudio("audiosimulation/Graph.wav");

    const sorted = [...graphReadings].sort((a, b) => a.voltage - b.voltage);
    const xValues = sorted.map(r => r.voltage);
    const yValues = sorted.map(r => r.rpm);

    const graphBars = document.getElementById("graphBars");
    if (graphBars) graphBars.style.display = "none";

    const graphCanvas = document.querySelector(".graph-canvas");
    if (graphCanvas) {
      graphCanvas.classList.add("is-plotting");
      graphCanvas.classList.remove("use-print-image");
      const graphPrintImage = graphCanvas.querySelector(".graph-print-image-main");
      if (graphPrintImage) graphPrintImage.removeAttribute("src");
    }

    const graphPlot = document.getElementById("graphPlot");
    if (!graphPlot) return Promise.resolve(false);
    graphPlot.style.display = "block";

    function loadPlotly() {
      if (window.Plotly) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.plot.ly/plotly-3.0.1.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    return loadPlotly().then(() => {
      const trace = {
        x: xValues,
        y: yValues,
        mode: "lines+markers",
        type: "scatter",
        marker: { color: "#1b6fb8", size: 8 },
        line: { color: "#1b6fb8", width: 3 }
      };

      const layout = {
        title: { text: GRAPH_TITLE_LABEL, font: { size: 16 } },
        margin: { l: 120, r: 30, t: 60, b: 100 },
        xaxis: {
          title: { text: GRAPH_X_AXIS_LABEL, standoff: 40, font: { color: "#2c1a0a", size: 14, family: "Arial Black" } },
          type: "category",
          categoryarray: xValues.map(String),
          showgrid: true,
          gridcolor: "rgba(0, 0, 0, 0.07)",
          zeroline: false
        },
        yaxis: {
          title: { text: GRAPH_Y_AXIS_LABEL, standoff: 50, font: { color: "#2c1a0a", size: 14, family: "Arial Black" } },
          type: "category",
          categoryarray: yValues.map(String),
          showgrid: true,
          gridcolor: "rgba(0, 0, 0, 0.07)",
          zeroline: false
        },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)"
      };

      return Plotly.newPlot(graphPlot, [trace], layout, { responsive: true, displaylogo: false }).then(() => {
        Plotly.Plots.resize(graphPlot);

        if (reportBtn) {
          reportBtn.disabled = false;
          reportBtn.style.opacity = "1";
          reportBtn.style.cursor = "pointer";
          reportBtn.style.pointerEvents = "auto";
        }

        if (!silent) {
          showPopup("The graph of speed vs armature voltage has been plotted successfully. Your experiment is now complete. You may view the report by clicking on the report button, then use print to print the page or reset to start again", "Graph Generated");
          voiceStage = "graph_done";
        }
        return true;
      });
    }).catch(() => false);
  }

  function setPrintGraphDensityClass() {
    const hasGraphDataForPrint = graphReadings.length >= 2;
    document.documentElement.classList.toggle("print-no-graph-data", !hasGraphDataForPrint);
    return hasGraphDataForPrint;
  }

  function getMainGraphPrintImageElement(graphCanvas) {
    if (!graphCanvas) return null;
    let graphPrintImage = graphCanvas.querySelector(".graph-print-image-main");
    if (!graphPrintImage) {
      graphPrintImage = document.createElement("img");
      graphPrintImage.className = "graph-print-image-main";
      graphPrintImage.alt = "Output graph";
      graphCanvas.appendChild(graphPrintImage);
    }
    return graphPrintImage;
  }

  async function prepareMainGraphForPrint() {
    const graphPlot = document.getElementById("graphPlot");
    const graphCanvas = document.querySelector(".graph-canvas");
    if (!graphPlot || !graphCanvas || !window.Plotly) return false;

    const graphPrintImage = getMainGraphPrintImageElement(graphCanvas);
    const computed = window.getComputedStyle(graphPlot);
    const isVisible = computed && computed.display !== "none" && graphPlot.childElementCount > 0;
    if (!isVisible) {
      graphCanvas.classList.remove("use-print-image");
      graphPrintImage?.removeAttribute("src");
      isPrintGraphPrepared = false;
      return false;
    }

    const canvasRect = graphCanvas.getBoundingClientRect();
    const plotRect = graphPlot.getBoundingClientRect();
    const targetPrintWidth = 1600;
    const targetPrintHeight = 300;
    const width = Math.max(
      targetPrintWidth,
      Math.floor((canvasRect && canvasRect.width ? canvasRect.width : plotRect.width) - 24)
    );
    const height = Math.max(
      targetPrintHeight,
      Math.floor((canvasRect && canvasRect.height ? canvasRect.height : plotRect.height) - 28)
    );

    await Promise.resolve(
      window.Plotly.relayout(graphPlot, {
        autosize: false,
        width,
        height,
        showlegend: false,
        title: { text: "" },
        margin: { l: 58, r: 16, t: 18, b: 56 },
        xaxis: {
          automargin: true,
          title: { text: GRAPH_X_AXIS_LABEL, standoff: 14, font: { size: 21 } },
          tickfont: { size: 18 }
        },
        yaxis: {
          automargin: true,
          title: { text: GRAPH_Y_AXIS_LABEL, standoff: 10, font: { size: 21 } },
          tickfont: { size: 18 }
        }
      })
    ).catch(() => { });

    if (window.Plotly && window.Plotly.Plots && typeof window.Plotly.Plots.resize === "function") {
      window.Plotly.Plots.resize(graphPlot);
    }
    isPrintGraphPrepared = true;

    if (graphPrintImage && typeof window.Plotly.toImage === "function") {
      try {
        const imageData = await window.Plotly.toImage(graphPlot, {
          format: "png",
          width: Math.max(1200, width * 2),
          height: Math.max(700, height * 2)
        });
        if (imageData) {
          graphPrintImage.src = imageData;
          graphCanvas.classList.add("use-print-image");
        } else {
          graphCanvas.classList.remove("use-print-image");
        }
      } catch {
        graphCanvas.classList.remove("use-print-image");
      }
    }

    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(isPrintGraphPrepared)));
    });
  }

  function restoreMainGraphAfterPrint() {
    const graphPlot = document.getElementById("graphPlot");
    const graphCanvas = document.querySelector(".graph-canvas");
    const graphPrintImage = graphCanvas && graphCanvas.querySelector(".graph-print-image-main");

    if (graphCanvas) graphCanvas.classList.remove("use-print-image");
    if (graphPrintImage) graphPrintImage.removeAttribute("src");
    isPrintGraphPrepared = false;

    if (!graphPlot || !window.Plotly) return;

    Promise.resolve(
      window.Plotly.relayout(graphPlot, {
        autosize: true,
        width: null,
        height: null,
        showlegend: false,
        title: { text: GRAPH_TITLE_LABEL, font: { size: 16 } },
        margin: { l: 120, r: 30, t: 60, b: 100 },
        xaxis: {
          automargin: true,
          title: { text: GRAPH_X_AXIS_LABEL, standoff: 40, font: { color: "#2c1a0a", size: 14, family: "Arial Black" } },
          tickfont: { size: 12 }
        },
        yaxis: {
          automargin: true,
          title: { text: GRAPH_Y_AXIS_LABEL, standoff: 50, font: { color: "#2c1a0a", size: 14, family: "Arial Black" } },
          tickfont: { size: 12 }
        }
      })
    )
      .catch(() => { })
      .then(() => {
        if (window.Plotly && window.Plotly.Plots && typeof window.Plotly.Plots.resize === "function") {
          window.Plotly.Plots.resize(graphPlot);
        }
      });
  }

  async function prepareGraphForPrint() {
    const hasGraphDataForPrint = setPrintGraphDensityClass();
    if (!hasGraphDataForPrint) {
      restoreMainGraphAfterPrint();
      return false;
    }

    isPreparingPrint = true;
    try {
      const graphPlotted = await drawGraph({ silent: true, minPoints: 2 });
      if (!graphPlotted) {
        restoreMainGraphAfterPrint();
        return false;
      }
      await prepareMainGraphForPrint();
      return true;
    } finally {
      isPreparingPrint = false;
    }
  }

  const starterHandle = document.querySelector(".starter-handle");
  const starterBody = document.querySelector(".starter-body");

  let fieldLocked = false;
  let fieldDragging = false;
  let fieldStartX = 0;
  let fieldCurrentPercent = 15;
  const FIELD_MIN = 15;
  const FIELD_MAX = 85;
  const fieldKnob = document.querySelector(".nob1");

  let starterDragging = false;
  let starterEngaged = false;
  let startMouseX = 0;
  const START_X = 0;
  const starterMotion = {
    endX: 90,
    curveHeight:20
  };

  const STARTER_SLOT_END_X_RATIO = 0.74
  const STARTER_CURVE_RATIO = 0.095;

  function recalcStarterMotion() {
    if (!starterBody || !starterHandle) return;
    const bodyRect = starterBody.getBoundingClientRect();
    if (!bodyRect || bodyRect.width <= 0 || bodyRect.height <= 0) return;

    const prevTransform = starterHandle.style.transform;
    starterHandle.style.transform = "translate(0px, 0px)";
    const baseHandleRect = starterHandle.getBoundingClientRect();
    starterHandle.style.transform = prevTransform;

    const desiredCenterX = bodyRect.left + bodyRect.width * STARTER_SLOT_END_X_RATIO;
    const baseCenterX = baseHandleRect.left + baseHandleRect.width / 2;
    const desiredMoveX = desiredCenterX - baseCenterX;

    // Hard clamp: knob must stay inside starter body.
    const maxMoveInsideBody = (bodyRect.right - 4) - baseHandleRect.right;
    const clampedMoveX = Math.min(desiredMoveX, maxMoveInsideBody);

    starterMotion.endX = Math.max(1, Math.round(clampedMoveX));
    starterMotion.curveHeight = Math.max(14, Math.round(bodyRect.height * STARTER_CURVE_RATIO));

    if (starterEngaged && starterHandle) {
      starterHandle.style.transform = `translate(${starterMotion.endX}px, 0px)`;
    }
  }

  recalcStarterMotion();
  window.addEventListener("resize", recalcStarterMotion);

  const armatureKnob = document.querySelector(".nob2");
  const voltNeedle = document.querySelector(".meter-needle1");
  const voltNeedle2 = document.querySelector(".meter-needle2");
  const ampNeedle = document.querySelector(".meter-needle3 img");
  const rotor = document.getElementById("gr");
  const rpmDisplay = document.getElementById("rpmDisplay");

  if (voltNeedle) voltNeedle.style.transition = "transform 0.8s ease-in-out";
  if (voltNeedle2) voltNeedle2.style.transition = "transform 0.8s ease-in-out";
  if (ampNeedle) ampNeedle.style.transition = "transform 0.6s ease-in-out";

  let rotorAngle = 0;
  let rotorRunning = false;
  let lastFrameTime = null;
  let rotorSpeed = 0;
  const STARTER_ON_SUPPLY_VOLTAGE = 220;
  const STARTER_ON_ARMATURE_VOLTAGE = 220;
  const STARTER_ON_ARMATURE_CURRENT = 1;
  const STARTER_ON_RPM = 1480;
  const FIELD_SET_INITIAL_READING = {
    resistance: 31.5,
    voltage: 204,
    rpm: 1450
  };

  const armatureTable = [
    { resistance: 34.5, voltage: 200, rpm: 1425 },
    { resistance: 39, voltage: 192, rpm: 1400 },
    { resistance: 40.5, voltage: 188, rpm: 1375 },
    { resistance: 43, voltage: 184, rpm: 1350 },
    { resistance: 45.5, voltage: 180, rpm: 1325 },
    { resistance: 48, voltage: 176, rpm: 1300 }
  ];
  const ARMATURE_RHEOSTAT_AUDIO_FILES = [
    "audiosimulation/Armature Rheostat 1st.wav",
    "audiosimulation/Armature Rheostat 2nd.wav",
    "audiosimulation/Armature Rheostat 3rd.wav",
    "audiosimulation/Armature Rheostat 4th.wav",
    "audiosimulation/Armature Rheostat 5th.wav",
    "audiosimulation/Armature Rheostat 6th.wav"
  ];
  const MAX_OBSERVATION_READINGS = armatureTable.length + 1;
  const METER_ANGLE_MIN = -70;
  const METER_ANGLE_MAX = 70;
  const VOLTMETER_SCALE_MIN = 0;
  const VOLTMETER_SCALE_MAX = 420;
  const AMMETER_SCALE_MIN = 0;
  const AMMETER_SCALE_MAX = 1;
  const ROTOR_SPEED_MIN = 3;
  const ROTOR_SPEED_MAX = 17;
  const armatureRPMMin = Math.min(...armatureTable.map((row) => row.rpm));
  const armatureRPMMax = Math.max(...armatureTable.map((row) => row.rpm));
  const rotorRPMMin = Math.min(STARTER_ON_RPM, armatureRPMMin);
  const rotorRPMMax = Math.max(STARTER_ON_RPM, armatureRPMMax);

  function mapLinearRange(value, inputMin, inputMax, outputMin, outputMax) {
    if (inputMax === inputMin) return (outputMin + outputMax) / 2;
    const clamped = Math.max(inputMin, Math.min(value, inputMax));
    const ratio = (clamped - inputMin) / (inputMax - inputMin);
    return outputMin + ratio * (outputMax - outputMin);
  }

  function getArmatureRheostatAudio(stepIndex) {
    if (!Number.isFinite(stepIndex)) return null;
    const safeIndex = Math.max(0, Math.floor(stepIndex));
    return ARMATURE_RHEOSTAT_AUDIO_FILES[
      Math.min(safeIndex, ARMATURE_RHEOSTAT_AUDIO_FILES.length - 1)
    ] || null;
  }

  function getRotorSpeedFromRPM(rpmValue) {
    return mapLinearRange(
      rpmValue,
      rotorRPMMin,
      rotorRPMMax,
      ROTOR_SPEED_MIN,
      ROTOR_SPEED_MAX
    );
  }

  function getVoltmeterAngle(voltageValue) {
    return mapLinearRange(
      voltageValue,
      VOLTMETER_SCALE_MIN,
      VOLTMETER_SCALE_MAX,
      METER_ANGLE_MIN,
      METER_ANGLE_MAX
    );
  }

  function getAmmeterAngle(currentValue) {
    return mapLinearRange(
      currentValue,
      AMMETER_SCALE_MIN,
      AMMETER_SCALE_MAX,
      METER_ANGLE_MIN,
      METER_ANGLE_MAX
    );
  }

  function setSupplyVoltmeter(voltageValue) {
    const voltAngle = getVoltmeterAngle(voltageValue);
    if (voltNeedle) {
      voltNeedle.style.transform = `translate(-75%, -82%) rotate(${voltAngle}deg)`;
    }
  }

  function setArmatureVoltmeter(voltageValue) {
    const voltAngle = getVoltmeterAngle(voltageValue);
    if (voltNeedle2) {
      voltNeedle2.style.transform = `translate(-75%, -82%) rotate(${voltAngle}deg)`;
    }
  }

  function setArmatureCurrentNeedle(currentValue) {
    const ampAngle = getAmmeterAngle(currentValue);
    if (ampNeedle) ampNeedle.style.transform = `rotate(${ampAngle}deg)`;
  }

  function applyStarterOnMeterState() {
    currentArmatureResistance = 0;
    currentVoltage = STARTER_ON_ARMATURE_VOLTAGE;
    currentRPM = STARTER_ON_RPM;
    armatureReadingReady = false;
    lastArmatureStepIndex = null;
    rotorSpeed = getRotorSpeedFromRPM(currentRPM);

    setSupplyVoltmeter(STARTER_ON_SUPPLY_VOLTAGE);
    setArmatureVoltmeter(STARTER_ON_ARMATURE_VOLTAGE);
    setArmatureCurrentNeedle(STARTER_ON_ARMATURE_CURRENT);
    if (rpmDisplay) rpmDisplay.textContent = String(STARTER_ON_RPM);
  }

  function applyFieldSetInitialReading() {
    currentArmatureResistance = FIELD_SET_INITIAL_READING.resistance;
    currentVoltage = FIELD_SET_INITIAL_READING.voltage;
    currentRPM = FIELD_SET_INITIAL_READING.rpm;
    armatureReadingReady = true;
    lastArmatureStepIndex = null;
    rotorSpeed = getRotorSpeedFromRPM(currentRPM);

    setSupplyVoltmeter(STARTER_ON_SUPPLY_VOLTAGE);
    setArmatureVoltmeter(currentVoltage);
    setArmatureCurrentNeedle(STARTER_ON_ARMATURE_CURRENT);
    if (rpmDisplay) rpmDisplay.textContent = String(currentRPM);
  }

  function updateVoltmeterByArmature(stepIndex, options = {}) {
    const playStepAudio = options.playStepAudio !== false;
    const row = armatureTable[stepIndex];
    currentArmatureResistance = row.resistance;
    currentVoltage = row.voltage;
    currentRPM = row.rpm;
    armatureReadingReady = true;
    lastArmatureStepIndex = stepIndex;
    rotorSpeed = getRotorSpeedFromRPM(currentRPM);

    setSupplyVoltmeter(STARTER_ON_SUPPLY_VOLTAGE);
    setArmatureVoltmeter(currentVoltage);

    if (rpmDisplay) rpmDisplay.textContent = String(currentRPM);

    if (playStepAudio && isGuideActive() && fieldLocked && starterEngaged) {
      if (stepIndex === 0 && !fieldRheostatAudioPlayed) {
        playAudio("audiosimulation/FieldRheostatSet.wav");
        fieldRheostatAudioPlayed = true;
      } else {
        const armatureAudio = getArmatureRheostatAudio(stepIndex);
        if (armatureAudio) playAudio(armatureAudio);
      }
    }
  }

  function runRotor() {
    if (!rotorRunning) return;
    rotorAngle += rotorSpeed;
    rotor.style.transform = `translate(-50%, -50%) rotate(${rotorAngle}deg)`;
    requestAnimationFrame(runRotor);
  }

  function setFieldDefaultMeters() {
    setArmatureCurrentNeedle(STARTER_ON_ARMATURE_CURRENT);
  }

  const KNOB_START_X = armatureKnob
    ? parseFloat(window.getComputedStyle(armatureKnob).left) || 28
    : 28;
  const DEFAULT_MAX_X = 252;
  const ARMATURE_READING_STEPS = armatureTable.length;
  let armatureX = KNOB_START_X;
  let isDragging = false;
  let armatureMovedThisDrag = false;
  let lastArmatureStepIndex = null;
  let armatureSnapIndex = 0; // 0 = initial position, 1..N = reading divisions
  const ARMATURE_DRAG_THRESHOLD_PX = 2;
  let armatureHomeX = KNOB_START_X;
  let armatureDivisionMinX = KNOB_START_X;
  let armatureDivisionMaxX = DEFAULT_MAX_X;
  let armatureDivisionStepWidth =
    (armatureDivisionMaxX - armatureDivisionMinX) /
    Math.max(ARMATURE_READING_STEPS - 1, 1);
  // Ratios measured from images/Rheostat.png for the green winding zone.
  const ARMATURE_GREEN_START_RATIO = 153 / 986;
  const ARMATURE_GREEN_END_RATIO = 798 / 986;
  const armatureRheostat = armatureKnob ? armatureKnob.closest(".rheostat") : null;
  const armatureRheostatImage = armatureRheostat
    ? armatureRheostat.querySelector(".rheostat-img-2")
    : null;
  let startX = 0;
  let knobStartX = 0;

  function getArmatureXBySnapIndex(snapIndex) {
    if (snapIndex <= 0) return armatureHomeX;
    if (ARMATURE_READING_STEPS <= 1) return armatureDivisionMinX;
    const safeSnapIndex = Math.max(
      1,
      Math.min(snapIndex, ARMATURE_READING_STEPS)
    );
    return armatureDivisionMinX + (safeSnapIndex - 1) * armatureDivisionStepWidth;
  }

  function getNearestArmatureSnapIndex(x) {
    const homeDistance = Math.abs(x - armatureHomeX);
    if (armatureDivisionStepWidth <= 0) {
      const firstDivisionDistance = Math.abs(x - armatureDivisionMinX);
      return homeDistance <= firstDivisionDistance ? 0 : 1;
    }

    const clampedDivisionX = Math.max(
      armatureDivisionMinX,
      Math.min(armatureDivisionMaxX, x)
    );
    const rawDivisionIndex =
      (clampedDivisionX - armatureDivisionMinX) / armatureDivisionStepWidth;
    const safeDivisionIndex = Math.max(
      0,
      Math.min(Math.round(rawDivisionIndex), ARMATURE_READING_STEPS - 1)
    );
    const divisionSnapIndex = safeDivisionIndex + 1;
    const divisionDistance = Math.abs(x - getArmatureXBySnapIndex(divisionSnapIndex));
    return homeDistance <= divisionDistance ? 0 : divisionSnapIndex;
  }

  function setArmatureToSnapIndex(snapIndex, shouldUpdateReading = true) {
    const safeSnapIndex = Math.max(
      0,
      Math.min(snapIndex, ARMATURE_READING_STEPS)
    );
    armatureSnapIndex = safeSnapIndex;
    armatureX = getArmatureXBySnapIndex(safeSnapIndex);
    if (armatureKnob) {
      armatureKnob.style.transform = `translateX(${armatureX - KNOB_START_X}px)`;
    }

    if (safeSnapIndex === 0) {
      if (mcbState === "ON" && starterEngaged) {
        if (fieldLocked) {
          applyFieldSetInitialReading();
        } else {
          applyStarterOnMeterState();
        }
      } else {
        armatureReadingReady = false;
        lastArmatureStepIndex = null;
        currentArmatureResistance = 0;
        currentVoltage = 0;
        currentRPM = 0;
        rotorSpeed = 0;
        setSupplyVoltmeter(0);
        setArmatureVoltmeter(0);
        setArmatureCurrentNeedle(0);
        if (rpmDisplay) rpmDisplay.textContent = "0";
      }
      return;
    }

    const stepIndex = safeSnapIndex - 1;
    if (shouldUpdateReading || lastArmatureStepIndex !== stepIndex) {
      updateVoltmeterByArmature(stepIndex);
    } else {
      armatureReadingReady = true;
    }
  }

  function recalcArmatureTrackBounds() {
    if (!armatureKnob || !armatureRheostat) return;

    const knobWidth = armatureKnob.offsetWidth || 34;
    armatureHomeX = KNOB_START_X;
    let computedMin = armatureHomeX;
    let computedMax = Math.max(armatureHomeX, DEFAULT_MAX_X);

    if (armatureRheostatImage) {
      const rheostatRect = armatureRheostat.getBoundingClientRect();
      const imageRect = armatureRheostatImage.getBoundingClientRect();
      const edgePadding = 2;
      const trackStartX =
        imageRect.left -
        rheostatRect.left +
        imageRect.width * ARMATURE_GREEN_START_RATIO;
      const trackEndX =
        imageRect.left -
        rheostatRect.left +
        imageRect.width * ARMATURE_GREEN_END_RATIO;
      const knobAnchorX = knobWidth / 2;
      computedMin = Math.max(
        armatureHomeX,
        trackStartX - knobAnchorX + edgePadding
      );
      computedMax =
        trackEndX - knobAnchorX - edgePadding;
    } else {
      computedMax = armatureRheostat.clientWidth - knobWidth;
    }

    // Keep all reading divisions after initial with uniform gap.
    // Preferred mode: initial->D1 gap equals all other division gaps.
    computedMax = Math.max(computedMin, computedMax);
    const equalGapFromHome =
      (computedMax - armatureHomeX) / Math.max(ARMATURE_READING_STEPS, 1);
    const firstDivisionX = armatureHomeX + equalGapFromHome;

    if (equalGapFromHome > 0 && firstDivisionX >= computedMin) {
      armatureDivisionStepWidth = equalGapFromHome;
      armatureDivisionMinX = firstDivisionX;
      armatureDivisionMaxX =
        armatureHomeX + armatureDivisionStepWidth * ARMATURE_READING_STEPS;
    } else {
      // Fallback for very tight layouts: keep all divisions inside green part.
      armatureDivisionMinX = computedMin;
      armatureDivisionMaxX = computedMax;
      armatureDivisionStepWidth =
        (armatureDivisionMaxX - armatureDivisionMinX) /
        Math.max(ARMATURE_READING_STEPS - 1, 1);
    }

    setArmatureToSnapIndex(armatureSnapIndex, false);
  }

  if (starterHandle) starterHandle.style.cursor = "not-allowed";

  if (armatureKnob) {
    armatureKnob.style.cursor = "not-allowed";

    armatureKnob.addEventListener("mousedown", (e) => {
      if (mcbState !== "ON" || !starterEngaged || !fieldLocked) {
        showPopup("First turn ON DC Supply");
        return;
      }
      isDragging = true;
      armatureMovedThisDrag = false;
      startX = e.clientX;
      knobStartX = armatureX;
      armatureKnob.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mouseup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      armatureKnob.style.cursor = "grab";
      if (Math.abs(e.clientX - startX) > ARMATURE_DRAG_THRESHOLD_PX) {
        armatureMovedThisDrag = true;
      }
      const snapIndex = getNearestArmatureSnapIndex(armatureX);
      setArmatureToSnapIndex(snapIndex, armatureMovedThisDrag);
      if (!armatureMovedThisDrag) return;
      if (snapIndex > 0 && !rotorRunning && mcbState === "ON" && starterEngaged) {
        rotorRunning = true;
        requestAnimationFrame(runRotor);
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || mcbState !== "ON") return;
      const deltaX = e.clientX - startX;
      if (Math.abs(deltaX) > ARMATURE_DRAG_THRESHOLD_PX) {
        armatureMovedThisDrag = true;
      }
      const rawX = knobStartX + deltaX;
      const dragMinX = Math.min(armatureHomeX, armatureDivisionMinX);
      const dragMaxX = Math.max(armatureHomeX, armatureDivisionMaxX);
      const clampedX = Math.max(dragMinX, Math.min(dragMaxX, rawX));
      const snapIndex = getNearestArmatureSnapIndex(clampedX);
      if (snapIndex !== armatureSnapIndex) {
        setArmatureToSnapIndex(snapIndex, true);
        if (snapIndex > 0 && !rotorRunning && mcbState === "ON" && starterEngaged) {
          rotorRunning = true;
          requestAnimationFrame(runRotor);
        }
      }
    });
  }

  recalcArmatureTrackBounds();
  window.addEventListener("resize", recalcArmatureTrackBounds);

  function turnMCBOff(reason = "") {
    completedByAutoConnect = false;
    armatureReadingReady = false;
    lastArmatureStepIndex = null;
    currentVoltage = 0;
    currentArmatureResistance = 0;
    currentRPM = 0;
    if (rpmDisplay) rpmDisplay.textContent = "0";
    const fieldKnob = document.querySelector(".nob1");
    if (mcbState === "OFF") return;
    mcbState = "OFF";
    mcbReady = false;
    if (mcbImg) mcbImg.src = "images/mcb-off.png";
    enableCheckAndAutoConnect();
    setArmatureToSnapIndex(0, false);
    isDragging = false;
    if (armatureKnob) {
      armatureKnob.style.cursor = "not-allowed";
    }
    setArmatureCurrentNeedle(0);
    setSupplyVoltmeter(0);
    setArmatureVoltmeter(0);
    if (rotor) {
      rotorRunning = false;
      rotorAngle = 0;
      rotorSpeed = 0;
      lastFrameTime = null;
      rotor.style.transform = "translate(-50%, -50%) rotate(0deg)";
    }
    starterEngaged = false;
    starterDragging = false;
    if (starterHandle) {
      starterHandle.style.transform = "translate(0px, 0px)";
      starterHandle.style.cursor = "not-allowed";
    }
    if (fieldKnob) {
      fieldLocked = false;
      fieldDragging = false;
      fieldCurrentPercent = FIELD_MIN;
      fieldRheostatAudioPlayed = false;
      fieldKnob.style.left = "15%";
      fieldKnob.style.transform = "translate(-50%, -50%)";
      fieldKnob.style.cursor = "not-allowed";
    }
    console.log("MCB OFF", reason);
    if (reason) {
      showPopup("⚠️ DC SUPPLY TURNED OFF!\n\nReason: " + reason, "MCB OFF");
    }
    createObservationTable();
    autoConnectUsed = false;
    if (reason === "" || reason === "Reset pressed") {
      currentStepIndex = 0;
    }
  }

  function disableCheckAndAutoConnect() {
    const checkBtn = document.getElementById("checkBtn");
    const autoBtn = document.getElementById("auto");
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.style.opacity = "0.5";
      checkBtn.style.cursor = "not-allowed";
      checkBtn.style.pointerEvents = "none";
    }
    if (autoBtn) {
      autoBtn.disabled = true;
      autoBtn.style.opacity = "0.5";
      autoBtn.style.cursor = "not-allowed";
      autoBtn.style.pointerEvents = "none";
    }
  }

  function enableCheckAndAutoConnect() {
    const checkBtn = document.getElementById("checkBtn");
    const autoBtn = document.getElementById("auto");
    if (checkBtn) {
      checkBtn.disabled = false;
      checkBtn.style.opacity = "1";
      checkBtn.style.cursor = "pointer";
      checkBtn.style.pointerEvents = "auto";
    }
    if (autoBtn) {
      autoBtn.disabled = false;
      autoBtn.style.opacity = "1";
      autoBtn.style.cursor = "pointer";
      autoBtn.style.pointerEvents = "auto";
    }
  }

  if (mcbImg) {
    mcbImg.style.cursor = "pointer";
    mcbImg.addEventListener("click", function () {
      if (mcbState === "ON") {
        turnMCBOff("MCB turned OFF manually");
        showPopup("You turned off the DC Supply.<br>Turn it back on to continue the simulation.");
        enableCheckAndAutoConnect();
        if (guideActive) playAudio("audiosimulation/BetweenExp.DCSupplyOFF.wav");
        return;
      }
      if (!checkClickedAfterCompletion || !areAllConnectionsCorrect()) {
        showPopup("Make and check the connections before turning ON the DC Supply.");
        return;
      }
      mcbState = "ON";
      mcbReady = true;
      this.src = "images/mcb-on.png";
      disableCheckAndAutoConnect();
      setArmatureToSnapIndex(armatureSnapIndex, false);
      if (starterHandle) starterHandle.style.cursor = "grab";
      showPopup(" DC supply has been turned ON.<br> Now move the starter handle from left to right.");
      console.log("MCB ON");
      if (isGuideActive()) {
        // 🔊 AUDIO LOCATION 10 — MCB / DC Supply turned ON
        // Plays: "DC supply is on. Now move the starter handle from left to right."
        playAudio("audiosimulation/dc_on_start_starter.wav");
      }
    });
  }

  if (starterHandle) {
    starterHandle.addEventListener("mousedown", (e) => {
      if (mcbState !== "ON" || starterEngaged) return;
      starterDragging = true;
      startMouseX = e.clientX;
      starterHandle.style.cursor = "grabbing";
      e.preventDefault();
    });
    document.addEventListener("mouseup", () => {
      starterDragging = false;
      if (!starterEngaged) starterHandle.style.cursor = "grab";
    });
    document.addEventListener("mousemove", (e) => {
      if (!starterDragging || starterEngaged) return;
      const deltaX = e.clientX - startMouseX;
      let moveX = Math.max(START_X, Math.min(starterMotion.endX, deltaX));
      const progress = moveX / starterMotion.endX;
      const curveY = Math.sin(progress * Math.PI) * starterMotion.curveHeight;
      starterHandle.style.transform = `translate(${moveX}px, ${-curveY}px)`;
      if (moveX >= starterMotion.endX - 2) engageStarter();
    });
  }

 if (fieldKnob) {
  fieldKnob.addEventListener("mousedown", (e) => {

    if (mcbState !== "ON") {
      showPopup("First turn ON DC Supply");
      return;
    }

    if (!starterEngaged) {
      showPopup("Move the starter handle first.");
      return;
    }

    if (fieldLocked) return;

    fieldDragging = true;
    fieldStartX = e.clientX;
    fieldKnob.style.cursor = "grabbing";
    e.preventDefault();
  });
}

  document.addEventListener("mousemove", (e) => {
    if (!fieldDragging || fieldLocked) return;
    const deltaX = e.clientX - fieldStartX;
    let percentMove = (deltaX / 300) * 100;
    let newPercent = fieldCurrentPercent + percentMove;
    newPercent = Math.max(FIELD_MIN, Math.min(FIELD_MAX, newPercent));
    fieldKnob.style.left = `${newPercent}%`;
  });

  document.addEventListener("mouseup", () => {
    if (!fieldDragging || fieldLocked) return;
    fieldDragging = false;
    fieldCurrentPercent = parseFloat(fieldKnob.style.left) || FIELD_MIN;
    fieldLocked = true;
    fieldRheostatAudioPlayed = true;
    fieldKnob.style.cursor = "not-allowed";
    if (isGuideActive()) {
      // 🔊 AUDIO LOCATION 11 — field knob released and locked by user drag
      // Plays: "Field resistance is set. Now adjust the armature rheostat."
      playAudio("audiosimulation/Field Rheostat Set.wav");
    }
    setArmatureToSnapIndex(0, false);
    showPopup("Now, click on the add to table button to add the reading to the observation table.");
    if (armatureKnob) armatureKnob.style.cursor = "grab";
    setFieldDefaultMeters();
    if (!rotorRunning && mcbState === "ON" && starterEngaged) {
      rotorRunning = true;
      requestAnimationFrame(runRotor);
    }
    console.log("Field resistance fixed at:", fieldCurrentPercent + "%");
  });

  function engageStarter() {
    starterEngaged = true;
    starterDragging = false;
    starterHandle.style.transform = `translate(${starterMotion.endX}px, 0px)`;
    starterHandle.style.cursor = "default";
    localStorage.setItem("experimentStartTime", Date.now());
    applyStarterOnMeterState();
    if (!rotorRunning && rotor) {
      rotorRunning = true;
      requestAnimationFrame(runRotor);
    }
    console.log("✅ Starter ON");
    if (isGuideActive()) {
      // 🔊 AUDIO LOCATION 12 — starter handle reaches far right (engaged)
      // Plays: "Starter is on. Now set the field rheostat."
      playAudio("audiosimulation/After starter ON.wav");
    }
    unlockFieldResistance();
  }

  function unlockFieldResistance() {
    const fieldKnob = document.querySelector(".nob1");
    if (!fieldKnob) return;
    fieldLocked = false;
    fieldKnob.style.cursor = "grab";
    console.log("🔓 Field resistance unlocked");
  }

  function lockFieldResistance() {
    const fieldKnob = document.querySelector(".nob1");
    if (!fieldKnob) return;
    fieldLocked = true;
    fieldRheostatAudioPlayed = true;
    fieldKnob.style.cursor = "not-allowed";
    if (isGuideActive()) {
      // 🔊 AUDIO LOCATION 13 — lockFieldResistance() called programmatically
      // Plays: "Field resistance is set. Now adjust the armature rheostat."
      playAudio("audiosimulation/field_locked.wav");
    }
    console.log("🔒 Field resistance locked at user position");
  }

  const WIRE_CURVINESS = 80;
  const WIRE_CURVE_SHAPE = "u";

  function getWireAnchorForShape(anchor) {
    if (!anchor || !Array.isArray(anchor)) return anchor;
    if (WIRE_CURVE_SHAPE !== "u") return anchor;
    const uAnchor = anchor.slice();
    uAnchor[2] = 0;
    uAnchor[3] = 1;
    return uAnchor;
  }

  const ringSvg =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
        <circle cx="13" cy="13" r="12" fill="black"/>
        <circle cx="13" cy="13" r="9" fill="#C38055"/>
        <circle cx="13" cy="13" r="6" fill="black"/>
      </svg>
    `);

  const baseEndpointOptions = {
    endpoint: ["Image", { url: ringSvg, width: 26, height: 26 }],
    isSource: true,
    isTarget: true,
    maxConnections: -1,
    connector: ["Bezier", { curviness: WIRE_CURVINESS }]
  };

  const container = document.querySelector(".top-row");
  if (container) {
    jsPlumb.setContainer(container);
  } else {
    console.warn('jsPlumb: container ".top-row" not found.');
  }

  const anchors = {
    pointR: [1, 0.5, 1, 0],
    pointB: [0, 0.5, -1, 0],
    pointL: [1, 0.5, 1, 0],
    pointF: [0, 0.5, -1, 0],
    pointA: [1, 0.5, 1, 0],
    pointC: [0, 0.5, -1, 0],
    pointD: [1, 0.5, 1, 0],
    pointM: [0, 0.5, -1, 0],
    pointN: [1, 0.5, 1, 0],
    pointE: [0, 0.5, -1, 0],
    pointG: [1, 0.5, 1, 0],
    pointH: [0.5, 0.5, 0, 0],
    pointI: [0.5, 0.5, 0, 0],
    pointJ: [0, 0.5, -1, 0],
    pointK: [1, 0.5, 1, 0],
    pointA1: [0, 0.5, -1, 0],
    pointZ1: [1, 0.5, 1, 0],
    pointA3: [0, 0.5, -1, 0],
    pointZ3: [1, 0.5, 1, 0],
    pointA2: [0, 0.5, -1, 0],
    pointZ2: [1, 0.5, 1, 0],
    pointA4: [0, 0.5, -1, 0],
    pointZ4: [1, 0.5, 1, 0],
    pointL1: [0, 0.5, -1, 0],
    pointF2: [1, 0.5, 1, 0],
    pointF1: [1, 0.5, -1, 0]
  };

  const endpointsById = new Map();
  const loopbackTargets = new Map();

  function mirrorAnchor(anchor) {
    if (!anchor || !Array.isArray(anchor)) return null;
    const mirrored = anchor.slice();
    if (mirrored.length > 2) mirrored[2] = -mirrored[2];
    if (mirrored.length > 3) mirrored[3] = -mirrored[3];
    return mirrored;
  }

  function getLoopbackEndpoint(id) {
    if (loopbackTargets.has(id)) return loopbackTargets.get(id);
    const el = document.getElementById(id);
    if (!el) {
      console.warn("jsPlumb: element not found for loopback:", id);
      return null;
    }
    const baseAnchor = getWireAnchorForShape(anchors[id]);
    const loopAnchor = mirrorAnchor(baseAnchor) || baseAnchor || [0.5, 0.5, 0, 0];
    const ep = jsPlumb.addEndpoint(el, {
      anchor: loopAnchor,
      uuid: `${id}-loopback`,
      endpoint: "Blank",
      isSource: false,
      isTarget: true,
      maxConnections: -1
    });
    loopbackTargets.set(id, ep);
    return ep;
  }

  function addEndpointIfExists(id, anchor) {
    const el = document.getElementById(id);
    if (!el) {
      console.warn("jsPlumb: element not found:", id);
      return;
    }
    el.style.zIndex = 2000;
    const isLeftSide = anchor[0] === 0;
    const wireColor = isLeftSide ? "blue" : "red";
    const endpointAnchor = getWireAnchorForShape(anchor);
    const endpointOptions = { ...baseEndpointOptions };
    endpointOptions.connectorStyle = { stroke: wireColor, strokeWidth: 4 };
    const ep = jsPlumb.addEndpoint(el, { anchor: endpointAnchor, uuid: id }, endpointOptions);
    endpointsById.set(id, ep);
    return ep;
  }

  Object.keys(anchors).forEach(id => addEndpointIfExists(id, anchors[id]));

  function getOrCreateEndpoint(id) {
    let ep = endpointsById.get(id);
    if (!ep && typeof jsPlumb.getEndpoint === "function") {
      ep = jsPlumb.getEndpoint(id);
      if (ep) endpointsById.set(id, ep);
    }
    if (!ep && anchors[id]) {
      ep = addEndpointIfExists(id, anchors[id]);
    }
    return ep || null;
  }

  function connectionKey(a, b) {
    return [a, b].sort().join("-");
  }

  const WIRE_CURVE_OVERRIDES = new Map([
    [connectionKey("pointR", "pointC"), 120],
    [connectionKey("pointB", "pointD"), -70],
    [connectionKey("pointR", "pointL"), -70],
    [connectionKey("pointF", "pointH"), -60],
    [connectionKey("pointI", "pointF1"), 100],
    [connectionKey("pointA2", "pointF2"), -150],
    [connectionKey("pointA", "pointJ"), 160],
    [connectionKey("pointK", "pointE"), -120],
    [connectionKey("pointG", "pointA1"), -120],
    [connectionKey("pointM", "pointA1"), 60],
    [connectionKey("pointN", "pointA2"), 80]
  ]);

  function getWireCurvinessForConnection(sourceId, targetId) {
    const key = connectionKey(sourceId, targetId);
    const override = WIRE_CURVE_OVERRIDES.get(key);
    if (typeof override === "number") return override;
    return WIRE_CURVINESS;
  }

  function getSeenConnectionKeys() {
    const seen = new Set();
    jsPlumb.getAllConnections().forEach(conn => {
      seen.add(connectionKey(conn.sourceId, conn.targetId));
    });
    return seen;
  }

  function isPairConnected(a, b, connections) {
    return connections.some(conn => {
      const src = conn.sourceId;
      const tgt = conn.targetId;
      return (src === a && tgt === b) || (src === b && tgt === a);
    });
  }

  function isConnectionAllowed(src, tgt, uptoIndex) {
    const key = [src, tgt].sort().join("-");
    for (let i = 0; i <= uptoIndex; i++) {
      const [a, b] = requiredPairs[i].split("-");
      if ([a, b].sort().join("-") === key) return true;
    }
    return false;
  }

  let autoConnectUsed = false;
  let completedByAutoConnect = false;

  const requiredPairs = [
    "pointR-pointC",
    "pointB-pointD",
    "pointR-pointL",
    "pointF-pointH",
    "pointI-pointF1",
    "pointA2-pointF2",
    "pointA-pointJ",
    "pointK-pointE",
    "pointG-pointA1",
    "pointM-pointA1",
    "pointN-pointA2",
  ];

  function areAllConnectionsCorrect() {
    const connections = jsPlumb.getAllConnections();
    return requiredPairs.every(pair => {
      const [a, b] = pair.split("-");
      return isPairConnected(a, b, connections);
    });
  }

  function getFirstMissingStepIndex() {
    const connections = jsPlumb.getAllConnections();
    for (let i = 0; i < requiredPairs.length; i++) {
      const [a, b] = requiredPairs[i].split("-");
      if (!isPairConnected(a, b, connections)) return i;
    }
    return requiredPairs.length;
  }

  function connectRequiredPair(req, seenKeys, index = -1) {
    const [a, b] = req.split("-");
    if (!a || !b) return false;
    const isSelfConnection = a === b;
    const normalizedKey = connectionKey(a, b);
    if (seenKeys && seenKeys.has(normalizedKey)) return true;
    const aEl = document.getElementById(a);
    const bEl = document.getElementById(b);
    if (!aEl || !bEl) {
      console.warn("Auto Connect: missing element(s) for", req);
      return false;
    }
    const aAnchor = anchors[a];
    const bAnchor = anchors[b];
    const aIsLeft = aAnchor ? aAnchor[0] === 0 : false;
    const bIsLeft = bAnchor ? bAnchor[0] === 0 : false;
    let sourceId, targetId;
    if (isSelfConnection) {
      sourceId = a;
      targetId = a;
    } else if (aIsLeft !== bIsLeft) {
      const preferRight = (index % 2 === 0) || (index < 0);
      if (preferRight) {
        sourceId = aIsLeft ? b : a;
      } else {
        sourceId = bIsLeft ? b : a;
      }
      targetId = sourceId === a ? b : a;
    } else {
      sourceId = a;
      targetId = b;
    }
    const sourceAnchorSide = anchors[sourceId];
    const sourceIsLeftSide = sourceAnchorSide ? sourceAnchorSide[0] === 0 : false;
    const wireColor = sourceIsLeftSide ? "blue" : "red";
    const sourceEndpoint = getOrCreateEndpoint(sourceId);
    const targetEndpoint = isSelfConnection ? getLoopbackEndpoint(targetId) : getOrCreateEndpoint(targetId);
    if (!sourceEndpoint || !targetEndpoint) {
      console.warn("Auto Connect: missing endpoint(s) for", req);
      return false;
    }
    const connectionParams = {
      sourceEndpoint,
      targetEndpoint,
      connector: ["Bezier", { curviness: getWireCurvinessForConnection(sourceId, targetId) }],
      paintStyle: { stroke: wireColor, strokeWidth: 4 }
    };
    if (isSelfConnection) {
      const sourceAnchor = anchors[sourceId];
      const targetAnchor = mirrorAnchor(sourceAnchor) || sourceAnchor;
      if (sourceAnchor || targetAnchor) {
        connectionParams.anchors = [sourceAnchor || targetAnchor, targetAnchor];
      }
    }
    const conn = jsPlumb.connect(connectionParams);
    if (conn && seenKeys) seenKeys.add(connectionKey(conn.sourceId, conn.targetId));
    return !!conn;
  }

  // ── wrong connection counter (reset on correct wire or guide OFF) ──
  let wrongConnectionCount = 0;

  jsPlumb.bind("connection", function (info) {
    const curviness = getWireCurvinessForConnection(info.sourceId, info.targetId);
    info.connection.setConnector(["Bezier", { curviness }]);
    const src = info.sourceId;
    const tgt = info.targetId;

    if (!guideActive) return;

    const connections = jsPlumb.getAllConnections();

    // ── Saari connections sahi ho gayi ──
    const allConnected = requiredPairs.every(pair => {
      const [a, b] = pair.split("-");
      return isPairConnected(a, b, connections);
    });
    if (allConnected) {
      wrongConnectionCount = 0;          // reset counter
      currentStepIndex = requiredPairs.length;
      clearSpeakHighlights();
      speakCurrentStep();
      return;
    }

    // ── Check karo yeh wire sahi hai ya galat ──
    const [expectedA, expectedB] = requiredPairs[currentStepIndex].split("-");
    const isCorrect =
      (src === expectedA && tgt === expectedB) ||
      (src === expectedB && tgt === expectedA);

    if (!isCorrect) {
      // Galat wire — counter badhao
      wrongConnectionCount++;

      const stepNo = currentStepIndex + 1;

      if (wrongConnectionCount === 1) {
        // ── Pehli baar galat ── Wrongconnection → phir step audio
        playAudio("audiosimulation/Wrongconnection.wav");

        // Step audio thodi der baad bajao (Wrongconnection khatam hone ke baad)
        const wrongAudio = _activeAudio;
        if (wrongAudio) {
          wrongAudio.addEventListener("ended", () => {
            if (guideActive) {
              highlightStep(expectedA, expectedB);
              playConnectionStepAudio(stepNo);
            }
          }, { once: true });
        }

      } else {
        // ── Ek se zyada baar galat ── Multiplewrongconnections → phir step audio
        playAudio("audiosimulation/Multiplewrongconnections.wav");

        const multiAudio = _activeAudio;
        if (multiAudio) {
          multiAudio.addEventListener("ended", () => {
            if (guideActive) {
              highlightStep(expectedA, expectedB);
              playConnectionStepAudio(stepNo);
            }
          }, { once: true });
        }
      }

      highlightStep(expectedA, expectedB);
      return;
    }

    // ── Sahi connection ── counter reset karo
    wrongConnectionCount = 0;
    currentStepIndex = getFirstMissingStepIndex();
    speakCurrentStep();
  });

  const requiredConnections = new Set(requiredPairs.map(pair => {
    const [a, b] = pair.split("-");
    return [a, b].sort().join("-");
  }));

  document.querySelectorAll('[class^="point-"]').forEach(btn => {
    btn.style.cursor = "pointer";
    btn.addEventListener("click", function () {
      if (isModalOpen()) return;
      const className = this.className;
      if (mcbState === "ON") {
        showPopup("Turn off the DC Supply before removing the connections");
        if (guideActive) playAudio("audiosimulation/TurnoffDCSupplybefremoveconn.wav");
        return;
      }
      const match = className.match(/point-([A-Za-z0-9]+)/);
      if (match) {
        const pointId = "point" + match[1];
        const pointEl = document.getElementById(pointId);
        if (pointEl) {
          const relatedConnections = jsPlumb.getAllConnections().filter(c =>
            c.sourceId === pointId || c.targetId === pointId
          );
          if (relatedConnections.length === 0) return;
          const conn = relatedConnections[0];
          jsPlumb.deleteConnection(conn);
          jsPlumb.repaintEverything();
          autoConnectUsed = false;
          currentStepIndex = getFirstMissingStepIndex();
          checkClickedAfterCompletion = false;
          wrongConnectionCount = 0;
          turnMCBOff("Wire removed from " + pointId);
          if (guideActive) {
            setTimeout(() => speakCurrentStep(), 500);
          }
        }
      }
    });
  });

  let guideStepIndex = 0;
  const checkBtn = document.getElementById("checkBtn");
  if (checkBtn) {
    console.log("Check button found and wired.");
    checkBtn.addEventListener("click", function () {
      const connections = jsPlumb.getAllConnections();
      const totalWiresMade = connections.length;
      const seenKeys = new Set();
      connections.forEach(conn => seenKeys.add(connectionKey(conn.sourceId, conn.targetId)));
      const illegalRaw = [];
      connections.forEach(conn => {
        const key = connectionKey(conn.sourceId, conn.targetId);
        if (!requiredConnections.has(key)) illegalRaw.push({ src: conn.sourceId, tgt: conn.targetId });
      });
      const missingPairs = requiredPairs.filter(pair => {
        const [a, b] = pair.split("-");
        return !seenKeys.has(connectionKey(a, b));
      });
      const endpointLabelMap = {
        R: "P1",
        B: "P2",
        C: "G",
        D: "H",
        M: "I",
        N: "J",
        E: "K",
        G: "M",
        H: "D",
        I: "E",
        J: "B",
        K: "C",
      };
      function mapEndpointLabel(id) {
        const base = id.replace(/^point/i, "").toUpperCase();
        return endpointLabelMap[base] || base;
      }
      function toLabel(id) {
        return `Point ${mapEndpointLabel(id).replace(/([A-Za-z])(\d+)/g, "$1 $2")}`;
      }
      function toSpeech(id) {
        return mapEndpointLabel(id).replace(/([A-Za-z]+)(\d+)/g, "$1 $2").toUpperCase();
      }
      const firstIllegal = illegalRaw[0] || null;
      const firstMissing = missingPairs[0] || null;

      if (totalWiresMade === 0) {
        const msg = "Please make all the connections first.";
        showPopup(msg);
        if (guideActive) {
          // 🔊 AUDIO LOCATION 16 — Check clicked but connections wrong or missing
          // Plays: "Wrong connection detected. Please fix the wiring."
          playAudio("audiosimulation/Beforeconncheck.wav");
        }
        checkClickedAfterCompletion = false;
        currentStepIndex = 0;
        if (guideActive && requiredPairs.length > 0) {
          const [a, b] = requiredPairs[0].split("-");
          highlightStep(a, b);
        }
        return;
      }

      if (illegalRaw.length > 0 || missingPairs.length > 0) {
        let popupMessage = "";
        if (illegalRaw.length > 0) {
          const wrongLabels = illegalRaw.map(({ src, tgt }) => `${toLabel(src)} ↔ ${toLabel(tgt)}`);
          const preview = wrongLabels.slice(0, 3).join(", ");
          const extraCount = Math.max(0, wrongLabels.length - 3);
          const extraText = extraCount ? ` and ${extraCount} more` : "";
          popupMessage += `Wrong connection${illegalRaw.length > 1 ? "s" : ""}: ${preview}${extraText}.<br>`;
        }
        if (missingPairs.length > 0) {
          const missingLabels = missingPairs.map(pair => {
            const [a, b] = pair.split("-");
            return `${toLabel(a)} ↔ ${toLabel(b)}`;
          });
          const preview = missingLabels.slice(0, 3).join(", ");
          const extraCount = Math.max(0, missingLabels.length - 3);
          const extraText = extraCount ? ` and ${extraCount} more` : "";
          popupMessage += `Missing connection${missingPairs.length > 1 ? "s" : ""}: ${preview}${extraText}.`;
        }
        popupMessage = popupMessage.trim();
        const popupTitle = illegalRaw.length > 0 ? "Wiring Error" : "Connections Incomplete";
        showPopup(popupMessage, popupTitle);
        if (guideActive) {
          // 🔊 AUDIO LOCATION 16 — Check clicked but connections wrong or missing
          // Plays: "Wrong connection detected. Please fix the wiring."
          playAudio("audiosimulation/wrong_connection.wav");
        }
        checkClickedAfterCompletion = false;
        currentStepIndex = getFirstMissingStepIndex();
        if (guideActive && currentStepIndex < requiredPairs.length) {
          const [a, b] = requiredPairs[currentStepIndex].split("-");
          highlightStep(a, b);
        }
        return;
      }

      checkClickedAfterCompletion = true;
      currentStepIndex = requiredPairs.length;
      clearSpeakHighlights();
      const successMsg = "Connections are correct! Click on the DC Supply to turn it ON.";
      showPopup(successMsg);
      if (guideActive) {
        // 🔊 AUDIO LOCATION 17 — Check clicked and ALL connections correct
        // Plays: "Connections are correct. Now turn on the DC supply."
        playAudio("audiosimulation/connections_verified.wav");
      }
    });
  }

  const autoConnectBtn = document.getElementById("auto");
  if (autoConnectBtn) {
    autoConnectBtn.addEventListener("click", function () {
      autoConnectUsed = true;
      currentStepIndex = requiredPairs.length;
      checkClickedAfterCompletion = false;
      const runBatch = typeof jsPlumb.batch === "function" ? jsPlumb.batch.bind(jsPlumb) : (fn => fn());
      runBatch(function () {
        if (typeof jsPlumb.deleteEveryConnection === "function") {
          jsPlumb.deleteEveryConnection();
        } else {
          jsPlumb.getAllConnections().forEach(c => jsPlumb.deleteConnection(c));
        }
        const seenKeys = new Set();
        requiredPairs.forEach((req, index) => connectRequiredPair(req, seenKeys, index));
      });
      requestAnimationFrame(() => {
        jsPlumb.repaintEverything();
        const seenKeys = getSeenConnectionKeys();
        const missing = [];
        requiredConnections.forEach(req => {
          const [a, b] = req.split("-");
          const key = a && b ? connectionKey(a, b) : req;
          if (!seenKeys.has(key)) missing.push(req);
        });
        if (missing.length) {
          console.warn("Auto Connect: retrying missing connection(s):", missing);
          runBatch(() => {
            const seenNow = getSeenConnectionKeys();
            missing.forEach(req => connectRequiredPair(req, seenNow));
          });
          requestAnimationFrame(() => jsPlumb.repaintEverything());
        }
        console.log(`Auto Connect: required=${requiredConnections.size}, missing after retry=${missing.length}`);
        completedByAutoConnect = true;
        clearSpeakHighlights();
        // 🔊 AUDIO LOCATION 18 — Auto Connect button clicked
        playAudio("audiosimulation/autoconnect_completed.wav");
      });
    });
  } else {
    console.error("Auto Connect button not found!");
  }

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      const wasGuideActive = guideActive; // ← save karo pehle
      guideActive = false;
      clearSpeakHighlights();
      if (reportBtn) {
        reportBtn.disabled = true;
        reportBtn.style.opacity = "0.5";
        reportBtn.style.cursor = "not-allowed";
        reportBtn.style.pointerEvents = "none";
      }
      if (speakBtn) {
        speakBtn.setAttribute("aria-pressed", "false");
        speakBtn.querySelector(".speak-btn__label").textContent = "AI Guide";
      }
      enableCheckAndAutoConnect();
      if (typeof jsPlumb.deleteEveryConnection === "function") {
        jsPlumb.deleteEveryConnection();
      } else {
        jsPlumb.getAllConnections().forEach(conn => jsPlumb.deleteConnection(conn));
      }
      jsPlumb.repaintEverything();
      turnMCBOff("");
      showPopup("The Simulation has been reset.\n\nYou can start again.", "Simulation Reset");
      localStorage.removeItem("experimentStartTime");
      localStorage.removeItem("experimentEndTime");
      localStorage.removeItem("reportStartTime");
      localStorage.removeItem("reportEndTime");
      localStorage.removeItem("reportDuration");
      autoConnectUsed = false;
      currentStepIndex = 0;
      checkClickedAfterCompletion = false;
      introSpoken = false;
      completedByAutoConnect = false;
      fieldRheostatAudioPlayed = false;
      graphReadings.length = 0;
      updateGraphButtonState();
      const graphContainer = document.getElementById("graphBars");
      if (graphContainer) graphContainer.innerHTML = "";
      const graphPlot = document.getElementById("graphPlot");
      if (graphPlot) {
        graphPlot.innerHTML = "";
        graphPlot.style.display = "none";
      }
      const graphBarsReset = document.getElementById("graphBars");
      if (graphBarsReset) graphBarsReset.style.display = "block";
      const graphCanvas = document.querySelector(".graph-canvas");
      if (graphCanvas) {
        graphCanvas.classList.remove("is-plotting", "use-print-image");
        const graphPrintImage = graphCanvas.querySelector(".graph-print-image-main");
        if (graphPrintImage) graphPrintImage.removeAttribute("src");
      }
      isPrintGraphPrepared = false;
      // Play Reset.wav if guide was active when reset was clicked
      if (wasGuideActive) {
        playAudio("audiosimulation/Reset.wav");
      }
      voiceStage = "idle";
      console.log("Reset: all connections removed");
    });
  } else {
    console.error("Reset button not found!");
  }

  // ==============================
  // ✅ THE REAL FIX: ENDPOINT POSITION ON FIRST LOAD
  // ==============================

  function forceJsPlumbRefresh() {
    if (typeof jsPlumb.recalculateOffsets === "function") {
      jsPlumb.recalculateOffsets(container);
    }
    Object.keys(anchors).forEach(id => {
      const el = document.getElementById(id);
      if (el && typeof jsPlumb.recalculateOffsets === "function") {
        jsPlumb.recalculateOffsets(el);
      }
    });
    jsPlumb.repaintEverything();
  }

  window._jsPlumbRefreshPending = true;

  window._onSimulationLayoutReady = function () {
    if (!window._jsPlumbRefreshPending) return;
    window._jsPlumbRefreshPending = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        forceJsPlumbRefresh();
        setTimeout(() => forceJsPlumbRefresh(), 200);
      });
    });
  };

  window.addEventListener("load", function () {
    setTimeout(() => {
      if (window._jsPlumbRefreshPending) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            forceJsPlumbRefresh();
            setTimeout(() => forceJsPlumbRefresh(), 200);
          });
        });
      }
    }, 50);
  });

  window.addEventListener("resize", () => {
    forceJsPlumbRefresh();
  });

  createObservationTable();
  currentStepIndex = 0;
  updateGraphButtonState();

  const addTableBtn = document.getElementById("addTableBtn");
  if (addTableBtn) addTableBtn.addEventListener("click", addObservationRow);

  const plotGraphBtn = document.getElementById("plotGraphBtn");
  if (plotGraphBtn) plotGraphBtn.addEventListener("click", drawGraph);

  const reportBtn = document.getElementById("reportBtn");
  if (reportBtn) {
    reportBtn.disabled = true;
    reportBtn.style.opacity = "0.5";
    reportBtn.style.cursor = "not-allowed";
    reportBtn.style.pointerEvents = "none";
  }

  reportBtn.addEventListener("click", () => {
    const startTimeCheck = localStorage.getItem("experimentStartTime");
    if (!startTimeCheck) {
      showPopup("⚠️ Experiment has not started yet.\nPlease start the motor before generating report.", "Report Error");
      return;
    }
    if (graphReadings.length === 0) {
      showPopup("⚠️ No observation data available for report.", "Report Error");
      return;
    }
    showPopup("Your report has been generated successfully. Click OK to view your report.", "Report Ready");
    if (isGuideActive()) {
      // 🔊 AUDIO LOCATION 19 — Report button clicked, popup shown
      // Plays: "Report generated successfully. Click OK to view."
      playAudio("audiosimulation/Report.wav");
    }
   waitForWarningModalAcknowledgement().then(() => {
      const endTime = Date.now();
      localStorage.setItem("experimentEndTime", endTime);
      const startTime = parseInt(localStorage.getItem("experimentStartTime"));
      const durationMs = endTime - startTime;
      const durationTotalSeconds = Math.floor(durationMs / 1000);
      const durationMins = Math.floor(durationTotalSeconds / 60);
      const durationSecs = durationTotalSeconds % 60;
      const durationText = `${durationMins} min ${String(durationSecs).padStart(2, "0")} sec`;
      localStorage.setItem("reportStartTime", new Date(startTime).toLocaleTimeString());
      localStorage.setItem("reportEndTime", new Date(endTime).toLocaleTimeString());
      localStorage.setItem("reportDuration", durationText);
      localStorage.setItem("experimentReport", JSON.stringify(graphReadings));
      localStorage.setItem("tableData", JSON.stringify(
        graphReadings.map((row, index) => ({
          count: index + 1,
          resistance: row.resistance,
          voltage: row.voltage,
          rpm: row.rpm
        }))
      ));

      // ✅ Sirf flag save karo — progress report unlock ke liye
      const updatedAt = String(Date.now());
      const pendingReportMarker = "__vlab_report_pending__";
      try {
        localStorage.setItem("vlab_exp2_simulation_report_html", pendingReportMarker);
        localStorage.setItem("vlab_exp2_simulation_report_updated_at", updatedAt);
        const activeHash = localStorage.getItem("vlab_exp2_active_user_hash");
        if (activeHash) {
          localStorage.setItem(`vlab_exp2_user_${activeHash}_simulation_report_html`, pendingReportMarker);
          localStorage.setItem(`vlab_exp2_user_${activeHash}_simulation_report_updated_at`, updatedAt);
        }
      } catch(e) {}

      // ✅ Parent window notify
     // ✅ Parent window notify
      try {
        window.parent.postMessage(
          { type: "vlab:simulation_report_generated", updatedAt, html: pendingReportMarker }, "*"
        );
      } catch(e) {}

      window.open("report.html", "_blank");
      onReportGenerated();
  
    });
  });

  const PRINT_PAGE_WIDTH_MM = 297;
  const PRINT_PAGE_HEIGHT_MM = 210;
  const PRINT_PAGE_MARGIN_MM = 10;
  const PRINT_HEIGHT_BUFFER_PX = 24;
  const PRINT_SCALE_SAFETY_FACTOR = 0.985;
  const PRINT_SCALE_MIN = 0.2;

  function mmToPx(mm) {
    return (mm * 96) / 25.4;
  }

  function parseCssNumber(value) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getOuterBoxSize(element) {
    if (!element) return { width: 0, height: 0 };
    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    const marginX = parseCssNumber(styles.marginLeft) + parseCssNumber(styles.marginRight);
    const marginY = parseCssNumber(styles.marginTop) + parseCssNumber(styles.marginBottom);
    return {
      width: rect.width + marginX,
      height: rect.height + marginY
    };
  }

  function updateSinglePagePrintScale() {
    const wrapper = document.querySelector(".simulation-wrapper") ||
      document.querySelector(".simulation-container");
    const panel = document.querySelector(".panel");
    const footer = document.querySelector(".panel-footer");
    if (!wrapper || !panel || !footer) return;

    const panelOuter = getOuterBoxSize(panel);
    const footerOuter = getOuterBoxSize(footer);
    const stackedOuterHeight = panelOuter.height + footerOuter.height + 8;
    const stackedScrollHeight = panel.scrollHeight + footer.scrollHeight + 8;

    const contentWidth = Math.max(
      panel.scrollWidth,
      footer.scrollWidth,
      panelOuter.width,
      footerOuter.width
    );
    const baseContentHeight = Math.max(
      stackedOuterHeight,
      stackedScrollHeight
    );
    const contentHeight = baseContentHeight + PRINT_HEIGHT_BUFFER_PX;
    if (!contentWidth || !contentHeight) return;

    document.documentElement.style.setProperty("--print-scale", "1");
    document.documentElement.style.setProperty("--print-content-width", `${Math.ceil(contentWidth)}px`);
    document.documentElement.style.setProperty("--print-horizontal-offset", "0px");
    document.documentElement.style.setProperty("--print-transform-scale", "1");

    // Force layout after resetting scale.
    void wrapper.offsetHeight;

    const printableWidthPx = mmToPx(PRINT_PAGE_WIDTH_MM - (PRINT_PAGE_MARGIN_MM * 2));
    const printableHeightPx = mmToPx(PRINT_PAGE_HEIGHT_MM - (PRINT_PAGE_MARGIN_MM * 2));

    const rawScale = Math.min(
      printableWidthPx / contentWidth,
      printableHeightPx / contentHeight
    );

    const safetyScale = rawScale * PRINT_SCALE_SAFETY_FACTOR;
    const clampedScale = Math.max(PRINT_SCALE_MIN, Math.min(1, safetyScale));
    const horizontalOffset = Math.max(0, (printableWidthPx - (contentWidth * clampedScale)) / 2);

    document.documentElement.style.setProperty("--print-scale", clampedScale.toFixed(4));
    document.documentElement.style.setProperty("--print-content-width", `${Math.ceil(contentWidth)}px`);
    document.documentElement.style.setProperty("--print-horizontal-offset", `${horizontalOffset.toFixed(2)}px`);
    document.documentElement.style.setProperty("--print-transform-scale", clampedScale.toFixed(4));
  }

  function clearSinglePagePrintScale() {
    document.documentElement.style.removeProperty("--print-scale");
    document.documentElement.style.removeProperty("--print-content-width");
    document.documentElement.style.removeProperty("--print-horizontal-offset");
    document.documentElement.style.removeProperty("--print-transform-scale");
  }

  function repaintPrintConnections() {
    if (typeof forceJsPlumbRefresh === "function") {
      forceJsPlumbRefresh();
      setTimeout(() => forceJsPlumbRefresh(), 60);
      return;
    }
    if (typeof jsPlumb !== "undefined") jsPlumb.repaintEverything();
  }

  function setPrintModeClass(enabled) {
    const method = enabled ? "add" : "remove";
    document.body.classList[method]("print-mode");
    document.documentElement.classList[method]("print-mode");
  }

  function waitForStablePrintLayout() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  window.addEventListener("beforeprint", () => {
    setPrintModeClass(true);
    const prepPromise = isPrintGraphPrepared ? Promise.resolve(true) : prepareGraphForPrint();
    Promise.resolve(prepPromise)
      .catch(() => { })
      .then(() => {
        updateSinglePagePrintScale();
        repaintPrintConnections();
        setTimeout(() => {
          updateSinglePagePrintScale();
          repaintPrintConnections();
        }, 60);
      });
  });

  window.addEventListener("afterprint", () => {
    setPrintModeClass(false);
    clearSinglePagePrintScale();
    document.documentElement.classList.remove("print-no-graph-data");
    restoreMainGraphAfterPrint();
    repaintPrintConnections();
  });

  const printBtn = document.getElementById("printBtn");
  if (printBtn) {
    printBtn.addEventListener("click", async () => {
      if (isGuideActive()) playAudio("audiosimulation/Print.wav");
      setPrintModeClass(true);
      await prepareGraphForPrint();
      updateSinglePagePrintScale();
      repaintPrintConnections();
      await waitForStablePrintLayout();
      updateSinglePagePrintScale();
      repaintPrintConnections();
      await waitForStablePrintLayout();
      setTimeout(() => window.print(), 120);
    });
  }
});

// ==============================
// COMPONENT WINDOW AUTO OPEN
// ==============================

const COMPONENTS_SEEN_KEY = "vl_components_seen";
const COMPONENTS_ALERT_KEY = "vl_components_alert_shown";

function hasSeenComponents() {
  try { return localStorage.getItem(COMPONENTS_SEEN_KEY) === "1"; } catch (e) { return false; }
}
function markComponentsSeen() {
  try { localStorage.setItem(COMPONENTS_SEEN_KEY, "1"); } catch (e) { }
}
function hasShownComponentsAlert() {
  try { return localStorage.getItem(COMPONENTS_ALERT_KEY) === "1"; } catch (e) { return false; }
}
function markComponentsAlertShown() {
  try { localStorage.setItem(COMPONENTS_ALERT_KEY, "1"); } catch (e) { }
}
let componentWindowWasActuallyOpened = false;

function openComponentsWindow({ force = false, auto = false } = {}) {
  const modal = document.getElementById("componentsModal");
  if (!modal) return;
  if (!force && auto && hasSeenComponents()) return;
  componentWindowWasActuallyOpened = true;
  // labSpeech removed — no TTS to disable here
  modal.classList.remove("is-hidden");
  document.body.classList.add("is-modal-open");
  if (auto) markComponentsSeen();
}

const COMPONENTS_EXIT_MESSAGE =
  "Now that you are familiar with all the components used in this experiment, " +
  "you may now start the simulation.<br><br>An AI guide is available to assist you at every step.";

function showComponentsExitAlert() {
  if (!componentWindowWasActuallyOpened) return;
  if (hasShownComponentsAlert()) return;
  markComponentsAlertShown();
  const speakBtn = document.querySelector(".speak-btn");
  if (speakBtn) {
    speakBtn.classList.add("speak-attention");
    speakBtn.addEventListener("click", () => speakBtn.classList.remove("speak-attention"), { once: true });
  }
  showPopup(COMPONENTS_EXIT_MESSAGE, "Instruction");

  // 🔊 Component window close hone par — sirf pehli baar bajega
  if (componentWindowWasActuallyOpened && window.isGuideActive && window.isGuideActive()) {
    const introAudio = new Audio("audiosimulation/ComponentsWindowIntro.wav");
    window._activeComponentIntroAudio = introAudio;
    introAudio.play().catch(() => { });
    introAudio.addEventListener("ended", () => {
      window._activeComponentIntroAudio = null;
    });
  }
}

function closeComponentsWindow({ showAlert = false } = {}) {
  const modal = document.getElementById("componentsModal");
  if (!modal) return;
  // labSpeech removed — no TTS to re-enable here
  modal.classList.add("is-hidden");
  document.body.classList.remove("is-modal-open");

  if (typeof window._onSimulationLayoutReady === "function") {
    window._onSimulationLayoutReady();
  }

  if (showAlert) showComponentsExitAlert();
}

document.addEventListener("click", (e) => {
  const launcher = e.target.closest("[data-open-components]");
  if (!launcher) return;
  openComponentsWindow({ force: true });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => openComponentsWindow({ auto: true }));
} else {
  openComponentsWindow({ auto: true });
}

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-components-close]")) {
    const iframe = document.querySelector("#componentsModal iframe");
    iframe?.contentWindow?.postMessage({ type: "component-audio-stop" }, "*");
    // labSpeech removed — no TTS to stop here
    closeComponentsWindow({ showAlert: true });
  }
});

// ==============================
// COMPONENT AUDIO BRIDGE
// ==============================

const iframe = document.querySelector("#componentsModal iframe");
const audioBtn = document.getElementById("componentsAudioBtn");
const skipBtn = document.getElementById("skipComponentsBtn");

if (audioBtn && iframe) {
  audioBtn.addEventListener("click", () => {
    const isPlaying = audioBtn.getAttribute("aria-pressed") === "true";
    iframe.contentWindow?.postMessage(
      { type: isPlaying ? "component-audio-pause" : "component-audio-play" },
      "*"
    );
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data || {};
    if (data.type === "component-audio-state") {
      const { playing, disabled, label } = data;
      audioBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      if (label) audioBtn.textContent = label;
      audioBtn.disabled = !!disabled;
    }
    if (data.type === "component-audio-blocked") {
      audioBtn.textContent = "Tap to enable audio";
      audioBtn.setAttribute("aria-pressed", "false");
    }
  });

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage({ type: "component-audio-request" }, "*");
    // Auto-play only if component window is actually visible
    if (componentWindowWasActuallyOpened) {
      setTimeout(() => {
        iframe.contentWindow?.postMessage({ type: "component-audio-play" }, "*");
      }, 500);
    }
  });
}

if (skipBtn && iframe) {
  skipBtn.addEventListener("click", () => {
    iframe.contentWindow?.postMessage({ type: "component-audio-stop" }, "*");
    // labSpeech removed — no TTS to stop here
    closeComponentsWindow({ showAlert: true });
  });
}

// ==============================
// 🤖 CHATBOT PANEL
// ==============================
(function initChatbotWidget() {
  function setup() {
    const widget = document.querySelector(".chatbot-widget");
    if (!widget) return;
    const toggleBtn = widget.querySelector(".chatbot-launcher");
    const panel = widget.querySelector(".chatbot-panel");
    const closeBtn = widget.querySelector(".chatbot-panel-close");
    const iframe = panel?.querySelector("iframe");
    const placeholder = panel?.querySelector(".chatbot-panel-placeholder");
    const chatUrl = (panel?.dataset?.chatUrl || "").trim();
    if (!toggleBtn || !panel || !iframe || !chatUrl) {
      console.warn("Chatbot widget incomplete");
      return;
    }
    let isLoaded = false;
    let notifiedOnce = false;
    function openPanel() {
      panel.classList.add("open");
      widget.classList.add("chatbot-open");
      toggleBtn.setAttribute("aria-expanded", "true");
      if (!isLoaded) {
        if (placeholder) placeholder.style.display = "flex";
        iframe.addEventListener("load", () => {
          isLoaded = true;
          iframe.classList.add("chatbot-frame-visible");
          if (placeholder) placeholder.style.display = "none";
          const notifyAudio = document.getElementById("chatbot-notification-audio");
          if (notifyAudio && !notifiedOnce) {
            notifiedOnce = true;
            notifyAudio.currentTime = 0;
            notifyAudio.play().catch(() => { });
          }
        }, { once: true });
        iframe.src = chatUrl;
      }
    }
    function closePanel() {
      panel.classList.remove("open");
      widget.classList.remove("chatbot-open");
      toggleBtn.setAttribute("aria-expanded", "false");
    }
    toggleBtn.addEventListener("click", () => {
      panel.classList.contains("open") ? closePanel() : openPanel();
    });
    closeBtn?.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeComponentsWindow({ showAlert: true });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();

/* ===============================
   🎯 COMPONENT TOOLTIP SYSTEM
=============================== */
(function initComponentTooltips() {
  function setup() {
    if (document.querySelector(".hover-tooltip")) return;
    const tooltip = document.createElement("div");
    tooltip.className = "hover-tooltip";
    tooltip.innerHTML = `
      <div class="hover-tooltip__body">
        <div class="hover-tooltip__accent"></div>
        <div class="hover-tooltip__text"></div>
      </div>
    `;
    document.body.appendChild(tooltip);
    const tooltipText = tooltip.querySelector(".hover-tooltip__text");
    let activeTarget = null;
    const tooltips = [
      { id: "mcb", selector: ".mcb-label", text: "Purpose: To ensure the safety of equipment and users by tripping during electrical faults." },
      { id: "starter", selector: ".starter-body", text: "Purpose: Limits the starting current of a DC motor by using external armature resistance, which is cut out as the motor speeds up, and provides overload and no-voltage protection.\n\nRatings: Voltage - 220V DC, 7.5 HP" },
      { id: "voltmeter", selector: ".primary-voltmeter, .secondary-voltmeter, .meter-needle1, .meter-needle2", text: "Purpose: To measure the armature voltage of the DC shunt motor." },
      { id: "ammeter", selector: ".ammeter-card, .meter-needle3", text: "Purpose: To measure the field current drawn by the DC shunt motor." },
      { id: "rpm-display", selector: ".rpm-image, .rpm-display, #rpmDisplay", text: "Purpose: An RPM indicator measures the rotational speed of the motor shaft in revolutions per minute. It helps in monitoring and analyzing the speed performance of the DC machine under different operating conditions. \n\nRange:  0-2000 RPM" },
      { id: "field-rheostat", selector: ".rheostat-img-1, .nob1", text: "Purpose: The field resistance is set once and kept constant so that the flux remains constant, so any change in speed is only due to the change in armature voltage caused by the external added resistance.\n\nRatings: 300 ohm, 3A" },
      { id: "armature-rheostat", selector: ".rheostat-img-2, .nob2", text: "Purpose: By varying the armature resistance causes a voltage drop in the armature circuit, allowing control of the motor speed below its rated speed.\n\nRatings: 75 ohm, 5A" },
      { id: "motor-box", selector: ".motor-box, .motor-box img", text: "Purpose: The DC shunt motor is the machine whose speed is being controlled in this experiment.\n\nRatings: 5HP, Voltage - 220 V DC, Max. Current - 19 A, Speed - 1500 RPM, Winding Type - Shunt" },
      { id: "generator-box", selector: ".generator-box, .generator-body, .generator-rotor, #gr", text: "Purpose: In a DC Shunt motor. the rotor is also called the armature. It is the rotating part of the motor where speed variation takes place due to changes in the armature voltage." }
    ];
    tooltips.forEach(t => {
      document.querySelectorAll(t.selector).forEach(el => el.removeAttribute("title"));
    });
    function findTooltip(target) {
      for (const t of tooltips) {
        const match = target.closest(t.selector);
        if (match) return { el: match, text: t.text, id: t.id };
      }
      return null;
    }
    function moveTooltip(e) {
      tooltip.style.left = e.clientX + 16 + "px";
      tooltip.style.top = e.clientY + 16 + "px";
    }
    function showTooltip(text, e) {
      tooltipText.textContent = text;
      moveTooltip(e);
      tooltip.classList.add("show");
    }
    function hideTooltip() {
      tooltip.classList.remove("show");
      activeTarget = null;
    }
    document.addEventListener("click", (e) => {
      const found = findTooltip(e.target);
      if (!found) { hideTooltip(); return; }
      if (activeTarget === found.el) { hideTooltip(); return; }
      activeTarget = found.el;
      showTooltip(found.text, e);
      activeTarget.addEventListener("mouseleave", () => hideTooltip(), { once: true });
    });
    document.addEventListener("mousemove", (e) => {
      if (tooltip.classList.contains("show")) moveTooltip(e);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTooltip();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
