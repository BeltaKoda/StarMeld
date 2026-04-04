/**
 * StarMeld — Main application controller.
 * Wires the UI to the INI parser, category DB, and merge engine.
 */

import { parseIni, serializeIni, readFileAsText, downloadIni } from './ini-parser.js';
import { CategoryDB } from './categories.js';
import { MergeEngine } from './merge-engine.js';
import { STOCK_SOURCE, LANGUAGE_PACK_SOURCES } from './sources.js';

class StarMeldApp {
    constructor() {
        this.categoryDB = new CategoryDB();
        this.mergeEngine = null;
        this.stockLoaded = false;
        this.stockMode = 'github';
        this.customPacks = new Map();
        this.enabledSources = new Set();
        this.categorySelections = new Map();
        this.priorityOrder = [];
        this.mergeMode = 'category';
        this.categoryDbData = null;
        this.userCustomisations = new Map();
        this.userCustomisationsId = 'user-customisations';
        this.customiserGroupFilter = null;
        this.customiserCategoryFilter = null;
    }

    async init() {
        await this.categoryDB.load();
        this.mergeEngine = new MergeEngine(this.categoryDB);
        this.bindEvents();
        this.renderPackList();
        this.loadStockFromGitHub();
        this.loadCategoryDb();
        this.renderCustomiserFilters();
        this.restoreCustomisations();
    }

    bindEvents() {
        // Stock source toggle
        document.getElementById('stock-github').addEventListener('change', () => {
            this.stockMode = 'github';
            document.getElementById('stock-upload-area').style.display = 'none';
            document.getElementById('stock-option-github').classList.add('active');
            document.getElementById('stock-option-custom').classList.remove('active');
            this.loadStockFromGitHub();
        });

        document.getElementById('stock-custom').addEventListener('change', () => {
            this.stockMode = 'custom';
            document.getElementById('stock-upload-area').style.display = 'block';
            document.getElementById('stock-option-custom').classList.add('active');
            document.getElementById('stock-option-github').classList.remove('active');
        });

        document.getElementById('stock-file-input').addEventListener('change', (e) => {
            if (e.target.files.length) this.loadStockFromFile(e.target.files[0]);
        });

        document.getElementById('stock-upload-btn').addEventListener('click', () => {
            document.getElementById('stock-file-input').click();
        });

        // Custom pack upload
        document.getElementById('custom-pack-input').addEventListener('change', (e) => {
            for (const file of e.target.files) {
                this.loadCustomPack(file);
            }
            e.target.value = '';
        });

        document.getElementById('custom-upload-btn').addEventListener('click', () => {
            document.getElementById('custom-pack-input').click();
        });

        // Suggest language pack button
        document.getElementById('suggest-pack-btn').addEventListener('click', () => {
            const title = encodeURIComponent('Suggest a language pack');
            const body = encodeURIComponent(
                `**Pack name:** \n**GitHub URL or download link:** \n**What does this pack do?** \n\n**Why should it be added to StarMeld?** \n`
            );
            window.open(`https://github.com/BeltaKoda/StarMeld/issues/new?title=${title}&body=${body}&labels=suggest-source`, '_blank');
        });

        // Merge buttons — show confirmation modal instead of downloading
        document.getElementById('merge-btn').addEventListener('click', () => {
            this.mergeMode = 'category';
            this.showDownloadModal();
        });
        document.getElementById('priority-merge-btn').addEventListener('click', () => {
            this.mergeMode = 'priority';
            this.showDownloadModal();
        });

        // Modal buttons
        document.getElementById('modal-confirm-btn').addEventListener('click', () => {
            this.hideDownloadModal();
            this.doMerge();
        });
        document.getElementById('modal-cancel-btn').addEventListener('click', () => this.hideDownloadModal());
        document.getElementById('download-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.hideDownloadModal();
        });

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

                // Refresh tab-specific content when switching
                if (btn.dataset.tab === 'compare') {
                    this.renderComparePackSelector();
                }
                if (btn.dataset.tab === 'priority') {
                    this.renderPriorityList();
                    this.updatePriorityStats();
                }
                if (btn.dataset.tab === 'customiser') {
                    this.renderMyCustomisations();
                }
            });
        });

        // Category browser search
        const dbSearchInput = document.getElementById('db-search-input');
        let dbSearchTimeout;
        dbSearchInput.addEventListener('input', () => {
            clearTimeout(dbSearchTimeout);
            dbSearchTimeout = setTimeout(() => this.searchCategoryDb(dbSearchInput.value), 200);
        });

        // Compare tab search
        const compareSearchInput = document.getElementById('compare-search-input');
        let compareSearchTimeout;
        compareSearchInput.addEventListener('input', () => {
            clearTimeout(compareSearchTimeout);
            compareSearchTimeout = setTimeout(() => this.searchCompare(compareSearchInput.value), 200);
        });

        // Customiser tab search
        const customiserSearchInput = document.getElementById('customiser-search-input');
        let customiserSearchTimeout;
        customiserSearchInput.addEventListener('input', () => {
            clearTimeout(customiserSearchTimeout);
            customiserSearchTimeout = setTimeout(() => this.searchCustomiser(customiserSearchInput.value), 200);
        });

        // Customiser persistence checkbox
        document.getElementById('customiser-persist').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.saveCustomisationsToStorage();
            } else {
                localStorage.removeItem('starmeld-user-customisations');
                localStorage.removeItem('starmeld-customiser-persist');
            }
            localStorage.setItem('starmeld-customiser-persist', e.target.checked ? 'true' : '');
        });

        // Customiser export/import/clear
        document.getElementById('customiser-export-btn').addEventListener('click', () => this.exportCustomisations());
        document.getElementById('customiser-import-btn').addEventListener('click', () => {
            document.getElementById('customiser-import-input').click();
        });
        document.getElementById('customiser-import-input').addEventListener('change', (e) => {
            if (e.target.files.length) this.importCustomisations(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('customiser-clear-btn').addEventListener('click', () => this.clearCustomisations());
    }

    // --- File Age ---

    async fetchFileAge(source) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${source.repo}/commits?path=${source.path}&per_page=1`
            );
            if (!response.ok) return null;
            const commits = await response.json();
            if (!commits.length) return null;
            return this.formatRelativeAge(new Date(commits[0].commit.committer.date));
        } catch {
            return null;
        }
    }

    formatRelativeAge(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = date.getDate();
        const suffix = day === 1 || day === 21 || day === 31 ? 'st'
                     : day === 2 || day === 22 ? 'nd'
                     : day === 3 || day === 23 ? 'rd' : 'th';
        const dateStr = `${months[date.getMonth()]} ${day}${suffix}`;

        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        let relative;
        if (seconds < 86400) relative = 'today';
        else {
            const days = Math.floor(seconds / 86400);
            if (days === 1) relative = '1 day ago';
            else if (days < 14) relative = `${days} days ago`;
            else {
                const weeks = Math.floor(days / 7);
                if (weeks === 1) relative = '1 week ago';
                else if (days < 60) relative = `${weeks} weeks ago`;
                else {
                    const mos = Math.floor(days / 30);
                    if (mos === 1) relative = '1 month ago';
                    else if (days < 365) relative = `${mos} months ago`;
                    else {
                        const years = Math.floor(days / 365);
                        relative = years === 1 ? '1 year ago' : `${years} years ago`;
                    }
                }
            }
        }

        return relative === 'today'
            ? `Last updated ${dateStr}, today`
            : `Last updated ${dateStr}, ${relative}`;
    }

    // --- Stock Loading ---

    async loadStockFromGitHub() {
        this.setStockStatus('loading', 'Fetching stock from GitHub...');
        try {
            const [response, age] = await Promise.all([
                fetch(STOCK_SOURCE.url),
                this.fetchFileAge(STOCK_SOURCE)
            ]);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const data = parseIni(text);
            this.mergeEngine.setStock(data);
            this.stockLoaded = true;
            const ageStr = age ? ` — ${age}` : '';
            this.setStockStatus('loaded', `Stock loaded: ${data.size.toLocaleString()} keys${ageStr}`);
            this.refreshAll();
        } catch (err) {
            this.setStockStatus('error', `Failed to load stock: ${err.message}`);
            this.stockLoaded = false;
        }
    }

    async loadStockFromFile(file) {
        this.setStockStatus('loading', 'Reading file...');
        try {
            const text = await readFileAsText(file);
            const data = parseIni(text);
            this.mergeEngine.setStock(data);
            this.stockLoaded = true;
            this.setStockStatus('loaded', `Stock loaded: ${data.size.toLocaleString()} keys (${file.name})`);
            this.refreshAll();
        } catch (err) {
            this.setStockStatus('error', `Failed to read file: ${err.message}`);
            this.stockLoaded = false;
        }
    }

    setStockStatus(state, message) {
        const el = document.getElementById('stock-status');
        el.className = `status status-${state}`;
        el.innerHTML = state === 'loading'
            ? `<span class="spinner"></span>${message}`
            : message;
    }

    // --- Language Pack Management ---

    /**
     * Get source definition by ID (for looking up repo/url).
     */
    getSourceDef(sourceId) {
        return LANGUAGE_PACK_SOURCES.find(s => s.id === sourceId) || null;
    }

    renderPackList() {
        const container = document.getElementById('github-packs');
        container.innerHTML = '';

        for (const source of LANGUAGE_PACK_SOURCES) {
            const repoUrl = `https://github.com/${source.repo}`;
            const card = document.createElement('div');
            card.className = 'pack-card';
            card.id = `pack-${source.id}`;
            card.innerHTML = `
                <input type="checkbox" id="check-${source.id}" ${source.defaultEnabled ? 'checked' : ''}>
                <div class="pack-info">
                    <div class="pack-name">${source.name}</div>
                    <div class="pack-desc">${source.description}</div>
                    <div class="pack-links">
                        <a href="${repoUrl}" target="_blank">GitHub Repo</a>
                        <a href="${source.url}" target="_blank">View INI File</a>
                    </div>
                    <div class="pack-stats" id="stats-${source.id}"></div>
                    <div class="pack-status" id="status-${source.id}"></div>
                    <div id="actions-${source.id}"></div>
                </div>
            `;
            container.appendChild(card);

            const checkbox = card.querySelector(`#check-${source.id}`);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    card.classList.add('enabled');
                    this.enableSource(source);
                } else {
                    card.classList.remove('enabled');
                    this.disableSource(source);
                }
            });

            if (source.defaultEnabled) {
                card.classList.add('enabled');
                this.enableSource(source);
            }
        }
    }

    async enableSource(source) {
        this.enabledSources.add(source.id);
        const statusEl = document.getElementById(`status-${source.id}`);
        const statsEl = document.getElementById(`stats-${source.id}`);
        const actionsEl = document.getElementById(`actions-${source.id}`);

        statusEl.innerHTML = '<span class="status status-loading"><span class="spinner"></span>Fetching...</span>';

        try {
            const [response, age] = await Promise.all([
                fetch(source.url),
                this.fetchFileAge(source)
            ]);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const data = parseIni(text);

            this.mergeEngine.addImport(source.id, data);
            const ageStr = age ? ` — ${age}` : '';
            statusEl.innerHTML = `<span class="status status-loaded">Loaded${ageStr}</span>`;

            if (this.stockLoaded) {
                const diff = this.mergeEngine.getCategoryDiff(source.id);
                let modifiedCategories = 0;
                let modifiedKeys = 0;
                for (const [, stats] of diff) {
                    if (stats.modified > 0) {
                        modifiedCategories++;
                        modifiedKeys += stats.modified;
                    }
                }
                statsEl.textContent = `${modifiedKeys.toLocaleString()} keys differ across ${modifiedCategories} categories`;

                // Auto-generate description from modified groups
                this._updatePackDescription(source.id);
            }

            // Add "Set as Default" button
            actionsEl.innerHTML = '';
            const defaultBtn = document.createElement('button');
            defaultBtn.className = 'set-default-btn';
            defaultBtn.textContent = 'Set as Default for All Categories';
            defaultBtn.addEventListener('click', () => this.setAllToSource(source.id));
            actionsEl.appendChild(defaultBtn);

            if (!this.priorityOrder.includes(source.id)) {
                this.priorityOrder.push(source.id);
            }

            this.renderCategoryTree();
            this.updateMergeButton();
            this.renderPriorityList();
            this.updatePriorityStats();
            this.updatePriorityMergeButton();
        } catch (err) {
            statusEl.innerHTML = `<span class="status status-error">Error: ${err.message}</span>`;
            this.enabledSources.delete(source.id);
        }
    }

    _updatePackDescription(sourceId) {
        const descEl = document.querySelector(`#pack-${sourceId} .pack-desc`);
        if (!descEl) return;

        const importData = this.mergeEngine.imports.get(sourceId);
        if (!importData || !this.mergeEngine.stock) return;

        const sharedGroups = this.categoryDB.getSharedGroupNames();
        const groupCounts = new Map();

        for (const [key, value] of importData) {
            const stockValue = this.mergeEngine.stock.get(key);
            if (stockValue === undefined || stockValue === value) continue;

            const category = this.categoryDB.classify(key);
            const group = this.categoryDB.getGroup(category) || 'Other';
            const root = this.categoryDB.getRoot(category);

            let displayGroup = group;
            if (sharedGroups.has(group)) {
                if (root === 'Names & Labels') displayGroup += ' Names';
                else if (root === 'Descriptions & Text') displayGroup += ' Descriptions';
            }

            groupCounts.set(displayGroup, (groupCounts.get(displayGroup) || 0) + 1);
        }

        const sorted = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
        const summary = sorted.map(([g]) => g).join(', ');
        descEl.textContent = summary || 'No modifications detected';
    }

    disableSource(source) {
        this.enabledSources.delete(source.id);
        this.mergeEngine.removeImport(source.id);
        document.getElementById(`stats-${source.id}`).textContent = '';
        document.getElementById(`status-${source.id}`).innerHTML = '';
        document.getElementById(`actions-${source.id}`).innerHTML = '';

        // Restore static description
        const descEl = document.querySelector(`#pack-${source.id} .pack-desc`);
        if (descEl) descEl.textContent = source.description;

        for (const [cat, src] of this.categorySelections) {
            if (src === source.id) this.categorySelections.delete(cat);
        }
        this.priorityOrder = this.priorityOrder.filter(id => id !== source.id);

        this.renderCategoryTree();
        this.updateMergeButton();
        this.renderPriorityList();
        this.updatePriorityStats();
        this.updatePriorityMergeButton();
    }

    /**
     * Set ALL categories to a given source (where it has modifications).
     */
    setAllToSource(sourceId) {
        if (!this.stockLoaded) return;
        const allDiffs = this.mergeEngine.getAllCategoryDiffs();
        const groups = this.categoryDB.getFlatGroups();

        for (const group of groups) {
            this._setGroupCategorySelections(group.categories, sourceId, allDiffs);
        }

        this.renderCategoryTree();
        this.updateMergeButton();
    }

    async loadCustomPack(file) {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        try {
            const text = await readFileAsText(file);
            const data = parseIni(text);
            this.mergeEngine.addImport(id, data);
            this.customPacks.set(id, { name: file.name, data });
            this.enabledSources.add(id);
            this.priorityOrder.push(id);
            this.renderCustomPacks();
            this.renderCategoryTree();
            this.updateMergeButton();
            this.renderPriorityList();
            this.updatePriorityStats();
            this.updatePriorityMergeButton();
        } catch (err) {
            console.error('Failed to load custom pack:', err);
        }
    }

    removeCustomPack(id) {
        this.mergeEngine.removeImport(id);
        this.customPacks.delete(id);
        this.enabledSources.delete(id);
        this.priorityOrder = this.priorityOrder.filter(pid => pid !== id);

        for (const [cat, src] of this.categorySelections) {
            if (src === id) this.categorySelections.delete(cat);
        }

        this.renderCustomPacks();
        this.renderCategoryTree();
        this.updateMergeButton();
    }

    renderCustomPacks() {
        const container = document.getElementById('custom-packs');
        container.innerHTML = '';

        for (const [id, pack] of this.customPacks) {
            let statsText = '';
            if (this.stockLoaded) {
                const diff = this.mergeEngine.getCategoryDiff(id);
                let modifiedKeys = 0;
                let modifiedCategories = 0;
                for (const [, stats] of diff) {
                    if (stats.modified > 0) {
                        modifiedCategories++;
                        modifiedKeys += stats.modified;
                    }
                }
                statsText = `${modifiedKeys.toLocaleString()} keys differ across ${modifiedCategories} categories`;
            }

            const card = document.createElement('div');
            card.className = 'custom-pack-card';
            card.innerHTML = `
                <div class="pack-info">
                    <div class="pack-name">${pack.name}</div>
                    <div class="pack-stats">${statsText}</div>
                </div>
                <button class="set-default-btn" data-id="${id}">Set as Default</button>
                <button class="remove-btn" data-id="${id}">Remove</button>
            `;

            card.querySelector('.remove-btn').addEventListener('click', () => {
                this.removeCustomPack(id);
            });
            card.querySelector('.set-default-btn').addEventListener('click', () => {
                this.setAllToSource(id);
            });

            container.appendChild(card);
        }
    }

    // --- Category Tree ---

    getSourceDisplayName(sourceId) {
        for (const s of LANGUAGE_PACK_SOURCES) {
            if (s.id === sourceId) return s.name;
        }
        const custom = this.customPacks.get(sourceId);
        if (custom) return custom.name;
        return sourceId;
    }

    _setGroupCategorySelections(categories, sourceId, allDiffs) {
        for (const cat of categories) {
            if (sourceId) {
                let hasModifications = false;
                for (const [srcName, diffs] of allDiffs) {
                    if (srcName === sourceId) {
                        const catDiff = diffs.get(cat.name);
                        if (catDiff && catDiff.modified > 0) {
                            hasModifications = true;
                            break;
                        }
                    }
                }
                if (hasModifications) {
                    this.categorySelections.set(cat.name, sourceId);
                }
            } else {
                this.categorySelections.delete(cat.name);
            }
        }
    }

    _renderGroup(group, allDiffs, displayName) {
        let groupHasModifications = false;
        let groupModifiedCount = 0;

        const groupSourcesMap = new Map();
        for (const cat of group.categories) {
            for (const [sourceName, diffs] of allDiffs) {
                const catDiff = diffs.get(cat.name);
                if (catDiff && catDiff.modified > 0) {
                    groupHasModifications = true;
                    groupModifiedCount += catDiff.modified;
                    groupSourcesMap.set(sourceName,
                        (groupSourcesMap.get(sourceName) || 0) + catDiff.modified);
                }
            }
        }

        const groupEl = document.createElement('div');
        groupEl.className = 'category-group';

        const headerEl = document.createElement('div');
        headerEl.className = 'group-header' + (groupHasModifications ? ' expanded' : '');

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'arrow';
        arrowSpan.textContent = '\u25B6';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'group-name';
        nameSpan.textContent = displayName || group.name;

        const statsSpan = document.createElement('span');
        statsSpan.className = 'group-stats';
        statsSpan.textContent = groupHasModifications
            ? groupModifiedCount.toLocaleString() + ' modified'
            : 'no changes';

        headerEl.appendChild(arrowSpan);
        headerEl.appendChild(nameSpan);
        headerEl.appendChild(statsSpan);

        if (groupHasModifications) {
            const groupSourceEl = document.createElement('div');
            groupSourceEl.className = 'group-source';
            const groupSelect = document.createElement('select');
            groupSelect.innerHTML = '<option value="">Stock (default)</option>';

            for (const [srcId, count] of groupSourcesMap) {
                const displayName = this.getSourceDisplayName(srcId);
                groupSelect.innerHTML += `<option value="${srcId}">${displayName} (${count})</option>`;
            }

            const modifiableCats = group.categories.filter(cat => {
                for (const [, diffs] of allDiffs) {
                    const catDiff = diffs.get(cat.name);
                    if (catDiff && catDiff.modified > 0) return true;
                }
                return false;
            });
            if (modifiableCats.length > 0) {
                const selections = modifiableCats.map(cat => this.categorySelections.get(cat.name) || '');
                if (selections.every(s => s && s === selections[0])) {
                    groupSelect.value = selections[0];
                }
            }

            groupSelect.addEventListener('click', (e) => e.stopPropagation());

            groupSelect.addEventListener('change', () => {
                this._setGroupCategorySelections(group.categories, groupSelect.value || '', allDiffs);
                this.renderCategoryTree();
                this.updateMergeButton();
            });

            groupSourceEl.appendChild(groupSelect);
            headerEl.appendChild(groupSourceEl);
        }

        const categoriesEl = document.createElement('div');
        categoriesEl.className = 'group-categories' + (groupHasModifications ? ' expanded' : '');

        headerEl.addEventListener('click', (e) => {
            if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
            headerEl.classList.toggle('expanded');
            categoriesEl.classList.toggle('expanded');
        });

        for (const cat of group.categories) {
            const sourcesWithMods = [];
            let totalMods = 0;

            for (const [sourceName, diffs] of allDiffs) {
                const catDiff = diffs.get(cat.name);
                if (catDiff && catDiff.modified > 0) {
                    sourcesWithMods.push({ id: sourceName, count: catDiff.modified });
                    totalMods += catDiff.modified;
                }
            }

            const row = document.createElement('div');
            row.className = 'category-row';

            const nameEl = document.createElement('div');
            nameEl.className = 'category-name';
            nameEl.textContent = cat.name;
            nameEl.title = cat.description;

            const modEl = document.createElement('div');
            modEl.className = 'category-modified' + (totalMods === 0 ? ' none' : '');
            modEl.textContent = totalMods > 0
                ? `${totalMods} ${totalMods === 1 ? 'key' : 'keys'}`
                : 'no changes';

            const sourceEl = document.createElement('div');
            sourceEl.className = 'category-source';

            if (sourcesWithMods.length > 0) {
                const select = document.createElement('select');
                select.innerHTML = '<option value="">Stock (default)</option>';
                for (const s of sourcesWithMods) {
                    const displayName = this.getSourceDisplayName(s.id);
                    select.innerHTML += `<option value="${s.id}">${displayName} (${s.count})</option>`;
                }

                const prevSelection = this.categorySelections.get(cat.name);
                if (prevSelection && sourcesWithMods.some(s => s.id === prevSelection)) {
                    select.value = prevSelection;
                }

                select.addEventListener('change', () => {
                    if (select.value) {
                        this.categorySelections.set(cat.name, select.value);
                    } else {
                        this.categorySelections.delete(cat.name);
                    }
                    this.updateMergeButton();
                });

                sourceEl.appendChild(select);
            } else {
                const select = document.createElement('select');
                select.disabled = true;
                select.innerHTML = '<option>Stock (no changes available)</option>';
                sourceEl.appendChild(select);
            }

            row.appendChild(nameEl);
            row.appendChild(modEl);
            row.appendChild(sourceEl);
            categoriesEl.appendChild(row);
        }

        groupEl.appendChild(headerEl);
        groupEl.appendChild(categoriesEl);
        return groupEl;
    }

    renderCategoryTree() {
        const container = document.getElementById('category-tree');

        if (!this.stockLoaded || this.enabledSources.size === 0) {
            container.innerHTML = '<div class="category-empty">Load a stock file and enable at least one language pack to see categories.</div>';
            return;
        }

        const allDiffs = this.mergeEngine.getAllCategoryDiffs();
        const hierarchy = this.categoryDB.getHierarchy();
        const sharedGroups = this.categoryDB.getSharedGroupNames();

        container.innerHTML = '';

        for (const { root, groups } of hierarchy) {
            const rootEl = document.createElement('div');
            rootEl.className = 'category-root';

            const rootHeader = document.createElement('div');
            rootHeader.className = 'root-header';

            const rootArrow = document.createElement('span');
            rootArrow.className = 'arrow';
            rootArrow.textContent = '\u25B6';

            const rootName = document.createElement('span');
            rootName.className = 'root-name';
            rootName.textContent = root;

            rootHeader.appendChild(rootArrow);
            rootHeader.appendChild(rootName);

            const rootBody = document.createElement('div');
            rootBody.className = 'root-body expanded';

            rootHeader.addEventListener('click', () => {
                rootHeader.classList.toggle('expanded');
                rootBody.classList.toggle('expanded');
            });
            rootHeader.classList.add('expanded');

            for (const group of groups) {
                let groupDisplayName = group.name;
                if (sharedGroups.has(group.name)) {
                    if (root === 'Names & Labels') groupDisplayName += ' Names';
                    else if (root === 'Descriptions & Text') groupDisplayName += ' Descriptions';
                }
                rootBody.appendChild(this._renderGroup(group, allDiffs, groupDisplayName));
            }

            rootEl.appendChild(rootHeader);
            rootEl.appendChild(rootBody);
            container.appendChild(rootEl);
        }
    }

    // --- Download Modal ---

    showDownloadModal() {
        if (!this.stockLoaded) return;

        let usedSourceIds;
        if (this.mergeMode === 'priority') {
            if (this.priorityOrder.length === 0) return;
            usedSourceIds = new Set(this.priorityOrder);
        } else {
            if (this.categorySelections.size === 0) return;
            usedSourceIds = new Set(this.categorySelections.values());
        }

        const list = document.getElementById('modal-source-list');
        list.innerHTML = '';

        for (const sourceId of usedSourceIds) {
            const li = document.createElement('li');
            const sourceDef = this.getSourceDef(sourceId);

            if (sourceDef) {
                const repoUrl = `https://github.com/${sourceDef.repo}`;
                li.innerHTML = `
                    <span class="source-label">${sourceDef.name}</span>
                    <a href="${repoUrl}" target="_blank">GitHub Repo</a>
                    <a href="${sourceDef.url}" target="_blank">View INI File</a>
                `;
            } else {
                const custom = this.customPacks.get(sourceId);
                const name = custom ? custom.name : sourceId;
                const origin = sourceId === this.userCustomisationsId
                    ? '(from the Customizer tab)'
                    : '(uploaded from your computer)';
                li.innerHTML = `<span class="source-label">${this.escapeHtml(name)}</span> ${origin}`;
            }

            list.appendChild(li);
        }

        document.getElementById('download-modal').classList.add('visible');
    }

    hideDownloadModal() {
        document.getElementById('download-modal').classList.remove('visible');
    }

    // --- Merge ---

    updateMergeButton() {
        const btn = document.getElementById('merge-btn');
        const summary = document.getElementById('merge-summary');

        const selectedCount = this.categorySelections.size;
        btn.disabled = !this.stockLoaded || selectedCount === 0;

        if (selectedCount === 0) {
            summary.innerHTML = 'Select categories from language packs to merge.';
        } else {
            const sourceNames = new Set(this.categorySelections.values());
            summary.innerHTML = `<strong>${selectedCount}</strong> ${selectedCount === 1 ? 'category' : 'categories'} selected from <strong>${sourceNames.size}</strong> ${sourceNames.size === 1 ? 'pack' : 'packs'}`;
        }
    }

    doMerge() {
        if (!this.stockLoaded) return;

        if (this.mergeMode === 'priority') {
            if (this.priorityOrder.length === 0) return;
            const { merged, stats } = this.mergeEngine.mergePriority(this.priorityOrder);
            const content = serializeIni(merged);
            downloadIni(content, 'global.ini');

            const summary = document.getElementById('priority-merge-summary');
            summary.innerHTML = `Downloaded! <strong>${stats.overriddenKeys.toLocaleString()}</strong> keys overridden from <strong>${stats.perSource.length}</strong> ${stats.perSource.length === 1 ? 'pack' : 'packs'} (${stats.totalKeys.toLocaleString()} total keys)`;
        } else {
            if (this.categorySelections.size === 0) return;
            const { merged, stats } = this.mergeEngine.merge(this.categorySelections);
            const content = serializeIni(merged);
            downloadIni(content, 'global.ini');

            const summary = document.getElementById('merge-summary');
            summary.innerHTML = `Downloaded! <strong>${stats.overriddenKeys.toLocaleString()}</strong> keys overridden across <strong>${stats.categoriesOverridden}</strong> categories (${stats.totalKeys.toLocaleString()} total keys)`;
        }
    }

    // --- Priority Merge ---

    renderPriorityList() {
        const container = document.getElementById('priority-list');
        if (!container) return;

        // Filter out any sources no longer enabled
        this.priorityOrder = this.priorityOrder.filter(id => this.enabledSources.has(id));

        if (this.priorityOrder.length === 0) {
            container.innerHTML = '<div class="category-empty">Enable at least one language pack above to set priorities.</div>';
            return;
        }

        container.innerHTML = '';

        this.priorityOrder.forEach((sourceId, index) => {
            const sourceDef = this.getSourceDef(sourceId);
            const custom = this.customPacks.get(sourceId);
            const name = sourceDef ? sourceDef.name : (custom ? custom.name : sourceId);
            const desc = sourceDef ? sourceDef.description : 'Custom upload';

            const item = document.createElement('div');
            item.className = 'priority-item';
            item.innerHTML = `
                <span class="priority-number">${index + 1}</span>
                <span class="priority-name">${this.escapeHtml(name)}</span>
                <span class="priority-desc">${this.escapeHtml(desc)}</span>
                <div class="priority-arrows"></div>
            `;

            const arrows = item.querySelector('.priority-arrows');

            const upBtn = document.createElement('button');
            upBtn.textContent = '\u25B2';
            upBtn.title = 'Move up (higher priority)';
            upBtn.disabled = index === 0;
            upBtn.addEventListener('click', () => this.movePriority(index, -1));
            arrows.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.textContent = '\u25BC';
            downBtn.title = 'Move down (lower priority)';
            downBtn.disabled = index === this.priorityOrder.length - 1;
            downBtn.addEventListener('click', () => this.movePriority(index, 1));
            arrows.appendChild(downBtn);

            container.appendChild(item);
        });
    }

    movePriority(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.priorityOrder.length) return;

        const temp = this.priorityOrder[index];
        this.priorityOrder[index] = this.priorityOrder[newIndex];
        this.priorityOrder[newIndex] = temp;

        this.renderPriorityList();
        this.updatePriorityStats();
        this.updatePriorityMergeButton();
    }

    /**
     * Classify overlapped keys into group -> sub-category hierarchy.
     */
    _buildOverlapHierarchy(overlappedKeys) {
        const hierarchy = new Map(); // group -> Map(subcategory -> count)
        for (const key of overlappedKeys) {
            const category = this.categoryDB.classify(key);
            const group = this.categoryDB.getGroup(category) || 'Other';
            if (!hierarchy.has(group)) hierarchy.set(group, new Map());
            const subs = hierarchy.get(group);
            subs.set(category, (subs.get(category) || 0) + 1);
        }
        // Sort groups by total count descending
        return [...hierarchy.entries()]
            .map(([group, subs]) => {
                const total = [...subs.values()].reduce((a, b) => a + b, 0);
                const subcategories = [...subs.entries()].sort((a, b) => b[1] - a[1]);
                return { group, total, subcategories };
            })
            .sort((a, b) => b.total - a.total);
    }

    _renderDesignA(hierarchy) {
        return hierarchy.map(({ group, total, subcategories }) => {
            const subLines = subcategories.map(([cat, count]) =>
                `<div class="overlap-sub-row"><span class="overlap-sub-name">${this.escapeHtml(cat)}</span><span class="overlap-sub-count">${count}</span></div>`
            ).join('');
            return `<details class="overlap-group-accordion">
                <summary><span class="overlap-group-name">${this.escapeHtml(group)}</span><span class="overlap-group-count">${total}</span></summary>
                <div class="overlap-sub-list">${subLines}</div>
            </details>`;
        }).join('');
    }

    _renderDesignB(hierarchy) {
        return hierarchy.map(({ group, total, subcategories }) => {
            const chips = subcategories.map(([cat, count]) =>
                `<span class="overlap-chip">${this.escapeHtml(cat)} ${count}</span>`
            ).join('');
            return `<div class="overlap-inline-row">
                <span class="overlap-group-name">${this.escapeHtml(group)}</span>
                <span class="overlap-group-count">${total}</span>
                <div class="overlap-chips">${chips}</div>
            </div>`;
        }).join('');
    }

    _renderDesignC(hierarchy) {
        let rows = '';
        hierarchy.forEach(({ group, total, subcategories }) => {
            rows += `<tr class="overlap-table-group"><td colspan="2">${this.escapeHtml(group)}</td><td>${total}</td></tr>`;
            subcategories.forEach(([cat, count]) => {
                rows += `<tr class="overlap-table-sub"><td></td><td>${this.escapeHtml(cat)}</td><td>${count}</td></tr>`;
            });
        });
        return `<table class="overlap-table"><thead><tr><th>Group</th><th>Sub-category</th><th>Keys</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    updatePriorityStats() {
        const container = document.getElementById('priority-stats');
        if (!container) return;

        if (!this.stockLoaded || this.priorityOrder.length === 0) {
            container.innerHTML = '<div class="category-empty">Enable packs and set priority order to see merge statistics.</div>';
            return;
        }

        const { overriddenKeys, perSource } = this.mergeEngine.computePriorityStats(this.priorityOrder);

        // Build overlap data for sources that have overlaps
        const overlapData = perSource.map(ps => ({
            ...ps,
            hierarchy: ps.overlapped > 0 ? this._buildOverlapHierarchy(ps.overlappedKeys) : []
        }));

        container.innerHTML = '';

        // --- Render 3 design variations ---
        const designs = [
            { label: 'Design A: Nested Accordion', render: (h) => this._renderDesignA(h) },
            { label: 'Design B: Inline Sub-categories', render: (h) => this._renderDesignB(h) },
            { label: 'Design C: Table View', render: (h) => this._renderDesignC(h) },
        ];

        for (const design of designs) {
            const section = document.createElement('div');
            section.className = 'design-variant';

            const heading = document.createElement('h3');
            heading.className = 'design-variant-label';
            heading.textContent = design.label;
            section.appendChild(heading);

            overlapData.forEach((ps, index) => {
                const sourceDef = this.getSourceDef(ps.sourceId);
                const custom = this.customPacks.get(ps.sourceId);
                const name = sourceDef ? sourceDef.name : (custom ? custom.name : ps.sourceId);

                const row = document.createElement('div');
                row.className = 'priority-stat-row';

                let overlapHtml = '';
                if (ps.overlapped > 0) {
                    overlapHtml = `
                        <span class="stat-overlapped">(${ps.overlapped.toLocaleString()} overlapped by higher priority)</span>
                        <details class="overlap-details">
                            <summary>Show overlap details</summary>
                            <div class="overlap-group-list">${design.render(ps.hierarchy)}</div>
                        </details>`;
                }

                row.innerHTML = `
                    <span class="stat-priority">${index + 1}</span>
                    <span class="stat-name">${this.escapeHtml(name)}</span>
                    <span class="stat-applied">${ps.applied.toLocaleString()} keys applied</span>
                    ${overlapHtml}
                `;
                section.appendChild(row);
            });

            const total = document.createElement('div');
            total.className = 'priority-stat-total';
            total.textContent = `Total: ${overriddenKeys.toLocaleString()} keys changed from stock`;
            section.appendChild(total);

            container.appendChild(section);
        }
    }

    updatePriorityMergeButton() {
        const btn = document.getElementById('priority-merge-btn');
        const summary = document.getElementById('priority-merge-summary');
        if (!btn || !summary) return;

        const hasOrder = this.priorityOrder.length > 0;
        btn.disabled = !this.stockLoaded || !hasOrder;

        if (!hasOrder) {
            summary.innerHTML = 'Set priority order to merge.';
        } else {
            summary.innerHTML = `<strong>${this.priorityOrder.length}</strong> ${this.priorityOrder.length === 1 ? 'pack' : 'packs'} in priority order &mdash; ready to merge.`;
        }
    }

    // --- Security ---

    /**
     * Escape unsafe characters for HTML rendering.
     */
    escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // --- Category Browser ---

    async loadCategoryDb() {
        try {
            const response = await fetch('data/category_db.json');
            if (!response.ok) return;
            this.categoryDbData = await response.json();
        } catch {
            // Not fatal
        }
    }

    searchCategoryDb(query) {
        const container = document.getElementById('db-results');
        const countEl = document.getElementById('db-search-count');
        const trimmed = query.trim();

        if (!this.categoryDbData) {
            container.innerHTML = '<div class="category-empty">Category database not loaded. Run <code>scripts/build_category_db.py</code> to generate it.</div>';
            countEl.textContent = '';
            return;
        }

        if (trimmed.length < 3) {
            container.innerHTML = '<div class="category-empty">Type at least 3 characters to search.</div>';
            countEl.textContent = '';
            return;
        }

        const lowerQuery = trimmed.toLowerCase();
        const keys = this.categoryDbData.keys;
        const matches = [];
        const MAX_RESULTS = 200;

        const stockData = this.mergeEngine?.stock;

        for (const [key, info] of Object.entries(keys)) {
            if (key.toLowerCase().includes(lowerQuery)) {
                const value = stockData ? (stockData.get(key) || '') : '';
                matches.push({ key, value, ...info });
                if (matches.length >= MAX_RESULTS) break;
            } else if (stockData) {
                const value = stockData.get(key) || '';
                if (value.toLowerCase().includes(lowerQuery)) {
                    matches.push({ key, value, ...info });
                    if (matches.length >= MAX_RESULTS) break;
                }
            }
        }

        countEl.textContent = matches.length >= MAX_RESULTS
            ? `${MAX_RESULTS}+ matches (showing first ${MAX_RESULTS})`
            : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;

        if (matches.length === 0) {
            container.innerHTML = '<div class="category-empty">No keys found matching your search.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'db-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Key</th>
                    <th>Value</th>
                    <th>Category</th>
                    <th>Group</th>
                    <th></th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        for (const match of matches) {
            const tr = document.createElement('tr');
            const issueTitle = encodeURIComponent(`Category correction: ${match.key}`);
            const issueBody = encodeURIComponent(
                `**Key:** \`${match.key}\`\n**Current category:** ${match.category}\n**Current group:** ${match.group}\n\n**Suggested category:** \n**Reason:** \n`
            );
            const issueUrl = `https://github.com/BeltaKoda/StarMeld/issues/new?title=${issueTitle}&body=${issueBody}&labels=category-correction`;

            const displayValue = match.value && match.value.length > 80
                ? match.value.substring(0, 80) + '...'
                : (match.value || '');

            tr.innerHTML = `
                <td class="key-cell">${this.escapeHtml(match.key)}</td>
                <td class="value-cell">${this.escapeHtml(displayValue)}</td>
                <td class="cat-cell">${this.escapeHtml(match.category)}</td>
                <td class="group-cell">${this.escapeHtml(match.group)}</td>
                <td class="report-cell"><a href="${issueUrl}" target="_blank" class="report-link" title="Report incorrect category">Report Incorrect Category</a></td>
            `;
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }

    // --- Compare Items ---

    renderComparePackSelector() {
        const container = document.getElementById('compare-packs');
        container.innerHTML = '';

        if (this.enabledSources.size === 0) {
            container.innerHTML = '<span>No packs enabled</span>';
            return;
        }

        for (const sourceId of this.enabledSources) {
            const name = this.getSourceDisplayName(sourceId);
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${sourceId}" checked> ${this.escapeHtml(name)}`;
            label.querySelector('input').addEventListener('change', () => {
                // Re-search with current query
                const query = document.getElementById('compare-search-input').value;
                if (query.trim().length >= 3) this.searchCompare(query);
            });
            container.appendChild(label);
        }
    }

    getSelectedComparePacks() {
        const checkboxes = document.querySelectorAll('#compare-packs input[type="checkbox"]');
        const selected = [];
        for (const cb of checkboxes) {
            if (cb.checked) selected.push(cb.value);
        }
        return selected;
    }

    searchCompare(query) {
        const container = document.getElementById('compare-results');
        const countEl = document.getElementById('compare-search-count');
        const trimmed = query.trim();

        if (!this.stockLoaded) {
            container.innerHTML = '<div class="category-empty">Stock file not loaded yet.</div>';
            countEl.textContent = '';
            return;
        }

        if (this.enabledSources.size === 0) {
            container.innerHTML = '<div class="category-empty">Enable language packs above, then search to compare.</div>';
            countEl.textContent = '';
            return;
        }

        if (trimmed.length < 3) {
            container.innerHTML = '<div class="category-empty">Type at least 3 characters to search.</div>';
            countEl.textContent = '';
            return;
        }

        const selectedPacks = this.getSelectedComparePacks();
        if (selectedPacks.length === 0) {
            container.innerHTML = '<div class="category-empty">Select at least one pack to compare.</div>';
            countEl.textContent = '';
            return;
        }

        const lowerQuery = trimmed.toLowerCase();
        const stockData = this.mergeEngine.stock;
        const matches = [];
        const MAX_RESULTS = 100;

        for (const [key, stockValue] of stockData) {
            if (key.toLowerCase().includes(lowerQuery) || stockValue.toLowerCase().includes(lowerQuery)) {
                matches.push({ key, stockValue });
                if (matches.length >= MAX_RESULTS) break;
            }
        }

        countEl.textContent = matches.length >= MAX_RESULTS
            ? `${MAX_RESULTS}+ matches (showing first ${MAX_RESULTS})`
            : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`;

        if (matches.length === 0) {
            container.innerHTML = '<div class="category-empty">No keys found matching your search.</div>';
            return;
        }

        // Build table with dynamic columns
        const table = document.createElement('table');
        table.className = 'compare-table';

        let headerHtml = '<tr><th>Key</th><th>Stock</th>';
        for (const packId of selectedPacks) {
            headerHtml += `<th>${this.getSourceDisplayName(packId)}</th>`;
        }
        headerHtml += '</tr>';
        table.innerHTML = `<thead>${headerHtml}</thead>`;

        const tbody = document.createElement('tbody');
        for (const match of matches) {
            const tr = document.createElement('tr');

            const stockDisplay = match.stockValue.length > 60
                ? match.stockValue.substring(0, 60) + '...'
                : match.stockValue;

            let html = `<td class="key-cell">${this.escapeHtml(match.key)}</td>`;
            html += `<td class="stock-cell">${this.escapeHtml(stockDisplay)}</td>`;

            for (const packId of selectedPacks) {
                const importData = this.mergeEngine.imports.get(packId);
                const importValue = importData ? importData.get(match.key) : undefined;

                if (importValue === undefined || importValue === match.stockValue) {
                    html += '<td class="same-cell">(same)</td>';
                } else {
                    const display = importValue.length > 60
                        ? importValue.substring(0, 60) + '...'
                        : importValue;
                    html += `<td class="modified-cell">${this.escapeHtml(display)}</td>`;
                }
            }

            tr.innerHTML = html;
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
    }

    // --- Key Customiser ---

    renderCustomiserFilters() {
        const container = document.getElementById('customiser-filters');
        const subContainer = document.getElementById('customiser-sub-filters');
        container.innerHTML = '';
        subContainer.innerHTML = '';

        const flatGroups = this.categoryDB.getFlatGroups();
        if (!flatGroups || flatGroups.length === 0) return;

        const rerunSearch = () => {
            const query = document.getElementById('customiser-search-input').value;
            if (query.trim().length >= 3) this.searchCustomiser(query);
        };

        const allChip = document.createElement('button');
        allChip.className = 'filter-chip active';
        allChip.textContent = 'All';
        allChip.addEventListener('click', () => {
            this.customiserGroupFilter = null;
            this.customiserCategoryFilter = null;
            container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            allChip.classList.add('active');
            subContainer.innerHTML = '';
            rerunSearch();
        });
        container.appendChild(allChip);

        for (const group of flatGroups) {
            const chip = document.createElement('button');
            chip.className = 'filter-chip';
            chip.textContent = group.name;
            chip.addEventListener('click', () => {
                this.customiserGroupFilter = group.name;
                this.customiserCategoryFilter = null;
                container.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.renderCustomiserSubFilters(group);
                rerunSearch();
            });
            container.appendChild(chip);
        }
    }

    renderCustomiserSubFilters(group) {
        const subContainer = document.getElementById('customiser-sub-filters');
        subContainer.innerHTML = '';

        if (!group || !group.categories || group.categories.length <= 1) return;

        const rerunSearch = () => {
            const query = document.getElementById('customiser-search-input').value;
            if (query.trim().length >= 3) this.searchCustomiser(query);
        };

        const allChip = document.createElement('button');
        allChip.className = 'filter-chip filter-chip-sub active';
        allChip.textContent = 'All ' + group.name;
        allChip.addEventListener('click', () => {
            this.customiserCategoryFilter = null;
            subContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            allChip.classList.add('active');
            rerunSearch();
        });
        subContainer.appendChild(allChip);

        for (const cat of group.categories) {
            const chip = document.createElement('button');
            chip.className = 'filter-chip filter-chip-sub';
            chip.textContent = cat.name;
            chip.title = cat.description;
            chip.addEventListener('click', () => {
                this.customiserCategoryFilter = cat.name;
                subContainer.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                rerunSearch();
            });
            subContainer.appendChild(chip);
        }
    }

    searchCustomiser(query) {
        const container = document.getElementById('customiser-results');
        const countEl = document.getElementById('customiser-search-count');
        const trimmed = query.trim();

        if (!this.stockLoaded) {
            container.innerHTML = '<div class="category-empty">Stock file not loaded yet.</div>';
            countEl.textContent = '';
            return;
        }

        if (trimmed.length < 3) {
            container.innerHTML = '<div class="category-empty">Type at least 3 characters to search.</div>';
            countEl.textContent = '';
            return;
        }

        const lowerQuery = trimmed.toLowerCase();
        const stockData = this.mergeEngine.stock;
        const matches = [];
        const MAX_RESULTS = 100;
        const groupFilter = this.customiserGroupFilter;
        const categoryFilter = this.customiserCategoryFilter;
        const catKeys = this.categoryDbData ? this.categoryDbData.keys : null;

        for (const [key, stockValue] of stockData) {
            if (key.toLowerCase().includes(lowerQuery) || stockValue.toLowerCase().includes(lowerQuery)) {
                if (catKeys && (categoryFilter || groupFilter)) {
                    const info = catKeys[key];
                    if (!info) continue;
                    if (categoryFilter && info.category !== categoryFilter) continue;
                    if (!categoryFilter && groupFilter && info.group !== groupFilter) continue;
                }
                matches.push({ key, stockValue });
                if (matches.length >= MAX_RESULTS) break;
            }
        }

        const filterLabel = categoryFilter ? ` in ${categoryFilter}` : (groupFilter ? ` in ${groupFilter}` : '');
        countEl.textContent = matches.length >= MAX_RESULTS
            ? `${MAX_RESULTS}+ matches${filterLabel} (showing first ${MAX_RESULTS})`
            : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}${filterLabel}`;

        if (matches.length === 0) {
            container.innerHTML = `<div class="category-empty">No keys found matching your search${this.escapeHtml(filterLabel)}.</div>`;
            return;
        }

        // Build dynamic columns: Key | Stock | [enabled packs...] | Your Value | Action
        const enabledPacks = [...this.enabledSources].filter(id => id !== this.userCustomisationsId);

        const table = document.createElement('table');
        table.className = 'compare-table customiser-table';

        let headerHtml = '<tr><th>Key</th><th>Stock</th>';
        for (const packId of enabledPacks) {
            headerHtml += `<th>${this.escapeHtml(this.getSourceDisplayName(packId))}</th>`;
        }
        headerHtml += '<th>Your Value</th><th></th></tr>';
        table.innerHTML = `<thead>${headerHtml}</thead>`;

        const tbody = document.createElement('tbody');
        for (const match of matches) {
            const tr = document.createElement('tr');

            const stockDisplay = match.stockValue.length > 60
                ? match.stockValue.substring(0, 60) + '...'
                : match.stockValue;

            let html = `<td class="key-cell">${this.escapeHtml(match.key)}</td>`;
            html += `<td class="stock-cell">${this.escapeHtml(stockDisplay)}</td>`;

            for (const packId of enabledPacks) {
                const importData = this.mergeEngine.imports.get(packId);
                const importValue = importData ? importData.get(match.key) : undefined;

                if (importValue === undefined || importValue === match.stockValue) {
                    html += '<td class="same-cell">(same)</td>';
                } else {
                    const display = importValue.length > 60
                        ? importValue.substring(0, 60) + '...'
                        : importValue;
                    html += `<td class="modified-cell">${this.escapeHtml(display)}</td>`;
                }
            }

            const existingValue = this.userCustomisations.get(match.key) || '';
            html += `<td class="customiser-input-cell"><input type="text" class="customiser-value-input" data-key="${this.escapeHtml(match.key)}" value="${this.escapeHtml(existingValue)}" placeholder="${this.escapeHtml(match.stockValue.substring(0, 40))}"></td>`;
            html += `<td class="customiser-action-cell"><button class="btn customiser-save-btn" data-key="${this.escapeHtml(match.key)}">Save</button></td>`;

            tr.innerHTML = html;
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);

        // Bind save buttons and enter key
        container.querySelectorAll('.customiser-save-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const input = container.querySelector(`.customiser-value-input[data-key="${CSS.escape(key)}"]`);
                if (input && input.value.trim()) {
                    this.saveCustomisation(key, input.value.trim());
                    btn.textContent = 'Saved';
                    btn.classList.add('btn-primary');
                    setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('btn-primary'); }, 1000);
                }
            });
        });

        container.querySelectorAll('.customiser-value-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const key = input.dataset.key;
                    if (input.value.trim()) {
                        this.saveCustomisation(key, input.value.trim());
                        const btn = container.querySelector(`.customiser-save-btn[data-key="${CSS.escape(key)}"]`);
                        if (btn) { btn.textContent = 'Saved'; btn.classList.add('btn-primary'); setTimeout(() => { btn.textContent = 'Save'; btn.classList.remove('btn-primary'); }, 1000); }
                    }
                }
            });
        });
    }

    saveCustomisation(key, value) {
        const stockValue = this.mergeEngine.stock ? this.mergeEngine.stock.get(key) : null;
        if (value === stockValue) {
            this.userCustomisations.delete(key);
        } else {
            this.userCustomisations.set(key, value);
        }
        this.syncUserCustomisations();
    }

    removeCustomisation(key) {
        this.userCustomisations.delete(key);
        this.syncUserCustomisations();
    }

    clearCustomisations() {
        this.userCustomisations.clear();
        this.syncUserCustomisations();
    }

    syncUserCustomisations() {
        const id = this.userCustomisationsId;

        if (this.userCustomisations.size > 0) {
            this.mergeEngine.addImport(id, this.userCustomisations);
            this.customPacks.set(id, { name: 'My Customizations', data: this.userCustomisations });
            if (!this.enabledSources.has(id)) {
                this.enabledSources.add(id);
            }
            if (!this.priorityOrder.includes(id)) {
                this.priorityOrder.push(id);
            }
        } else {
            this.mergeEngine.removeImport(id);
            this.customPacks.delete(id);
            this.enabledSources.delete(id);
            this.priorityOrder = this.priorityOrder.filter(pid => pid !== id);
            for (const [cat, src] of this.categorySelections) {
                if (src === id) this.categorySelections.delete(cat);
            }
        }

        this.renderCustomPacks();
        this.renderCategoryTree();
        this.updateMergeButton();
        this.renderPriorityList();
        this.updatePriorityStats();
        this.updatePriorityMergeButton();
        this.renderMyCustomisations();
        this.updateCustomiserBadge();

        if (document.getElementById('customiser-persist').checked) {
            this.saveCustomisationsToStorage();
        }
    }

    renderMyCustomisations() {
        const container = document.getElementById('customiser-list');
        const countEl = document.getElementById('customiser-count');
        const exportBtn = document.getElementById('customiser-export-btn');
        const clearBtn = document.getElementById('customiser-clear-btn');

        const count = this.userCustomisations.size;
        countEl.textContent = `${count} customization${count !== 1 ? 's' : ''}`;
        exportBtn.disabled = count === 0;
        clearBtn.disabled = count === 0;

        if (count === 0) {
            container.innerHTML = '<div class="category-empty">No customizations yet. Search above and edit key values to get started.</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'db-table customiser-my-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Key</th>
                    <th>Stock Value</th>
                    <th>Your Value</th>
                    <th></th>
                </tr>
            </thead>
        `;

        const tbody = document.createElement('tbody');
        const stockData = this.mergeEngine.stock;

        for (const [key, value] of this.userCustomisations) {
            const stockValue = stockData ? (stockData.get(key) || '') : '';
            const stockDisplay = stockValue.length > 50 ? stockValue.substring(0, 50) + '...' : stockValue;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="key-cell">${this.escapeHtml(key)}</td>
                <td class="stock-cell">${this.escapeHtml(stockDisplay)}</td>
                <td class="customiser-input-cell"><input type="text" class="customiser-value-input customiser-my-input" data-key="${this.escapeHtml(key)}" value="${this.escapeHtml(value)}"></td>
                <td class="customiser-action-cell"><button class="btn customiser-remove-btn" data-key="${this.escapeHtml(key)}">Remove</button></td>
            `;
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);

        container.querySelectorAll('.customiser-my-input').forEach(input => {
            const commitEdit = () => {
                const key = input.dataset.key;
                const newValue = input.value.trim();
                if (!newValue) {
                    this.removeCustomisation(key);
                } else if (newValue !== this.userCustomisations.get(key)) {
                    this.saveCustomisation(key, newValue);
                }
            };
            input.addEventListener('blur', commitEdit);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { input.blur(); }
            });
        });

        container.querySelectorAll('.customiser-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.removeCustomisation(btn.dataset.key);
            });
        });
    }

    updateCustomiserBadge() {
        const badge = document.getElementById('customiser-badge');
        const count = this.userCustomisations.size;
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    }

    exportCustomisations() {
        if (this.userCustomisations.size === 0) return;
        const content = serializeIni(this.userCustomisations);
        downloadIni(content, 'my-customizations.ini');
    }

    async importCustomisations(file) {
        try {
            const text = await readFileAsText(file);
            const data = parseIni(text);
            for (const [key, value] of data) {
                this.userCustomisations.set(key, value);
            }
            this.syncUserCustomisations();
        } catch (err) {
            console.error('Failed to import customisations:', err);
        }
    }

    saveCustomisationsToStorage() {
        const entries = Array.from(this.userCustomisations.entries());
        localStorage.setItem('starmeld-user-customisations', JSON.stringify(entries));
    }

    restoreCustomisations() {
        const persist = localStorage.getItem('starmeld-customiser-persist');
        if (persist === 'true') {
            document.getElementById('customiser-persist').checked = true;
            const saved = localStorage.getItem('starmeld-user-customisations');
            if (saved) {
                try {
                    const entries = JSON.parse(saved);
                    this.userCustomisations = new Map(entries);
                    this.syncUserCustomisations();
                } catch {
                    // Corrupt data, ignore
                }
            }
        }
    }

    // --- Refresh ---

    refreshAll() {
        for (const source of LANGUAGE_PACK_SOURCES) {
            if (this.enabledSources.has(source.id) && this.mergeEngine.imports.has(source.id)) {
                const diff = this.mergeEngine.getCategoryDiff(source.id);
                const statsEl = document.getElementById(`stats-${source.id}`);
                let modifiedCategories = 0;
                let modifiedKeys = 0;
                for (const [, stats] of diff) {
                    if (stats.modified > 0) {
                        modifiedCategories++;
                        modifiedKeys += stats.modified;
                    }
                }
                if (statsEl) {
                    statsEl.textContent = `${modifiedKeys.toLocaleString()} keys differ across ${modifiedCategories} categories`;
                }
            }
        }
        this.renderCustomPacks();
        this.renderCategoryTree();
        this.updateMergeButton();
    }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
    const app = new StarMeldApp();
    app.init().catch(err => {
        console.error('StarMeld init failed:', err);
    });
});
