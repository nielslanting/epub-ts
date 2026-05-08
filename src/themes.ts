import EventEmitter from "event-emitter";
import Rendition from "./rendition";
import Url from "./utils/url";
import { EVENTS } from "./utils/constants";
import Contents from "./contents";

/**
 * Themes to apply to displayed content
 */
class Themes extends Map<string, any> {
	rendition: Rendition;
	current: string | null;
	rules: Record<string, any>;

	/**
	 * Constructor
	 * @param {Rendition} rendition
	 */
	constructor(rendition: Rendition) {
		super();
		this.rendition = rendition;
		/**
		 * @member {string|null} current
		 * @memberof Themes
		 * @readonly
		 */
		this.current = null;
		/**
		 * Injected css rules
		 * @member {Record<string, any>} rules
		 * @memberof Themes
		 * @readonly
		 */
		this.rules = {};
		this.rendition.hooks.content.register(this.inject.bind(this));
		this.rendition.hooks.content.register(this.update.bind(this));
	}

	/**
	 * Add themes to be used by a rendition
	 * @example register("light", "/path/to/light.css")
	 * @example register("light", "https://example.com/to/light.css")
	 * @example register("light", { body: { color: "purple"}})
	 * @example register({ light: {...}, dark: {...}})
	 */
	register(...args: any[]): void {
		if (args.length === 0) {
			return;
		}
		if (args.length === 1 && typeof (args[0]) === "object") {
			return this.registerThemes(args[0]);
		}
		if (args.length === 2 && typeof (args[1]) === "string") {
			return this.registerUrl(args[0], args[1]);
		}
		if (args.length === 2 && typeof (args[1]) === "object") {
			return this.registerRules(args[0], args[1]);
		}
	}

	/**
	 * Register themes object
	 * @param {Record<string, any>} themes
	 */
	registerThemes(themes: Record<string, any>): void {
		for (const theme in themes) {
			if (Object.prototype.hasOwnProperty.call(themes, theme)) {
				if (typeof (themes[theme]) === "string") {
					this.registerUrl(theme, themes[theme]);
				} else {
					this.registerRules(theme, themes[theme]);
				}
			}
		}
	}

	/**
	 * Register a url
	 * @param {string} name Theme name
	 * @param {string} input URL string
	 * @example registerUrl("light", "light.css")
	 * @example registerUrl("light", "http://example.com/light.css")
	 */
	registerUrl(name: string, input: string): void {
		const url = new Url(input);
		this.set(name, {
			injected: false,
			url: url.toString()
		});
	}

	/**
	 * Register rule
	 * @param {string} name
	 * @param {object} rules
	 * @example registerRules("light", { body: { color: "purple"}})
	 */
	registerRules(name: string, rules: any): void {
		this.set(name, {
			injected: false,
			rules: rules
		});
	}

	/**
	 * Select a theme
	 * @param {string|null} [name] Theme name
	 * @description Use null to reject the current selected theme
	 */
	select(name?: string | null): void {
		const prev = this.current;

		let theme: any;
		if (name) {
			theme = this.get(name);
		} else if (prev && name === null) {
			theme = this.get(prev);
		}
		if (this.current === name || !theme) {
			return;
		}

		this.current = name || null;

		const contents = this.rendition.getContents();
		contents.forEach((content: Contents | undefined) => {
			if (!content) return;
			if (name) {
				if (prev) content.removeClass(prev);
				content.appendClass(name);
				this.append(name, theme, content);
			} else if (prev) {
				content.removeClass(prev);
				this.remove(prev, theme, content);
			}
		});
		/**
		 * Emit which occurs when theme is selected
		 * @event selected
		 * @param {string} name Theme key
		 * @param {object} theme Theme value
		 * @memberof Themes
		 */
		this.emit(EVENTS.THEMES.SELECTED, name, theme);
	}

	/**
	 * Append theme to contents
	 * @param {string} key
	 * @param {object} theme 
	 * @param {Contents} contents
	 * @private
	 */
	append(key: string, theme: any, contents: Contents): void {
		if (theme.url) {
			contents.appendStylesheet(key, theme.url);
			theme.injected = true;
		}
		if (theme.rules) {
			contents.appendStylesheet(key, theme.rules);
			theme.injected = true;
		}
		if (theme.injected) {
			/**
			 * Emit of injected a stylesheet into contents
			 * @event injected
			 * @param {string} key Theme key
			 * @param {object} theme Theme value
			 * @param {Contents} contents
			 * @memberof Themes
			 */
			this.emit(EVENTS.THEMES.INJECTED, key, theme, contents);
		}
	}

	/**
	 * Remove theme from contents
	 * @param {string} key 
	 * @param {object} theme 
	 * @param {Contents} contents 
	 * @private
	 */
	remove(key: string, theme: any, contents: Contents): void {
		if (contents.removeStylesheet(key)) {
			theme.injected = false;
			/**
			 * Emit of rejected a stylesheet into contents
			 * @event rejected
			 * @param {string} key Theme key
			 * @param {object} theme Theme value
			 * @param {Contents} contents
			 * @memberof Themes
			 */
			this.emit(EVENTS.THEMES.REJECTED, key, theme, contents);
		}
	}

	/**
	 * Clear all themes
	 */
	clear(): void {
		this.select(null);
		super.clear();
	}

	/**
	 * Inject all themes into contents
	 * @param {Contents} contents
	 * @private
	 */
	inject(contents: Contents): void {
		if (!this.current) return;
		
		this.forEach((theme, key) => {
			if (this.current === key) {
				this.append(key, theme, contents);
			}
		});

		contents.appendClass(this.current);
	}

	/**
	 * Update all themes into contents
	 * @param {Contents} contents
	 * @private
	 */
	update(contents: Contents): void {
		const rules = this.rules;

		for (const rule in rules) {
			if (Object.prototype.hasOwnProperty.call(rules, rule)) {
				contents.css(rule,
					rules[rule].value,
					rules[rule].priority
				);
			}
		}
	}

	/**
	 * Append rule
	 * @param {string} name
	 * @param {string} value
	 * @param {boolean} [priority=false]
	 */
	appendRule(name: string, value: string, priority: boolean = false): void {
		const rule = {
			value: value,
			priority: priority
		};
		const contents = this.rendition.getContents();
		contents.forEach((content: Contents | undefined) => {
			if (content) {
				content.css(name,
					rule.value,
					rule.priority
				);
			}
		});
		this.rules[name] = rule;
	}

	/**
	 * Remove rule
	 * @param {string} name
	 */
	removeRule(name: string): void {
		delete this.rules[name];
		const contents = this.rendition.getContents();
		contents.forEach((content: Contents | undefined) => {
			if (content) {
				content.css(name);
			}
		});
	}

	/**
	 * Remove all rules
	 */
	removeRules(): void {
		Object.keys(this.rules).forEach((key) => {
			this.removeRule(key);
		});
	}

	/**
	 * Adjust the font size of a rendition
	 * @param {string} size
	 */
	fontSize(size: string): void {
		this.appendRule("font-size", size);
	}

	/**
	 * Adjust the font-family of a rendition
	 * @param {string} f
	 */
	font(f: string): void {
		this.appendRule("font-family", f, true);
	}

	/**
	 * destroy
	 */
	destroy(): void {
		this.clear();
		this.removeRules();
		this.current = undefined as any;
		this.rules = undefined as any;
	}
}

interface Themes extends EventEmitter.Emitter {}
EventEmitter(Themes.prototype);

export default Themes;
