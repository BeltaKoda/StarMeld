/**
 * Category database for classifying global.ini keys into named groups.
 * Loads taxonomy from categories.json, compiles regex patterns, and classifies keys.
 */

class CategoryDB {
    constructor() {
        this.groups = [];
        this.rules = [];        // [{regex, category, group}] — ordered, first match wins
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
                        description: category.description
                    });
                }
            }
        }

        this.loaded = true;
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
     * Get the full group/category hierarchy for UI rendering.
     * @returns {Array<{name: string, categories: Array<{name: string, description: string}>}>}
     */
    getHierarchy() {
        const hierarchy = this.groups.map(g => ({
            name: g.name,
            categories: g.categories.map(c => ({
                name: c.name,
                description: c.description
            }))
        }));
        hierarchy.push({
            name: this.catchAll,
            categories: [{ name: this.catchAll, description: 'Keys not matching any other category' }]
        });
        return hierarchy;
    }
}

export { CategoryDB };
