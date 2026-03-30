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
        this.categorySelections = new Map(); // category -> sourceName
        this.categoryDbData = null; // pre-built category DB for browser tab
    }

    async init() {
        await this.categoryDB.load();
        this.mergeEngine = new MergeEngine(this.categoryDB);
        this.bindEvents();
        this.renderPackList();
        this.loadStockFromGitHub();
        this.loadCategoryDb();
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

        // Merge button
        document.getElementById('merge-btn').addEventListener('click', () => this.doMerge());

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            });
        });

        // Category browser search
        const searchInput = document.getElementById('db-search-input');
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.searchCategoryDb(searchInput.value), 200);
        });
    }

    // --- Stock Loading ---

    async loadStockFromGitHub() {
        this.setStockStatus('loading', 'Fetching stock from GitHub...');
        try {
            const response = await fetch(STOCK_SOURCE.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const data = parseIni(text);
            this.mergeEngine.setStock(data);
            this.stockLoaded = true;
            this.setStockStatus('loaded', `Stock loaded: ${data.size.toLocaleString()} keys`);
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

    renderPackList() {
        const container = document.getElementById('github-packs');
        container.innerHTML = '';

        for (const source of LANGUAGE_PACK_SOURCES) {
            const card = document.createElement('div');
            card.className = 'pack-card';
            card.id = `pack-${source.id}`;
            card.innerHTML = `
                <input type="checkbox" id="check-${source.id}" ${source.defaultEnabled ? 'checked' : ''}>
                <div class="pack-info">
                    <div class="pack-name">${source.name}</div>
                    <div class="pack-desc">${source.description}</div>
                    <div class="pack-stats" id="stats-${source.id}"></div>
                    <div class="pack-status" id="status-${source.id}"></div>
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

        statusEl.innerHTML = '<span class="status status-loading"><span class="spinner"></span>Fetching...</span>';

        try {
            const response = await fetch(source.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const data = parseIni(text);

            this.mergeEngine.addImport(source.id, data);
            statusEl.innerHTML = '<span class="status status-loaded">Loaded</span>';

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
            }

            this.renderCategoryTree();
            this.updateMergeButton();
        } catch (err) {
            statusEl.innerHTML = `<span class="status status-error">Error: ${err.message}</span>`;
            this.enabledSources.delete(source.id);
        }
    }

    disableSource(source) {
        this.enabledSources.delete(source.id);
        this.mergeEngine.removeImport(source.id);
        document.getElementById(`stats-${source.id}`).textContent = '';
        document.getElementById(`status-${source.id}`).innerHTML = '';

        for (const [cat, src] of this.categorySelections) {
            if (src === source.id) this.categorySelections.delete(cat);
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
            this.renderCustomPacks();
            this.renderCategoryTree();
            this.updateMergeButton();
        } catch (err) {
            console.error('Failed to load custom pack:', err);
        }
    }

    removeCustomPack(id) {
        this.mergeEngine.removeImport(id);
        this.customPacks.delete(id);
        this.enabledSources.delete(id);

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
                <button class="remove-btn" data-id="${id}">Remove</button>
            `;

            card.querySelector('.remove-btn').addEventListener('click', () => {
                this.removeCustomPack(id);
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

    /**
     * Set all categories within a group to a given source.
     */
    setGroupSelection(groupName, sourceId, allDiffs) {
        const hierarchy = this.categoryDB.getHierarchy();
        const group = hierarchy.find(g => g.name === groupName);
        if (!group) return;

        for (const cat of group.categories) {
            if (sourceId) {
                // Only set if this source actually modifies this category
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

    renderCategoryTree() {
        const container = document.getElementById('category-tree');

        if (!this.stockLoaded || this.enabledSources.size === 0) {
            container.innerHTML = '<div class="category-empty">Load a stock file and enable at least one language pack to see categories.</div>';
            return;
        }

        const allDiffs = this.mergeEngine.getAllCategoryDiffs();
        const hierarchy = this.categoryDB.getHierarchy();

        container.innerHTML = '';

        for (const group of hierarchy) {
            let groupHasModifications = false;
            let groupModifiedCount = 0;

            // Collect all sources that modify any category in this group
            const groupSourcesMap = new Map(); // sourceId -> total modified keys in group
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

            // Group header with its own source dropdown
            const headerEl = document.createElement('div');
            headerEl.className = 'group-header' + (groupHasModifications ? ' expanded' : '');

            const arrowSpan = document.createElement('span');
            arrowSpan.className = 'arrow';
            arrowSpan.textContent = '\u25B6';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'group-name';
            nameSpan.textContent = group.name;

            const statsSpan = document.createElement('span');
            statsSpan.className = 'group-stats';
            statsSpan.textContent = groupHasModifications
                ? groupModifiedCount.toLocaleString() + ' modified'
                : 'no changes';

            headerEl.appendChild(arrowSpan);
            headerEl.appendChild(nameSpan);
            headerEl.appendChild(statsSpan);

            // Group-level source dropdown
            if (groupHasModifications) {
                const groupSourceEl = document.createElement('div');
                groupSourceEl.className = 'group-source';
                const groupSelect = document.createElement('select');
                groupSelect.innerHTML = '<option value="">Stock (default)</option>';

                for (const [srcId, count] of groupSourcesMap) {
                    const displayName = this.getSourceDisplayName(srcId);
                    groupSelect.innerHTML += `<option value="${srcId}">${displayName} (${count})</option>`;
                }

                groupSelect.addEventListener('click', (e) => {
                    e.stopPropagation(); // Don't toggle expand/collapse
                });

                groupSelect.addEventListener('change', () => {
                    this.setGroupSelection(group.name, groupSelect.value || '', allDiffs);
                    this.renderCategoryTree(); // Re-render to update child dropdowns
                    this.updateMergeButton();
                });

                groupSourceEl.appendChild(groupSelect);
                headerEl.appendChild(groupSourceEl);
            }

            const categoriesEl = document.createElement('div');
            categoriesEl.className = 'group-categories' + (groupHasModifications ? ' expanded' : '');

            // Toggle expand/collapse on header click (but not on dropdown)
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
            container.appendChild(groupEl);
        }
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
        if (!this.stockLoaded || this.categorySelections.size === 0) return;

        const { merged, stats } = this.mergeEngine.merge(this.categorySelections);
        const content = serializeIni(merged);
        downloadIni(content, 'global.ini');

        const summary = document.getElementById('merge-summary');
        summary.innerHTML = `Downloaded! <strong>${stats.overriddenKeys.toLocaleString()}</strong> keys overridden across <strong>${stats.categoriesOverridden}</strong> categories (${stats.totalKeys.toLocaleString()} total keys)`;
    }

    // --- Category Browser ---

    async loadCategoryDb() {
        try {
            const response = await fetch('data/category_db.json');
            if (!response.ok) return; // Not fatal if it doesn't exist yet
            this.categoryDbData = await response.json();
        } catch {
            // category_db.json not available, browser tab will show a message
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

        // Search both key names and values (if stock is loaded)
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

            // Truncate long values for display
            const displayValue = match.value && match.value.length > 80
                ? match.value.substring(0, 80) + '...'
                : (match.value || '');

            tr.innerHTML = `
                <td class="key-cell">${match.key}</td>
                <td class="value-cell">${displayValue}</td>
                <td class="cat-cell">${match.category}</td>
                <td class="group-cell">${match.group}</td>
                <td class="report-cell"><a href="${issueUrl}" target="_blank" class="report-link" title="Report incorrect category">Report</a></td>
            `;
            tbody.appendChild(tr);
        }

        table.appendChild(tbody);
        container.innerHTML = '';
        container.appendChild(table);
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
