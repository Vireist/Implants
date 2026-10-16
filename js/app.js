const state = {
    character: {
        name: "",
        logic: 0,
        willpower: 0,
        budget: 0
    },
    installed: []
};

const data = {
    implants: {},
    slots: [],
    slotsById: {},
    categories: [],
    categoriesById: {},
    rules: []
};

const STORAGE_KEY = "isotope-implant-build-v1";

let selectedSlot = null;
let characterLoaded = false;
let characterSource = "";

document.addEventListener("DOMContentLoaded", init);

async function init() {
    try {
        await loadData();
    } catch (error) {
        document.body.innerHTML = `<pre class="fatal">${escapeHtml(error.message)}</pre>`;
        return;
    }

    if (document.getElementById("body-svg")) {
        initConstructor();

        // Пробуем восстановить сборку из localStorage
        const saved = loadSavedState();
        if (saved) {
            applyPayload(saved, { silent: true });
            characterSource = saved.characterSource || "сохранённая сборка";
            characterLoaded = true;
            hideGate();
        }
    } else if (document.getElementById("catalog-list")) {
        initCatalog();
    }

    renderAll();
}

/* ==============================
   Data loading
   ============================== */

async function loadData() {
    const manifest = await fetchJSON("data/manifest.json");
    data.slots = await fetchJSON("config/slots.json");
    data.categories = await fetchJSON("config/categories.json").catch(() => []);
    const rulesConfig = await fetchJSON("config/rules.json").catch(() => ({ rules: [] }));

    data.rules = Array.isArray(rulesConfig.rules) ? rulesConfig.rules : [];
    data.slotsById = Object.fromEntries(data.slots.map((slot) => [slot.id, slot]));
    data.categoriesById = Object.fromEntries(
        data.categories.map((category) => [category.id, category])
    );

    const implantFiles = manifest.implants || [];

    const implants = await Promise.all(
        implantFiles.map(async (path) => {
            try {
                const text = await fetchText(path);
                return parseImplantMD(text);
            } catch (error) {
                console.warn(`Не удалось загрузить имплант: ${path}`, error);
                return null;
            }
        })
    );

    implants
        .filter(Boolean)
        .forEach((implant) => {
            data.implants[implant.id] = implant;
        });
}

async function fetchJSON(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Не удалось загрузить файл: ${path}`);
    }
    return response.json();
}

async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Не удалось загрузить файл: ${path}`);
    }
    return response.text();
}

function parseImplantMD(text) {
    const match = text
        .trim()
        .match(/^---\s*(json|yaml|yml)?\s*\n?([\s\S]*?)\s*---\s*([\s\S]*)$/i);

    if (!match) {
        throw new Error("Файл должен начинаться с блока --- ... ---");
    }

    const format = (match[1] || "yaml").toLowerCase();
    const raw = match[2].trim();
    const description = match[3].trim();

    let parsed;

    if (format === "json") {
        parsed = JSON.parse(raw);
    } else {
        if (!window.jsyaml) {
            throw new Error(
                "Для чтения YAML подключи библиотеку js-yaml: vendor/js-yaml.min.js или CDN."
            );
        }
        parsed = window.jsyaml.load(raw);
    }

    parsed.description = description;
    return parsed;
}

/* ==============================
   Gate: вход через файл персонажа
   ============================== */

function initGate() {
    byId("gate-file")?.addEventListener("change", onGateFile);
    byId("gate-cancel")?.addEventListener("click", hideGate);
}

function onGateFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    loadCharacterFile(file);
    event.target.value = "";
}

async function loadCharacterFile(file) {
    const errorBox = byId("gate-error");
    const gate = byId("char-gate");

    try {
        const text = await file.text();
        const payload = file.name.endsWith(".md")
            ? parseImplantMD(text)
            : JSON.parse(text);

        if (!payload || typeof payload !== "object" || !payload.character) {
            throw new Error("в файле нет блока character (name, logic, willpower, budget)");
        }

        applyPayload(payload);
        characterSource = file.name;
        characterLoaded = true;

        if (errorBox) errorBox.hidden = true;
        hideGate();
        renderAll();
    } catch (error) {
        // Если гейт открыт — показываем ошибку в нём, иначе alerta
        if (errorBox && gate && !gate.hidden) {
            errorBox.hidden = false;
            errorBox.textContent = `ОШИБКА ЧТЕНИЯ ФАЙЛА: ${error.message}`;
        } else {
            alert(`Ошибка чтения файла: ${error.message}`);
        }
    }
}

function showGate() {
    const gate = byId("char-gate");
    const main = byId("main-content");
    const cancel = byId("gate-cancel");
    const errorBox = byId("gate-error");

    if (errorBox) errorBox.hidden = true;
    if (cancel) cancel.hidden = !characterLoaded;
    if (main) main.hidden = true;
    if (gate) gate.hidden = false;
}

function hideGate() {
    const gate = byId("char-gate");
    const main = byId("main-content");

    if (gate) gate.hidden = true;
    if (main) main.hidden = false;
}

function initDragDrop() {
    const overlay = byId("drop-overlay");

    const hasFiles = (event) =>
        Array.from(event.dataTransfer?.types || []).includes("Files");

    const showOverlay = () => overlay?.classList.add("visible");
    const hideOverlay = () => overlay?.classList.remove("visible");

    window.addEventListener("dragenter", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        showOverlay();
    });

    window.addEventListener("dragover", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
    });

    window.addEventListener("dragleave", (event) => {
        // relatedTarget === null означает, что курсор ушёл за пределы окна
        if (!event.relatedTarget) hideOverlay();
    });

    window.addEventListener("drop", (event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        hideOverlay();

        const file = event.dataTransfer?.files?.[0];
        if (file) loadCharacterFile(file);
    });
}

/* ==============================
   Constructor page
   ============================== */

function initConstructor() {
    initGate();
    initDragDrop();
    bindImportExport();

    data.slots.forEach((slot) => {
        const element = document.getElementById(slot.svg);
        if (element) {
            element.addEventListener("click", () => selectSlot(slot.id));
        }
    });
}

function selectSlot(slotId) {
    selectedSlot = slotId;
    renderAll();
}

function renderAll() {
    if (document.getElementById("body-svg")) {
        renderConstructor();
    }

    if (document.getElementById("catalog-list")) {
        renderCatalog();
    }
}

function renderConstructor() {
    const totals = computeTotals(state.installed);

    renderCharacterPanel();
    renderBody(totals);
    renderSlotButtons(totals);
    renderSlotPanel(totals);
    renderTotalsPanel(totals);
    renderWarningsPanel(totals);
}

function renderCharacterPanel() {
    const panel = byId("character-panel");
    if (!panel) return;

    const c = state.character;

    panel.innerHTML = `
    <h2>Персонаж</h2>

    <div class="hud-readout">
      <div class="readout-row">
        <span>Имя</span><b>${escapeHtml(c.name || "—")}</b>
      </div>
      <div class="readout-row">
        <span>Логика</span><b>${num(c.logic)}</b>
      </div>
      <div class="readout-row">
        <span>Сила воли</span><b>${num(c.willpower)}</b>
      </div>
      <div class="readout-row">
        <span>Бюджет</span><b>${num(c.budget)} ¢</b>
      </div>
      <div class="readout-row">
        <span>Источник</span><b>${escapeHtml(characterSource || "файл")}</b>
      </div>
    </div>

    <div class="actions">
      <button class="action" id="replace-character">Загрузить другой файл</button>
      <button class="action action-danger" id="reset-build">Сбросить сборку</button>
    </div>

    <p class="hint">
      Сборка сохраняется автоматически и восстанавливается при перезагрузке страницы.
      Характеристики редактируются только в файле персонажа.
    </p>
  `;

    byId("replace-character")?.addEventListener("click", showGate);
    byId("reset-build")?.addEventListener("click", resetBuild);
}

function resetBuild() {
    if (!confirm("Сбросить текущую сборку и вернуться к экрану идентификации?")) return;
    clearSavedState();
    state.character = { name: "", logic: 0, willpower: 0, budget: 0 };
    state.installed = [];
    characterSource = "";
    characterLoaded = false;
    showGate();
}

function renderBody(totals) {
    data.slots.forEach((slot) => {
        const element = document.getElementById(slot.svg);
        if (!element) return;

        element.classList.toggle("occupied", totals.slotUsage[slot.id] > 0);
        element.classList.toggle("selected", slot.id === selectedSlot);
    });
}

function renderSlotButtons(totals) {
    const container = byId("slot-buttons");
    if (!container) return;

    container.innerHTML = "";

    data.slots.forEach((slot) => {
        const button = document.createElement("button");
        button.className = "slot-button";
        button.textContent = `${slot.name}: ${totals.slotUsage[slot.id]}/${slot.capacity}`;

        if (slot.id === selectedSlot) {
            button.classList.add("active");
        }

        button.addEventListener("click", () => selectSlot(slot.id));
        container.appendChild(button);
    });
}

function renderSlotPanel(totals) {
    const panel = byId("slot-panel");
    if (!panel) return;

    if (!selectedSlot) {
        panel.innerHTML = `
      <h2>Слот</h2>
      <p class="meta">Кликни по части тела на схеме или по кнопке слота, чтобы увидеть импланты.</p>
    `;
        return;
    }

    const slot = data.slotsById[selectedSlot];
    const used = totals.slotUsage[selectedSlot] || 0;

    const installedHere = state.installed
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => getOccupiedSlots(entry).includes(selectedSlot));

    const availableImplants = Object.values(data.implants)
        .filter((implant) => Array.isArray(implant.slots) && implant.slots.includes(selectedSlot))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));

    const pips = Array.from({ length: slot.capacity }, (_, i) =>
        `<span class="pip ${i < used ? "pip-on" : ""}"></span>`
    ).join("");

    let html = `
    <div class="slot-head">
      <h2>${escapeHtml(slot.name)}</h2>
      <div class="slot-capacity">
        <span class="meta">Занято</span>
        <div class="pips">${pips}</div>
        <b>${used}/${slot.capacity}</b>
      </div>
    </div>
  `;

    html += `<h3>Установлено</h3>`;

    if (!installedHere.length) {
        html += `<p class="meta empty-note">Слот свободен.</p>`;
    } else {
        html += installedHere
            .map(({ entry, index }) => {
                const implant = data.implants[entry.implant];
                const occupied = getOccupiedSlots(entry);
                const isPrimary = entry.slot === selectedSlot;

                const chips = [
                    ...occupied.map((id) => `<span class="chip">${escapeHtml(data.slotsById[id]?.name || id)}</span>`),
                    implant ? `<span class="chip chip-dim">нагрузка ${num(implant.neuralLoad)}</span>` : "",
                    entry.locked ? `<span class="chip badge-locked">🔒 базовый</span>` : ""
                ].filter(Boolean).join("");

                const removeButton = entry.locked
                    ? `<span class="meta lock-note">🔒 база</span>`
                    : `<button class="action action-danger" data-remove="${index}">Удалить</button>`;

                return `
          <div class="installed-item">
            <div class="installed-head">
              <div class="installed-title">
                <span class="name">${escapeHtml(implant?.name || entry.implant)}</span>
                ${!isPrimary ? `<span class="chip chip-dim">занимает слот дополнительно</span>` : ""}
              </div>
              ${removeButton}
            </div>
            <div class="card-tags">${chips}</div>
          </div>
        `;
            })
            .join("");
    }

    html += `<h3>Доступные импланты</h3>`;

    if (!availableImplants.length) {
        html += `<p class="meta empty-note">Для этого слота пока нет имплантов.</p>`;
    } else {
        html += availableImplants
            .map((implant) => {
                const check = canInstall(selectedSlot, implant.id, state.installed);
                const risk = implant.energy?.risk || "";
                const riskClass =
                    risk === "high" ? "risk-high" : risk === "medium" ? "risk-medium" : risk ? "risk-low" : "";
                const bonus = num(implant.capacityBonus);
                const budgetLimited = totals.budget > 0;
                const leftAfter = totals.budgetLeft - num(implant.cost);
                const reqLines = describeRequirements(implant);

                const REQUIREMENT_PREFIXES = [
                    "Требуется ",
                    "Требуются импланты:",
                    "Нужны установленные импланты с тегами:",
                    "Нужны свободные слоты:"
                ];

                const otherReasons = check.reasons.filter(
                    (reason) => !REQUIREMENT_PREFIXES.some((prefix) => reason.startsWith(prefix))
                );

                return `
          <div class="implant-option ${check.ok ? "" : "disabled"}">
            <div class="card-head">
              <div class="card-title">
                <span class="name">${escapeHtml(implant.name)}</span>
                <div class="card-sub">
                  ${escapeHtml(data.categoriesById[implant.category]?.name || implant.category || "-")}
                  · ${escapeHtml(implant.quality || "-")}
                </div>
              </div>
              <div class="card-cost">${num(implant.cost)} ¢</div>
            </div>

            <div class="card-stats">
              <div class="stat"><span>Нагрузка</span><b>${num(implant.neuralLoad)}</b></div>
              <div class="stat"><span>Бонус НЕ</span><b>${bonus > 0 ? "+" + bonus : bonus}</b></div>
              <div class="stat"><span>Сервис/мес</span><b>${num(implant.maintenance)} ¢</b></div>
              <div class="stat ${riskClass}"><span>Риск</span><b>${escapeHtml(risk || "-")}</b></div>
            </div>

            ${
                    reqLines.length
                        ? `
              <div class="requirements-block ${check.ok ? "" : "requirements-unmet"}">
                <div class="requirements-title">Требования</div>
                ${reqLines.map((line) => `<div class="requirements-line">${escapeHtml(line)}</div>`).join("")}
              </div>
            `
                        : ""
                }

            ${
                    !check.ok && otherReasons.length
                        ? `
              <div class="block-reason">
                ${otherReasons.map((reason) => `<div>⚠ ${escapeHtml(reason)}</div>`).join("")}
              </div>
            `
                        : ""
                }

            ${
                    implant.description
                        ? `
              <details class="implant-desc">
                <summary>Описание</summary>
                <div class="description">${mdToHtml(implant.description)}</div>
              </details>
            `
                        : ""
                }

            <div class="option-footer">
              <div class="card-tags">
                ${(implant.tags || [])
                    .slice(0, 4)
                    .map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`)
                    .join("")}
                ${
                    budgetLimited
                        ? `<span class="chip ${leftAfter < 0 ? "chip-danger" : "chip-dim"}">остаток после: ${leftAfter} ¢</span>`
                        : ""
                }
              </div>
              <button
                class="action"
                data-install="${escapeHtml(implant.id)}"
                ${check.ok ? "" : "disabled"}
                title="${escapeHtml(check.reasons.join("\n"))}"
              >Установить</button>
            </div>
          </div>
        `;
            })
            .join("");
    }

    panel.innerHTML = html;

    panel.querySelectorAll("[data-install]").forEach((button) => {
        button.addEventListener("click", () => installImplant(selectedSlot, button.dataset.install));
    });

    panel.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => removeInstalled(Number(button.dataset.remove)));
    });
}


function renderTotalsPanel(totals) {
    const panel = byId("totals-panel");
    if (!panel) return;

    const overload = Math.max(0, totals.overload);
    const loadPct =
        totals.capacity > 0
            ? Math.min(100, Math.round((totals.load / totals.capacity) * 100))
            : 100;
    const budgetLimited = totals.budget > 0;

    panel.innerHTML = `
    <h2>Расчёт</h2>

    <div class="hud-readout">
      <div class="readout-row">
        <span>Нейроемкость</span><b>${totals.capacity}</b>
      </div>
      <div class="readout-row">
        <span>Нагрузка</span><b>${totals.load}</b>
      </div>

      <div class="bar" title="Нагрузка / Нейроемкость">
        <div
          class="bar-fill ${overload > 0 ? "over" : ""}"
          style="width:${loadPct}%"
        ></div>
      </div>

      <div class="readout-row">
        <span>Перегруз</span>
        <b class="${overload > 0 ? "danger" : ""}">${overload}</b>
      </div>
      <div class="readout-row">
        <span>Стоимость</span><b>${totals.cost} ¢</b>
      </div>
      <div class="readout-row">
        <span>Бюджет</span><b>${budgetLimited ? totals.budget + " ¢" : "не указан"}</b>
      </div>
      <div class="readout-row">
        <span>Остаток</span>
        <b class="${budgetLimited && totals.budgetLeft < 0 ? "danger" : ""}">
          ${budgetLimited ? totals.budgetLeft + " ¢" : "—"}
        </b>
      </div>
      <div class="readout-row">
        <span>Обслуживание</span><b>${totals.maintenance} ¢/мес</b>
      </div>
      <div class="readout-row">
        <span>Имплантов</span><b>${state.installed.length}</b>
      </div>
    </div>
  `;
}

function renderWarningsPanel(totals) {
    const panel = byId("warnings-panel");
    if (!panel) return;

    const messages = totals.activeMessages || [];

    if (!messages.length) {
        panel.innerHTML = `
      <h2>Предупреждения</h2>
      <p class="meta">Нет активных предупреждений.</p>
    `;
        return;
    }

    panel.innerHTML = `
    <h2>Предупреждения</h2>
    ${messages
        .map(
            (message) =>
                `<div class="warning-item ${message.severity}">${escapeHtml(message.message)}</div>`
        )
        .join("")}
  `;
}

function installImplant(slotId, implantId) {
    const check = canInstall(slotId, implantId, state.installed);

    if (!check.ok) {
        alert(check.reasons.join("\n"));
        return;
    }

    state.installed.push({ slot: slotId, implant: implantId });
    saveState();
    renderAll();
}

function removeInstalled(index) {
    if (state.installed[index]?.locked) return;
    state.installed.splice(index, 1);
    saveState();
    renderAll();
}

function canInstall(slotId, implantId, entries) {
    const reasons = [];

    const slot = data.slotsById[slotId];
    const implant = data.implants[implantId];

    if (!slot) reasons.push("Неизвестный слот.");
    if (!implant) reasons.push("Неизвестный имплант.");

    if (reasons.length) {
        return { ok: false, reasons };
    }

    if (!Array.isArray(implant.slots) || !implant.slots.includes(slotId)) {
        reasons.push("Имплант нельзя установить в этот слот.");
    }

    const usage = getSlotUsage(entries);
    const occupied = unique([slotId, ...(implant.extraOccupies || [])]);

    occupied.forEach((occupiedSlotId) => {
        const occupiedSlot = data.slotsById[occupiedSlotId];

        if (!occupiedSlot) {
            reasons.push(`Неизвестный занимаемый слот: ${occupiedSlotId}.`);
            return;
        }

        if ((usage[occupiedSlotId] || 0) >= occupiedSlot.capacity) {
            reasons.push(`Не хватает места в слоте: ${occupiedSlot.name}.`);
        }
    });

    const installedCount = entries.filter((entry) => entry.implant === implantId).length;
    if (implant.maxInstallations && installedCount >= implant.maxInstallations) {
        reasons.push(`Можно установить не больше ${implant.maxInstallations}.`);
    }

    const installedImplants = entries
        .map((entry) => data.implants[entry.implant])
        .filter(Boolean);

    installedImplants.forEach((installedImplant) => {
        if (implant.conflicts?.ids?.includes(installedImplant.id)) {
            reasons.push(`Конфликт с имплантом: ${installedImplant.name}.`);
        }
        if (implant.conflicts?.tags?.some((tag) => installedImplant.tags?.includes(tag))) {
            reasons.push(`Конфликт по тегу с имплантом: ${installedImplant.name}.`);
        }
        if (implant.conflicts?.slots?.some((conflictSlot) => occupied.includes(conflictSlot))) {
            reasons.push(`Конфликт по слоту с имплантом: ${installedImplant.name}.`);
        }
    });

    installedImplants.forEach((installedImplant) => {
        if (installedImplant.conflicts?.ids?.includes(implant.id)) {
            reasons.push(`Имплант ${installedImplant.name} конфликтует с новым имплантом.`);
        }
        if (installedImplant.conflicts?.tags?.some((tag) => implant.tags?.includes(tag))) {
            reasons.push(`Имплант ${installedImplant.name} конфликтует с тегом нового импланта.`);
        }
        if (installedImplant.conflicts?.slots?.some((conflictSlot) => occupied.includes(conflictSlot))) {
            reasons.push(`Имплант ${installedImplant.name} конфликтует по слоту.`);
        }
    });

    if (implant.requires) {
        if (implant.requires.ids?.length) {
            const missing = implant.requires.ids.filter(
                (id) => !entries.some((entry) => entry.implant === id)
            );
            if (missing.length) {
                reasons.push(
                    `Требуются импланты: ${missing.map((id) => data.implants[id]?.name || id).join(", ")}.`
                );
            }
        }

        if (implant.requires.tags?.length) {
            const installedTags = new Set(installedImplants.flatMap((item) => item.tags || []));
            const missingTags = implant.requires.tags.filter((tag) => !installedTags.has(tag));
            if (missingTags.length) {
                reasons.push(`Нужны установленные импланты с тегами: ${missingTags.join(", ")}.`);
            }
        }

        if (implant.requires.freeSlots?.length) {
            const busy = implant.requires.freeSlots.filter((freeSlotId) => usage[freeSlotId] > 0);
            if (busy.length) {
                reasons.push(
                    `Нужны свободные слоты: ${busy.map((s) => data.slotsById[s]?.name || s).join(", ")}.`
                );
            }
        }

        if (implant.requires.attributes) {
            Object.entries(implant.requires.attributes).forEach(([attribute, condition]) => {
                const value = Number(state.character[attribute] || 0);
                if (!compare(value, condition)) {
                    reasons.push(`Требуется ${describeCondition(attribute, condition, value)}.`);
                }
            });
        }
    }

    const hypotheticalEntries = [...entries, { slot: slotId, implant: implantId }];
    const totals = computeTotals(hypotheticalEntries);

    totals.activeMessages
        .filter((message) => message.severity === "block")
        .forEach((message) => reasons.push(message.message));

    return { ok: reasons.length === 0, reasons: unique(reasons) };
}

function getOccupiedSlots(entry) {
    const implant = data.implants[entry.implant];
    if (!implant) return [];
    return unique([entry.slot, ...(implant.extraOccupies || [])]);
}

function getSlotUsage(entries) {
    const usage = {};
    data.slots.forEach((slot) => {
        usage[slot.id] = 0;
    });
    entries.forEach((entry) => {
        getOccupiedSlots(entry).forEach((slotId) => {
            if (usage[slotId] !== undefined) {
                usage[slotId] += 1;
            }
        });
    });
    return usage;
}

function computeTotals(entries) {
    let capacity = 10 + num(state.character.logic) + num(state.character.willpower);
    let load = 0;
    let cost = 0;
    let maintenance = 0;
    let capacityBonus = 0;

    entries.forEach((entry) => {
        const implant = data.implants[entry.implant];
        if (!implant) return;

        load += num(implant.neuralLoad);
        capacityBonus += num(implant.capacityBonus);
        cost += num(implant.cost);
        maintenance += num(implant.maintenance);
    });

    capacity += capacityBonus;

    const budget = num(state.character.budget);
    const slotUsage = getSlotUsage(entries);

    let totals = {
        capacity,
        load,
        cost,
        maintenance,
        budget,
        budgetLeft: budget - cost,
        slotUsage,
        overload: Math.max(0, load - capacity)
    };

    let context = createContext(entries, totals);

    let addLoad = 0;
    let addCapacity = 0;

    data.rules
        .filter((rule) => rule.enabled !== false && rule.type === "modifier")
        .forEach((rule) => {
            if (evalCondition(rule.when, context)) {
                addLoad += num(rule.effect?.addLoad);
                addCapacity += num(rule.effect?.addCapacity);
            }
        });

    load += addLoad;
    capacity += addCapacity;

    totals = {
        ...totals,
        capacity,
        load,
        overload: Math.max(0, load - capacity)
    };

    context = createContext(entries, totals);

    const activeMessages = [];

    data.rules
        .filter((rule) => rule.enabled !== false && rule.type !== "modifier")
        .forEach((rule) => {
            if (evalCondition(rule.when, context)) {
                activeMessages.push({
                    id: rule.id,
                    severity: rule.severity || "info",
                    message: rule.message || ""
                });
            }
        });

    totals.activeMessages = activeMessages;

    return totals;
}

function createContext(entries, totals) {
    const implants = entries.map((entry) => data.implants[entry.implant]).filter(Boolean);

    return {
        entries,
        implants,
        installedIds: new Set(implants.map((implant) => implant.id)),
        tags: new Set(implants.flatMap((implant) => implant.tags || [])),
        character: state.character,
        totals
    };
}

function evalCondition(condition, context) {
    if (!condition) return true;
    if (typeof condition !== "object") return false;

    if (Array.isArray(condition)) {
        return condition.every((item) => evalCondition(item, context));
    }

    if (condition.all && !condition.all.every((item) => evalCondition(item, context))) {
        return false;
    }

    if (condition.any && !condition.any.some((item) => evalCondition(item, context))) {
        return false;
    }

    if (condition.not && evalCondition(condition.not, context)) {
        return false;
    }

    if ("installed" in condition && !context.installedIds.has(condition.installed)) {
        return false;
    }

    if ("notInstalled" in condition && context.installedIds.has(condition.notInstalled)) {
        return false;
    }

    if ("installedAny" in condition) {
        const hasAny = context.implants.some((implant) => matchImp(implant, condition.installedAny));
        if (!hasAny) return false;
    }

    if ("installedAll" in condition) {
        const filter = condition.installedAll;

        if (filter.ids && !filter.ids.every((id) => context.installedIds.has(id))) return false;
        if (filter.tags && !filter.tags.every((tag) => context.tags.has(tag))) return false;
        if (filter.quality && !context.implants.some((i) => i.quality === filter.quality)) return false;
        if (
            filter.energyRisk &&
            !context.implants.some((i) => i.energy?.risk === filter.energyRisk)
        ) {
            return false;
        }
    }

    if ("count" in condition) {
        const count = context.implants.filter((implant) => matchImp(implant, condition.count)).length;
        if (!compare(count, condition.count)) return false;
    }

    if ("calc" in condition) {
        for (const [key, operator] of Object.entries(condition.calc)) {
            if (!compare(context.totals[key], operator)) return false;
        }
    }

    if ("character" in condition) {
        for (const [key, operator] of Object.entries(condition.character)) {
            if (!compare(Number(context.character[key] || 0), operator)) return false;
        }
    }

    if ("slotOccupied" in condition && !(context.totals.slotUsage[condition.slotOccupied] > 0)) {
        return false;
    }

    if ("slotFree" in condition && context.totals.slotUsage[condition.slotFree] > 0) {
        return false;
    }

    return true;
}

function matchImp(implant, filter) {
    if (!filter) return true;

    if (filter.ids && !filter.ids.includes(implant.id)) return false;
    if (filter.tags && !filter.tags.some((tag) => implant.tags?.includes(tag))) return false;
    if (filter.quality && implant.quality !== filter.quality) return false;
    if (filter.category && implant.category !== filter.category) return false;
    if (filter.energyRisk && implant.energy?.risk !== filter.energyRisk) return false;
    if (
        filter.subscription !== undefined &&
        Boolean(implant.subscription) !== Boolean(filter.subscription)
    ) {
        return false;
    }

    return true;
}

function compare(value, operators) {
    if (typeof operators !== "object" || operators === null) {
        return value === operators;
    }

    if ("gt" in operators && !(value > operators.gt)) return false;
    if ("gte" in operators && !(value >= operators.gte)) return false;
    if ("lt" in operators && !(value < operators.lt)) return false;
    if ("lte" in operators && !(value <= operators.lte)) return false;
    if ("eq" in operators && value !== operators.eq) return false;

    return true;
}

/* ==============================
   Catalog page
   ============================== */

function initCatalog() {
    const categorySelect = byId("catalog-category");
    const searchInput = byId("catalog-search");

    if (categorySelect) {
        categorySelect.innerHTML = `
      <option value="">Все категории</option>
      ${data.categories
            .map(
                (category) =>
                    `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
            )
            .join("")}
    `;
        categorySelect.addEventListener("change", renderCatalog);
    }

    if (searchInput) {
        searchInput.addEventListener("input", renderCatalog);
    }
}

function renderCatalog() {
    const list = byId("catalog-list");
    if (!list) return;

    const search = (byId("catalog-search")?.value || "").toLowerCase().trim();
    const category = byId("catalog-category")?.value || "";

    const implants = Object.values(data.implants)
        .filter((implant) => !category || implant.category === category)
        .filter((implant) => matchesSearch(implant, search))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));

    if (!implants.length) {
        list.innerHTML = `<div class="panel">Ничего не найдено.</div>`;
        return;
    }

    list.innerHTML = implants.map(renderCatalogCard).join("");
}

function renderCatalogCard(implant) {
    const categoryName =
        data.categoriesById[implant.category]?.name || implant.category || "—";

    const slots =
        (implant.slots || [])
            .map((id) => data.slotsById[id]?.name || id)
            .join(", ") || "—";

    const extra = (implant.extraOccupies || [])
        .map((id) => data.slotsById[id]?.name || id)
        .join(", ");

    const risk = implant.energy?.risk || "";
    const riskClass = risk === "high" ? "risk-high" : risk === "medium" ? "risk-medium" : risk ? "risk-low" : "";

    const reqLines = describeRequirements(implant);
    const requiresText = reqLines.length ? reqLines.join("; ") : "";

    const rows = [
        ["Слоты установки", slots],
        extra ? ["Доп. занимает", extra] : null,
        implant.energy?.type
            ? ["Питание", `${implant.energy.type}${risk ? ` · риск: ${risk}` : ""}`]
            : null,
        implant.subscription ? ["Подписка", "требуется"] : null,
        implant.maxInstallations ? ["Лимит установки", implant.maxInstallations] : null,
        requiresText ? ["Требования", requiresText] : null
    ].filter(Boolean);

    const bonus = num(implant.capacityBonus);

    return `
    <article class="catalog-card">
      <div class="card-head">
        <div class="card-title">
          <h3>${escapeHtml(implant.name)}</h3>
          <div class="card-sub">
            ${escapeHtml(categoryName)} · ${escapeHtml(implant.quality || "—")}
          </div>
        </div>
        <div class="card-cost">${num(implant.cost)} ¢</div>
      </div>

      <div class="card-stats">
        <div class="stat"><span>Нагрузка</span><b>${num(implant.neuralLoad)}</b></div>
        <div class="stat"><span>Бонус НЕ</span><b>${bonus > 0 ? "+" + bonus : bonus}</b></div>
        <div class="stat"><span>Сервис/мес</span><b>${num(implant.maintenance)} ¢</b></div>
        <div class="stat ${riskClass}"><span>Риск</span><b>${escapeHtml(risk || "—")}</b></div>
      </div>

      <div class="card-rows">
        ${rows
        .map(
            ([label, value]) => `
          <div class="card-row">
            <span>${escapeHtml(label)}</span>
            <span>${escapeHtml(String(value))}</span>
          </div>
        `
        )
        .join("")}
      </div>

      ${
        implant.description
            ? `
        <details class="card-desc">
          <summary>Описание</summary>
          <div class="description">${mdToHtml(implant.description)}</div>
        </details>
      `
            : ""
    }

      ${
        (implant.tags || []).length
            ? `
        <div class="card-tags">
          ${implant.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      `
            : ""
    }
    </article>
  `;
}

function matchesSearch(implant, query) {
    if (!query) return true;

    const text = [
        implant.name,
        implant.id,
        implant.category,
        implant.quality,
        implant.description,
        ...(implant.tags || [])
    ]
        .join(" ")
        .toLowerCase();

    return text.includes(query);
}

/* ==============================
   Import / Export
   ============================== */

function bindImportExport() {
    byId("export-file")?.addEventListener("click", exportFile);
    byId("export-code")?.addEventListener("click", exportCode);
    byId("import-code-button")?.addEventListener("click", importCode);
    byId("import-file")?.addEventListener("change", importFile);
}

function getPayload() {
    return {
        schema: "isotope-implant-build",
        version: 1,
        character: state.character,
        installed: state.installed
    };
}

function exportFile() {
    download("isotope-build.json", JSON.stringify(getPayload(), null, 2), "application/json");
}

function exportCode() {
    const code = `ISO1.${toBase64Url(getPayload())}`;

    const textarea = byId("import-code");
    if (textarea) textarea.value = code;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).catch(() => {});
    }
}

async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const payload = file.name.endsWith(".md") ? parseImplantMD(text) : JSON.parse(text);

        applyPayload(payload);
        characterSource = file.name;
        characterLoaded = true;
        renderAll();
    } catch (error) {
        alert(`Ошибка импорта файла: ${error.message}`);
    } finally {
        event.target.value = "";
    }
}

function importCode() {
    const textarea = byId("import-code");
    if (!textarea) return;

    let code = textarea.value.trim();
    if (!code) {
        alert("Вставь код сборки.");
        return;
    }

    if (code.startsWith("ISO1.")) {
        code = code.slice(5);
    }

    try {
        const payload = JSON.parse(fromBase64Url(code));
        applyPayload(payload);
        characterSource = "код сборки ISO1";
        characterLoaded = true;
        renderAll();
    } catch (error) {
        alert(`Ошибка кода сборки: ${error.message}`);
    }
}

function applyPayload(payload, options = {}) {
    if (!payload) return;

    if (payload.character) {
        state.character = {
            name: payload.character.name || "",
            logic: Number(payload.character.logic || 0),
            willpower: Number(payload.character.willpower || 0),
            budget: Number(payload.character.budget || 0)
        };
    }

    if (Array.isArray(payload.installed)) {
        state.installed = payload.installed
            .filter((entry) => data.slotsById[entry.slot] && data.implants[entry.implant])
            .map((entry) => ({
                slot: entry.slot,
                implant: entry.implant,
                locked: Boolean(entry.locked || entry.base)
            }));
    }

    selectedSlot = null;

    if (!options.silent) {
        saveState();
    }
}

function download(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

function toBase64Url(object) {
    const bytes = new TextEncoder().encode(JSON.stringify(object));

    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url) {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
        base64 += "=";
    }

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    return new TextDecoder().decode(bytes);
}

/* ==============================
   Utilities
   ============================== */

function byId(id) {
    return document.getElementById(id);
}

function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function unique(array) {
    return [...new Set(array)];
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function saveState() {
    try {
        const payload = {
            schema: STORAGE_KEY,
            character: state.character,
            installed: state.installed,
            characterSource: characterSource
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn("Не удалось сохранить сборку:", error);
    }
}

function loadSavedState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.schema !== STORAGE_KEY) return null;
        if (!parsed.character || !parsed.character.name) return null;
        return parsed;
    } catch (error) {
        console.warn("Не удалось прочитать сохранённую сборку:", error);
        return null;
    }
}

function clearSavedState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
        // игнорируем
    }
}

function mdToHtml(markdown = "") {
    const escaped = escapeHtml(markdown);
    const lines = escaped.split(/\r?\n/);

    let html = "";
    let inList = false;

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith("- ")) {
            if (!inList) {
                html += "<ul>";
                inList = true;
            }
            html += `<li>${inlineMarkdown(trimmed.slice(2))}</li>`;
            continue;
        }

        if (inList) {
            html += "</ul>";
            inList = false;
        }

        if (/^###\s/.test(trimmed)) {
            html += `<h4>${inlineMarkdown(trimmed.replace(/^###\s/, ""))}</h4>`;
        } else if (/^##\s/.test(trimmed)) {
            html += `<h3>${inlineMarkdown(trimmed.replace(/^##\s/, ""))}</h3>`;
        } else if (/^#\s/.test(trimmed)) {
            html += `<h2>${inlineMarkdown(trimmed.replace(/^#\s/, ""))}</h2>`;
        } else if (!trimmed) {
            continue;
        } else {
            html += `<p>${inlineMarkdown(trimmed)}</p>`;
        }
    }

    if (inList) html += "</ul>";

    return html;
}

function inlineMarkdown(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`(.*?)`/g, "<code>$1</code>");
}

const ATTRIBUTE_NAMES = {
    logic: "Логика",
    willpower: "Сила воли",
    budget: "Бюджет"
};

function describeCondition(attribute, condition, currentValue) {
    const name = ATTRIBUTE_NAMES[attribute] || attribute;

    if (typeof condition !== "object" || condition === null) {
        return `${name} = ${condition}`;
    }

    const parts = [];
    if ("gte" in condition) parts.push(`не ниже ${condition.gte}`);
    if ("gt" in condition) parts.push(`больше ${condition.gt}`);
    if ("lte" in condition) parts.push(`не выше ${condition.lte}`);
    if ("lt" in condition) parts.push(`меньше ${condition.lt}`);
    if ("eq" in condition) parts.push(`ровно ${condition.eq}`);

    const current = currentValue !== undefined ? ` (сейчас ${currentValue})` : "";
    return `${name} ${parts.join(" и ")}${current}`;
}

function describeRequirements(implant) {
    const lines = [];
    const requires = implant.requires;
    if (!requires) return lines;

    if (requires.ids?.length) {
        lines.push(`импланты: ${requires.ids.map((id) => data.implants[id]?.name || id).join(", ")}`);
    }
    if (requires.tags?.length) {
        lines.push(`теги: ${requires.tags.join(", ")}`);
    }
    if (requires.freeSlots?.length) {
        lines.push(
            `свободные слоты: ${requires.freeSlots.map((s) => data.slotsById[s]?.name || s).join(", ")}`
        );
    }
    if (requires.attributes) {
        Object.entries(requires.attributes).forEach(([attribute, condition]) => {
            lines.push(describeCondition(attribute, condition, Number(state.character[attribute] || 0)));
        });
    }
    return lines;
}