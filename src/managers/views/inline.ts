import Contents from "../../contents";
import Section from "../../section";
import Layout from "../../layout";
import Defer from "../../utils/defer";
import {
	extend, 
	qs, 
	parse
} from "../../utils/core";
import View, { ViewSettings } from "./view";

/**
 * InlineView class
 * @extends {View}
 */
class InlineView extends View {
	settings: ViewSettings;
	frame: HTMLDivElement | any;
	width: number;
	height: number;
	document: Document | null;
	contents: Contents | any;

	/**
	 * Constructor
	 * @param {Layout} layout 
	 * @param {Section} section 
	 * @param {ViewSettings} [options]
	 */
	constructor(layout: Layout, section: Section, options?: ViewSettings) {
		super(layout, section, options);

		this.settings = extend({
			width: 0,
			height: 0,
			ignoreClass: ""
		}, options || {});
	}

	/**
	 * Create div element
	 * @returns {HTMLDivElement} div
	 * @override
	 */
	create(): HTMLDivElement {
		this.frame = document.createElement("div") as HTMLDivElement;
		this.frame.id = this.id;
		this.frame.style.overflow = "hidden";
		this.frame.style.border = "none";
		this.frame.style.wordSpacing = "initial";
		this.frame.style.lineHeight = "initial";
		this.width = 0;
		this.height = 0;
		return this.frame;
	}

	/**
	 * Load view
	 * @param {string|Document} contents 
	 * @returns {Promise<any>} loading promise
	 * @override
	 */
	load(contents: string | Document): Promise<any> {
		const loading = new Defer<any>();

		if (!this.frame) {
			loading.reject(new Error("No Iframe Available"));
			return loading.promise;
		}

		let doc: Document;
		if (typeof contents === "string") {
			doc = parse(contents, "text/html");
		} else {
			doc = contents;
		}
		const body = qs(doc, "body");

		this.container.appendChild(this.frame);
		this.document = this.frame.ownerDocument;

		if (!this.document) {
			loading.reject(new Error("No Document Available"));
			return loading.promise;
		}

		this.contents = new Contents(this.document, this.frame);
		if (body) {
			this.frame.innerHTML = body.innerHTML;
		}

		loading.resolve(this.contents);
		return loading.promise;
	}
}

export default InlineView;
