/**
 * Merge engine for combining multiple global.ini files by category.
 * Takes a stock base + imported language packs + per-category source selections
 * and produces a merged output.
 */

class MergeEngine {
    /**
     * @param {import('./categories.js').CategoryDB} categoryDB
     */
    constructor(categoryDB) {
        this.categoryDB = categoryDB;
        this.stock = null;              // Map<key, value>
        this.imports = new Map();       // Map<sourceName, Map<key, value>>
        this.stockClassification = null; // Map<key, category> — cached
    }

    /**
     * Set the stock (vanilla) global.ini as the base.
     * @param {Map<string, string>} iniMap - Parsed stock INI
     */
    setStock(iniMap) {
        this.stock = iniMap;
        this.stockClassification = this.categoryDB.classifyAll(iniMap.keys());
    }

    /**
     * Add an imported language pack.
     * @param {string} name - Display name / source ID
     * @param {Map<string, string>} iniMap - Parsed INI from this pack
     */
    addImport(name, iniMap) {
        this.imports.set(name, iniMap);
    }

    /**
     * Remove an imported language pack.
     * @param {string} name - Source ID to remove
     */
    removeImport(name) {
        this.imports.delete(name);
    }

    /**
     * Clear all imports.
     */
    clearImports() {
        this.imports.clear();
    }

    /**
     * Compute per-category diff counts for an import against stock.
     * Returns which categories have modifications and how many keys differ.
     * @param {string} importName - Source ID
     * @returns {Map<string, {modified: number, total: number}>} Category -> diff stats
     */
    getCategoryDiff(importName) {
        if (!this.stock) throw new Error('Stock not loaded');
        const importData = this.imports.get(importName);
        if (!importData) throw new Error(`Import not found: ${importName}`);

        const diffs = new Map();

        for (const [key, stockValue] of this.stock) {
            const category = this.stockClassification.get(key);
            if (!diffs.has(category)) {
                diffs.set(category, { modified: 0, total: 0 });
            }
            diffs.get(category).total++;

            const importValue = importData.get(key);
            if (importValue !== undefined && importValue !== stockValue) {
                diffs.get(category).modified++;
            }
        }

        return diffs;
    }

    /**
     * Get diff info for all loaded imports.
     * @returns {Map<string, Map<string, {modified: number, total: number}>>}
     */
    getAllCategoryDiffs() {
        const allDiffs = new Map();
        for (const name of this.imports.keys()) {
            allDiffs.set(name, this.getCategoryDiff(name));
        }
        return allDiffs;
    }

    /**
     * Get the list of source names that have modifications in a given category.
     * @param {string} category - Category name
     * @returns {string[]} Source names with modifications
     */
    getSourcesForCategory(category) {
        const sources = [];
        for (const [name, importData] of this.imports) {
            for (const [key, stockValue] of this.stock) {
                if (this.stockClassification.get(key) !== category) continue;
                const importValue = importData.get(key);
                if (importValue !== undefined && importValue !== stockValue) {
                    sources.push(name);
                    break;
                }
            }
        }
        return sources;
    }

    /**
     * Merge stock + selected category overrides into a final output.
     * @param {Map<string, string>} selections - Map of category name -> source name to use.
     *   Categories not in this map use stock values.
     * @returns {{merged: Map<string, string>, stats: {totalKeys: number, overriddenKeys: number, categoriesOverridden: number}}}
     */
    merge(selections) {
        if (!this.stock) throw new Error('Stock not loaded');

        const merged = new Map();
        let overriddenKeys = 0;
        const categoriesUsed = new Set();

        for (const [key, stockValue] of this.stock) {
            const category = this.stockClassification.get(key);
            const selectedSource = selections.get(category);

            if (selectedSource && this.imports.has(selectedSource)) {
                const importData = this.imports.get(selectedSource);
                const importValue = importData.get(key);

                if (importValue !== undefined && importValue !== stockValue) {
                    merged.set(key, importValue);
                    overriddenKeys++;
                    categoriesUsed.add(category);
                } else {
                    // Import doesn't have this key or value is same as stock
                    merged.set(key, stockValue);
                }
            } else {
                merged.set(key, stockValue);
            }
        }

        return {
            merged,
            stats: {
                totalKeys: merged.size,
                overriddenKeys,
                categoriesOverridden: categoriesUsed.size
            }
        };
    }
}

export { MergeEngine };
