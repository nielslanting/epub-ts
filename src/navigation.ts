import Landmarks from "./navigation/landmarks";
import PageList from "./navigation/pagelist";
import Toc from "./navigation/toc";
import { qsa } from "./utils/core";

/**
 * Navigation Parser
 * @link https://www.w3.org/TR/epub/#sec-nav
 */
class Navigation {
	landmarks: Landmarks;
	pageList: PageList;
	toc: Toc;

	/**
	 * Constructor
	 */
	constructor() {
		/**
		 * Landmarks
		 * @member {Landmarks} landmarks
		 * @memberof Navigation
		 * @readonly
		 */
		this.landmarks = new Landmarks();
		/**
		 * List of numbered pages
		 * @member {PageList} pageList
		 * @memberof Navigation
		 * @readonly
		 */
		this.pageList = new PageList();
		/**
		 * Table of Contents
		 * @member {Toc} toc
		 * @memberof Navigation
		 * @readonly
		 */
		this.toc = new Toc();
	}

	/**
	 * Clear all navigation parts
	 */
	clear(): void {
		this.landmarks.clear();
		this.pageList.clear();
		this.toc.clear();
	}

	/**
	 * Parse navigation document
	 * @param {Document} doc html OR xhtml OR ncx
	 * @returns {Promise<Navigation>}
	 */
	async parse(doc: Document): Promise<Navigation> {
		const tasks: Promise<any>[] = [];
		const element = doc.documentElement;

		if (element.tagName === "html") {
			const items = qsa(doc, "nav");
			items.forEach((nav: Element) => {
				const type = nav.getAttribute("epub:type");
				switch (type) {
					case "landmarks":
						tasks.push(this.landmarks.parse(nav));
						break;
					case "page-list":
						tasks.push(this.pageList.parse(nav));
						break;
					case "toc":
						tasks.push(this.toc.parse(nav));
						break;
				}
			});
		} else if (element.tagName === "ncx") {
			const items = Array.from(element.children);
			items.forEach((item: Element) => {
				switch (item.tagName) {
					case "navMap":
						tasks.push(this.toc.parse(item));
						break;
					case "pageList":
						tasks.push(this.pageList.parse(item));
						break;
				}
			});
		}

		return Promise.all(tasks).then(() => {
			return this;
		});
	}

	/**
	 * Load navigation object from JSON
	 * @param {Record<string, any>} data 
	 * @returns {Promise<Navigation>}
	 */
	async load(data: Record<string, any>): Promise<Navigation> {
		const tasks: Promise<any>[] = [];
		tasks.push(this.landmarks.parse(data["landmarks"] || []));
		tasks.push(this.pageList.parse(data["page-list"] || []));
		tasks.push(this.toc.parse(data["toc"] || []));
		return Promise.all(tasks).then(() => {
			return this;
		});
	}

	/**
	 * forEach pass through
	 * @param {any[]} args
	 */
	forEach(...args: any[]): void {
		this.toc.forEach(...args);
	}

	/**
	 * Destroy the Navigation object
	 */
	destroy(): void {
		this.clear();
		this.landmarks.destroy();
		this.landmarks = undefined as any;
		this.pageList.destroy();
		this.pageList = undefined as any;
		this.toc.destroy();
		this.toc = undefined as any;
	}
}

export default Navigation;
