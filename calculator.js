/* ═══════════════════════════════════════════════════════
   LAGNSPASHT CALCULATOR — 4-AGENT ARCHITECTURE
   
   Agent 1: Validation Agent  (input sanitisation)
   Agent 2: Data Agent        (Panchang entry handling)
   Agent 3: Calculation Agent (core math engine)
   Agent 4: UI Agent          (rendering & interaction)
   
   ALL arithmetic uses integer Vipal — no floats, no rounding.
   ═══════════════════════════════════════════════════════ */

"use strict";

// ╔═══════════════════════════════════════════════╗
// ║  AGENT 1 — VALIDATION AGENT                  ║
// ╚═══════════════════════════════════════════════╝
const ValidationAgent = (() => {

  /**
   * Validate a single numeric input field.
   * Returns { valid, value, error }
   */
  function validateField(raw, fieldName, min, max) {
    if (raw === '' || raw === null || raw === undefined) {
      return { valid: false, value: 0, error: `${fieldName} is required.` };
    }
    const str = String(raw).trim();
    // Must be a non-negative integer
    if (!/^\d+$/.test(str)) {
      return { valid: false, value: 0, error: `${fieldName} must be a non-negative integer.` };
    }
    const val = parseInt(str, 10);
    if (val < min || val > max) {
      return { valid: false, value: 0, error: `${fieldName} must be between ${min} and ${max}. Got ${val}.` };
    }
    return { valid: true, value: val, error: null };
  }

  /**
   * Validate a Ghati-Pal-Vipal triplet.
   * Pal and Vipal must be 0–59 (standard convention).
   * Ghati can be 0–unlimited.
   */
  function validateGPV(ghatiRaw, palRaw, vipalRaw, label) {
    const errors = [];
    const gRes = validateField(ghatiRaw, `${label} — Ghati`, 0, 999999);
    const pRes = validateField(palRaw,   `${label} — Pal`,   0, 59);
    const vRes = validateField(vipalRaw, `${label} — Vipal`, 0, 59);

    if (!gRes.valid) errors.push(gRes.error);
    if (!pRes.valid) errors.push(pRes.error);
    if (!vRes.valid) errors.push(vRes.error);

    return {
      valid: errors.length === 0,
      ghati: gRes.value,
      pal:   pRes.value,
      vipal: vRes.value,
      errors
    };
  }

  /**
   * Validate Rashi (0-11) and Ansh (0-29).
   */
  function validateRashiAnsh(rashiRaw, anshRaw, label) {
    const errors = [];
    const rRes = validateField(rashiRaw, `${label} — Rashi`, 0, 11);
    const aRes = validateField(anshRaw,  `${label} — Ansh`,  0, 29);

    if (!rRes.valid) errors.push(rRes.error);
    if (!aRes.valid) errors.push(aRes.error);

    return {
      valid: errors.length === 0,
      rashi: rRes.value,
      ansh:  aRes.value,
      errors
    };
  }

  /**
   * Master validation — validates all inputs at once.
   * Returns { valid, data, errors[] }
   */
  function validateAll(inputs) {
    const allErrors = [];

    // Sarini Fal
    const sf = validateGPV(
      inputs.sariniFal_ghati,
      inputs.sariniFal_pal,
      inputs.sariniFal_vipal,
      'Sarini Fal'
    );
    if (!sf.valid) allErrors.push(...sf.errors);

    // Ishtkal
    const ik = validateGPV(
      inputs.ishtkal_ghati,
      inputs.ishtkal_pal,
      inputs.ishtkal_vipal,
      'Ishtkal'
    );
    if (!ik.valid) allErrors.push(...ik.errors);

    // Entry A — Sarini Fal
    const ea_sf = validateGPV(
      inputs.entryA_sf_ghati,
      inputs.entryA_sf_pal,
      inputs.entryA_sf_vipal,
      'Entry A — Sarini Fal'
    );
    if (!ea_sf.valid) allErrors.push(...ea_sf.errors);

    // Entry A — Rashi/Ansh
    const ea_ra = validateRashiAnsh(
      inputs.entryA_rashi,
      inputs.entryA_ansh,
      'Entry A'
    );
    if (!ea_ra.valid) allErrors.push(...ea_ra.errors);

    // Entry B — Sarini Fal
    const eb_sf = validateGPV(
      inputs.entryB_sf_ghati,
      inputs.entryB_sf_pal,
      inputs.entryB_sf_vipal,
      'Entry B — Sarini Fal'
    );
    if (!eb_sf.valid) allErrors.push(...eb_sf.errors);

    // Entry B — Rashi/Ansh
    const eb_ra = validateRashiAnsh(
      inputs.entryB_rashi,
      inputs.entryB_ansh,
      'Entry B'
    );
    if (!eb_ra.valid) allErrors.push(...eb_ra.errors);

    if (allErrors.length > 0) {
      return { valid: false, data: null, errors: allErrors };
    }

    return {
      valid: true,
      data: {
        sariniFal: { ghati: sf.ghati, pal: sf.pal, vipal: sf.vipal },
        ishtkal:   { ghati: ik.ghati, pal: ik.pal, vipal: ik.vipal },
        entryA: {
          sf:    { ghati: ea_sf.ghati, pal: ea_sf.pal, vipal: ea_sf.vipal },
          rashi: ea_ra.rashi,
          ansh:  ea_ra.ansh
        },
        entryB: {
          sf:    { ghati: eb_sf.ghati, pal: eb_sf.pal, vipal: eb_sf.vipal },
          rashi: eb_ra.rashi,
          ansh:  eb_ra.ansh
        }
      },
      errors: []
    };
  }

  return { validateAll, validateField, validateGPV, validateRashiAnsh };
})();


// ╔═══════════════════════════════════════════════╗
// ║  AGENT 2 — DATA AGENT (Panchang Handling)    ║
// ╚═══════════════════════════════════════════════╝
const DataAgent = (() => {

  /**
   * Convert Ghati-Pal-Vipal to total Vipal (integer).
   * 1 Ghati = 60 Pal, 1 Pal = 60 Vipal
   */
  function toVipal(ghati, pal, vipal) {
    return (ghati * 3600) + (pal * 60) + vipal;
  }

  /**
   * Convert total Vipal back to Ghati-Pal-Vipal.
   */
  function fromVipal(totalVipal) {
    const ghati = Math.floor(totalVipal / 3600);
    const remainder = totalVipal % 3600;
    const pal = Math.floor(remainder / 60);
    const vipal = remainder % 60;
    return { ghati, pal, vipal };
  }

  /**
   * Format Ghati-Pal-Vipal as readable string.
   */
  function formatGPV(ghati, pal, vipal) {
    return `${ghati} Ghati ${pal} Pal ${vipal} Vipal`;
  }

  /**
   * Validate Panchang entry ordering.
   * Returns { valid, error, yogfal, sfA, sfB } — all in Vipal.
   */
  function validateEntryOrdering(data) {
    const sfVipal   = toVipal(data.sariniFal.ghati, data.sariniFal.pal, data.sariniFal.vipal);
    const ikVipal   = toVipal(data.ishtkal.ghati, data.ishtkal.pal, data.ishtkal.vipal);
    const yogfal    = sfVipal + ikVipal;

    const sfA_vipal = toVipal(data.entryA.sf.ghati, data.entryA.sf.pal, data.entryA.sf.vipal);
    const sfB_vipal = toVipal(data.entryB.sf.ghati, data.entryB.sf.pal, data.entryB.sf.vipal);

    const errors = [];

    // Entry A's Sarini Fal must be greater than input Sarini Fal
    if (sfA_vipal <= sfVipal) {
      errors.push(
        `Entry A Sarini Fal (${formatGPV(data.entryA.sf.ghati, data.entryA.sf.pal, data.entryA.sf.vipal)}) ` +
        `must be greater than Sarini Fal (${formatGPV(...Object.values(fromVipal(sfVipal)))}). ` +
        `Entry A should be the Panchang entry just greater than Sarini Fal.`
      );
    }

    // Entry B must be < Entry A
    if (sfB_vipal >= sfA_vipal) {
      errors.push(
        `Entry B Sarini Fal (${formatGPV(data.entryB.sf.ghati, data.entryB.sf.pal, data.entryB.sf.vipal)}) ` +
        `must be strictly less than Entry A Sarini Fal (${formatGPV(data.entryA.sf.ghati, data.entryA.sf.pal, data.entryA.sf.vipal)}). ` +
        `Entry B is the previous Panchang entry before A.`
      );
    }

    // Entry A's Sarini Fal must not equal Entry B's (would cause division by zero)
    if (sfA_vipal === sfB_vipal) {
      errors.push(
        `Entry A and Entry B Sarini Fal values are identical. ` +
        `They must be different Panchang entries.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      yogfal,
      sfA: sfA_vipal,
      sfB: sfB_vipal
    };
  }

  return { toVipal, fromVipal, formatGPV, validateEntryOrdering };
})();


// ╔═══════════════════════════════════════════════╗
// ║  AGENT 3 — CALCULATION AGENT (Core Engine)   ║
// ╚═══════════════════════════════════════════════╝
const CalculationAgent = (() => {

  /**
   * Compute Lagnspasht.
   * 
   * @param {Object} data — validated input data
   * @returns {Object} — { rashi, ansh, kala, vikla, steps }
   * 
   * ALL arithmetic is in integer Vipal.
   */
  function compute(data) {
    const steps = {};

    // ── STEP 1: Yogfal ──
    const sfVipal = DataAgent.toVipal(data.sariniFal.ghati, data.sariniFal.pal, data.sariniFal.vipal);
    const ikVipal = DataAgent.toVipal(data.ishtkal.ghati, data.ishtkal.pal, data.ishtkal.vipal);
    const yogfal  = sfVipal + ikVipal;

    steps.yogfal = yogfal;
    steps.yogfal_gpv = DataAgent.fromVipal(yogfal);

    // ── STEP 2: Reference Entries (already provided by user) ──
    const sfA = DataAgent.toVipal(data.entryA.sf.ghati, data.entryA.sf.pal, data.entryA.sf.vipal);
    const sfB = DataAgent.toVipal(data.entryB.sf.ghati, data.entryB.sf.pal, data.entryB.sf.vipal);

    steps.sfA = sfA;
    steps.sfB = sfB;

    // ── STEP 3: Ek Jatiya Fal (Difference) ──
    const ekJatiyaFal = sfA - sfB;   // already in Vipal
    steps.ekJatiyaFal = ekJatiyaFal;

    // ── STEP 4: Residual ──
    const residual = yogfal - sfB;    // in Vipal
    steps.residual = residual;

    // ── STEP 5: Kala ──
    // Kala = floor( (Residual × 60) / EkJatiyaFal )
    const kalaProduct   = residual * 60;
    const kala          = Math.floor(kalaProduct / ekJatiyaFal);
    const kalaRemainder = kalaProduct % ekJatiyaFal;

    steps.kalaProduct   = kalaProduct;
    steps.kala          = kala;
    steps.kalaRemainder = kalaRemainder;

    // ── STEP 6: Vikla ──
    // Vikla = floor( (Remainder × 60) / EkJatiyaFal )
    const viklaProduct = kalaRemainder * 60;
    let vikla = Math.floor(viklaProduct / ekJatiyaFal);
    const viklaRemainder = viklaProduct % ekJatiyaFal;

    if (viklaRemainder > (ekJatiyaFal / 2)) {
      vikla = vikla + 1;
    }

    steps.viklaProduct = viklaProduct;
    steps.viklaRemainder = viklaRemainder;
    steps.vikla = vikla;

    // ── STEP 7: Final Result ──
    // Rashi & Ansh come from Entry B
    const rashi = data.entryB.rashi;
    const ansh  = data.entryB.ansh;

    return {
      rashi,
      ansh,
      kala,
      vikla,
      steps
    };
  }

  return { compute };
})();


// ╔═══════════════════════════════════════════════╗
// ║  AGENT 4 — UI AGENT (Rendering & Events)     ║
// ╚═══════════════════════════════════════════════╝
const UIAgent = (() => {

  // ── DOM References ──
  const $ = (id) => document.getElementById(id);

  const inputIds = {
    sariniFal_ghati: 'sf-ghati',
    sariniFal_pal:   'sf-pal',
    sariniFal_vipal: 'sf-vipal',
    ishtkal_ghati:   'ik-ghati',
    ishtkal_pal:     'ik-pal',
    ishtkal_vipal:   'ik-vipal',
    entryA_sf_ghati: 'ea-sf-ghati',
    entryA_sf_pal:   'ea-sf-pal',
    entryA_sf_vipal: 'ea-sf-vipal',
    entryA_rashi:    'ea-rashi',
    entryA_ansh:     'ea-ansh',
    entryB_sf_ghati: 'eb-sf-ghati',
    entryB_sf_pal:   'eb-sf-pal',
    entryB_sf_vipal: 'eb-sf-vipal',
    entryB_rashi:    'eb-rashi',
    entryB_ansh:     'eb-ansh'
  };

  /**
   * Gather raw input values.
   */
  function gatherInputs() {
    const inputs = {};
    for (const [key, id] of Object.entries(inputIds)) {
      inputs[key] = $(id).value;
    }
    return inputs;
  }

  /**
   * Clear all error states from inputs.
   */
  function clearErrors() {
    for (const id of Object.values(inputIds)) {
      $(id).classList.remove('error');
    }
    const errContainer = $('error-container');
    errContainer.classList.remove('visible');
    errContainer.querySelector('.error-message').textContent = '';
  }

  /**
   * Show errors in the error container and mark fields.
   */
  function showErrors(errors) {
    const errContainer = $('error-container');
    errContainer.querySelector('.error-message').innerHTML = errors.map(e => `• ${e}`).join('<br>');
    errContainer.classList.add('visible');

    // Mark specific fields
    for (const err of errors) {
      for (const [key, id] of Object.entries(inputIds)) {
        const label = key.replace(/_/g, ' ');
        if (err.toLowerCase().includes(label.toLowerCase().split(' ').slice(-1)[0])) {
          // Best-effort marking
        }
      }
    }

    // Scroll to error
    errContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Display the result.
   */
  function showResult(result) {
    $('res-rashi').textContent  = result.rashi;
    $('res-ansh').textContent   = result.ansh;
    $('res-kala').textContent   = result.kala;
    $('res-vikla').textContent  = result.vikla;

    const panel = $('result-panel');
    panel.classList.add('visible');

    // Re-trigger animation
    panel.style.animation = 'none';
    panel.offsetHeight; // reflow
    panel.style.animation = '';

    // Build step breakdown
    buildSteps(result.steps, result);

    // Scroll to result
    setTimeout(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  /**
   * Build the step-by-step breakdown.
   */
  function buildSteps(steps, result) {
    const list = $('steps-list');
    list.innerHTML = '';

    const yogGPV = steps.yogfal_gpv;

    const entries = [
      {
        label: 'Step 1 — Yogfal',
        value: `Sarini Fal + Ishtkal = <span class="highlight">${steps.yogfal} Vipal</span> (${yogGPV.ghati} Gh ${yogGPV.pal} Pal ${yogGPV.vipal} Vip)`
      },
      {
        label: 'Step 2 — Reference Entries',
        value: `Entry A Sarini Fal = <span class="highlight">${steps.sfA} Vipal</span> &nbsp;|&nbsp; Entry B = <span class="highlight">${steps.sfB} Vipal</span>`
      },
      {
        label: 'Step 3 — Ek Jatiya Fal (Difference)',
        value: `A − B = ${steps.sfA} − ${steps.sfB} = <span class="highlight">${steps.ekJatiyaFal} Vipal</span>`
      },
      {
        label: 'Step 4 — Residual',
        value: `Yogfal − Entry B = ${steps.yogfal} − ${steps.sfB} = <span class="highlight">${steps.residual} Vipal</span>`
      },
      {
        label: 'Step 5 — Kala Calculation',
        value: `(${steps.residual} × 60) / ${steps.ekJatiyaFal} = ${steps.kalaProduct} / ${steps.ekJatiyaFal} = <span class="highlight">${steps.kala} Kala</span> (remainder ${steps.kalaRemainder})`
      },
      {
        label: 'Step 6 — Vikla Calculation',
        value: `(${steps.kalaRemainder} × 60) / ${steps.ekJatiyaFal} = ${steps.viklaProduct} / ${steps.ekJatiyaFal} = <span class="highlight">${steps.vikla} Vikla</span>`
      },
      {
        label: 'Step 7 — Final Lagnspasht',
        value: `Rashi <span class="highlight">${result.rashi}</span> &nbsp;|&nbsp; Ansh <span class="highlight">${result.ansh}</span> &nbsp;|&nbsp; Kala <span class="highlight">${result.kala}</span> &nbsp;|&nbsp; Vikla <span class="highlight">${result.vikla}</span>`
      }
    ];

    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'step-item';
      li.innerHTML = `<span class="step-label">${entry.label}</span><span class="step-value">${entry.value}</span>`;
      list.appendChild(li);
    }

    $('steps-panel').classList.add('visible');
  }

  /**
   * Toggle step detail visibility.
   */
  function toggleSteps() {
    const list = $('steps-list');
    const btn  = $('steps-toggle');
    if (list.style.display === 'none' || list.style.display === '') {
      list.style.display = 'block';
      btn.textContent = '▲ Hide Calculation Steps';
    } else {
      list.style.display = 'none';
      btn.textContent = '▼ Show Calculation Steps';
    }
  }

  /**
   * Main calculate handler.
   */
  function handleCalculate() {
    clearErrors();

    // Hide previous result
    $('result-panel').classList.remove('visible');
    $('steps-panel').classList.remove('visible');

    // 1. Gather inputs
    const rawInputs = gatherInputs();

    // 2. Validation Agent
    const validation = ValidationAgent.validateAll(rawInputs);
    if (!validation.valid) {
      showErrors(validation.errors);
      return;
    }

    // 3. Data Agent — ordering check
    const ordering = DataAgent.validateEntryOrdering(validation.data);
    if (!ordering.valid) {
      showErrors(ordering.errors);
      return;
    }

    // 4. Calculation Agent — compute
    const result = CalculationAgent.compute(validation.data);

    // 5. UI Agent — render
    showResult(result);
  }

  /**
   * Initialize event listeners.
   */
  function init() {
    $('btn-calculate').addEventListener('click', handleCalculate);
    $('steps-toggle').addEventListener('click', toggleSteps);

    // Auto-advance: when user types 2 digits, move to next field
    const allInputs = Object.values(inputIds).map(id => $(id));
    allInputs.forEach((input, idx) => {
      input.addEventListener('input', () => {
        // Remove error class on edit
        input.classList.remove('error');
        // Auto-advance for 2-digit fields (Pal, Vipal, Rashi, Ansh)
        const maxDigits = input.dataset.maxdigits;
        if (maxDigits && input.value.length >= parseInt(maxDigits)) {
          const nextInput = allInputs[idx + 1];
          if (nextInput) nextInput.focus();
        }
      });

      // Allow Enter key to calculate
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleCalculate();
        }
      });
    });
  }

  return { init };
})();


// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', UIAgent.init);
