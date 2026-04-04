/**
 * Category database for classifying global.ini keys into named groups.
 * Loads taxonomy from categories.json, compiles regex patterns, and classifies keys.
 */

class CategoryDB {
    constructor() {
        this.roots = [];
        this.groups = [];
        this.rules = [];        // [{regex, category, group, root}] — ordered, first match wins
        this.catchAll = 'Other';
        this.loaded = false;
    }

    /**
     * Load and compile the category taxonomy from a JSON URL.
     * @param {string} url - URL to categories.json
     */
    async load(url = 'data/categories.json') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load categories: ${response.statusText}`);

        const data = await response.json();
        this.roots = data.roots || [];
        this.groups = data.groups;
        this.catchAll = data.catchAll || 'Other';
        this.rules = [];

        for (const group of data.groups) {
            for (const category of group.categories) {
                for (const pattern of category.patterns) {
                    this.rules.push({
                        regex: new RegExp(pattern),
                        category: category.name,
                        group: group.name,
                        root: group.root || null,
                        description: category.description
                    });
                }
            }
        }

        this.loaded = true;
    }

    /**
     * Reload with a different category JSON URL.
     * @param {string} url - URL to new categories JSON
     */
    async reload(url) {
        this.loaded = false;
        await this.load(url);
    }

    /**
     * Classify a single key into a category name.
     * @param {string} key - INI key to classify
     * @returns {string} Category name
     */
    classify(key) {
        for (const rule of this.rules) {
            if (rule.regex.test(key)) {
                return rule.category;
            }
        }
        return this.catchAll;
    }

    /**
     * Classify all keys in a Map and return a Map of key -> category.
     * @param {Iterable<string>} keys - Keys to classify
     * @returns {Map<string, string>} Map of key -> category name
     */
    classifyAll(keys) {
        const result = new Map();
        for (const key of keys) {
            result.set(key, this.classify(key));
        }
        return result;
    }

    /**
     * Get the group name for a category.
     * @param {string} categoryName - Category name
     * @returns {string|null} Group name or null
     */
    getGroup(categoryName) {
        if (categoryName === this.catchAll) return this.catchAll;
        for (const group of this.groups) {
            for (const cat of group.categories) {
                if (cat.name === categoryName) return group.name;
            }
        }
        return null;
    }

    /**
     * Get the root name for a category.
     * @param {string} categoryName - Category name
     * @returns {string|null} Root name or null
     */
    getRoot(categoryName) {
        if (categoryName === this.catchAll) return this.roots[0] || null;
        for (const group of this.groups) {
            for (const cat of group.categories) {
                if (cat.name === categoryName) return group.root || null;
            }
        }
        return null;
    }

    /**
     * Get all category names in order.
     * @returns {string[]} Category names
     */
    getAllCategories() {
        const cats = [];
        for (const group of this.groups) {
            for (const cat of group.categories) {
                cats.push(cat.name);
            }
        }
        cats.push(this.catchAll);
        return cats;
    }

    /**
     * Get the full root/group/category hierarchy for UI rendering.
     * Groups with the same name under different roots are kept separate.
     * @returns {Array<{root: string, groups: Array<{name: string, categories: Array<{name: string, description: string}>}>}>}
     */
    getHierarchy() {
        const rootMap = new Map();

        for (const rootName of this.roots) {
            rootMap.set(rootName, []);
        }

        for (const group of this.groups) {
            const rootName = group.root || this.roots[0] || '';
            if (!rootMap.has(rootName)) rootMap.set(rootName, []);
            rootMap.get(rootName).push({
                name: group.name,
                categories: group.categories.map(c => ({
                    name: c.name,
                    description: c.description
                }))
            });
        }

        // Add catchAll to first root
        const firstRoot = this.roots[0] || '';
        if (rootMap.has(firstRoot)) {
            rootMap.get(firstRoot).push({
                name: this.catchAll,
                categories: [{ name: this.catchAll, description: 'Keys not matching any other category' }]
            });
        }

        return [...rootMap.entries()].map(([root, groups]) => ({ root, groups }));
    }
    /**
     * Get the set of group names that appear under more than one root.
     * @returns {Set<string>}
     */
    getSharedGroupNames() {
        const rootsByGroup = new Map();
        for (const group of this.groups) {
            const root = group.root || this.roots[0] || '';
            if (!rootsByGroup.has(group.name)) rootsByGroup.set(group.name, new Set());
            rootsByGroup.get(group.name).add(root);
        }
        const shared = new Set();
        for (const [name, roots] of rootsByGroup) {
            if (roots.size > 1) shared.add(name);
        }
        return shared;
    }

    /**
     * Get a flat list of all groups with categories (ignoring roots).
     * Used by code that doesn't need root-level grouping.
     * @returns {Array<{name: string, root: string, categories: Array<{name: string, description: string}>}>}
     */
    getFlatGroups() {
        const groups = this.groups.map(g => ({
            name: g.name,
            root: g.root || this.roots[0] || '',
            categories: g.categories.map(c => ({
                name: c.name,
                description: c.description
            }))
        }));
        groups.push({
            name: this.catchAll,
            root: this.roots[0] || '',
            categories: [{ name: this.catchAll, description: 'Keys not matching any other category' }]
        });
        return groups;
    }
}

export { CategoryDB };
