import Contents from "../../contents";
import Section from "../../section";
import Layout from "../../layout";
import Defer from "../../utils/defer";
import { EVENTS } from "../../utils/constants";
import {
	extend,
	createBlobUrl,
	revokeBlobUrl
} from "../../utils/core";
import View, { ViewSettings } from "./view";

/**
 * IframeView class
 * @extends {View}
 */
class IframeView extends View {
	settings: ViewSettings;
	blobUrl: string | null;
	method: string;
	writingMode: string;
	frame: HTMLIFrameElement | any;
	width: number;
	height: number;
	document: Document | null;
	contents: Contents | any;

	/**
	 * Constructor
	 * @param {Layout} layout ref
	 * @param {Section} section ref
	 * @param {ViewSettings} [options]
	 */
	constructor(layout: Layout, section: Section, options?: ViewSettings) {
		super(layout, section, options);

		this.settings = extend({
			method: null,
			sandbox: [],
			forceEvenPages: false,
			ignoreClass: ""
		}, options || {});
		this.blobUrl = null;
		/**
		 * Load method
		 * @member {string} method
		 * @memberof IframeView
		 * @readonly
		 */
		this.method = this.settings.method || "write";
		/**
		 * @member {string} writingMode
		 * @memberof IframeView
		 * @readonly
		 */
		this.writingMode = "";
	}

	/**
	 * Create iframe element
	 * @returns {HTMLIFrameElement} iframe
	 * @override
	 */
	create(): HTMLIFrameElement {
		this.frame = document.createElement("iframe") as HTMLIFrameElement;
		this.frame.id = this.id;
		(this.frame as any).seamless = "seamless";
		this.frame.style.overflow = "hidden";
		this.frame.style.border = "none";
		this.frame.style.width = "0";
		this.frame.style.height = "0";
		
		if (this.settings.sandbox && Array.isArray(this.settings.sandbox)) {
			this.settings.sandbox.forEach((p: string) => p && (this.frame.sandbox.add(p)));
		}
		this.frame.setAttribute("enable-annotation", "true");
		this.width = 0;
		this.height = 0;
		return this.frame;
	}

	/**
	 * Update writing mode
	 * @param {string} [value] 
	 * @override
	 */
	mode(value?: string): void {
		const mode = value || (this.contents && this.contents.mode) || "";

		if (this.writingMode !== mode) {
			this.writingMode = mode;
			this.emit(EVENTS.VIEWS.WRITING_MODE, mode);
		}
	}

	/**
	 * Load iframe
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

		this.container.appendChild(this.frame);
		this.document = this.frame.contentDocument;
		this.frame.onload = (e: Event) => this.onLoad(e, loading);

		if (!this.document) {
			loading.reject(new Error("No Document Available"));
			return loading.promise;
		} else if (this.method === "blobUrl" && typeof contents === "string") {
			this.blobUrl = createBlobUrl(contents, "application/xhtml+xml");
			this.frame.src = this.blobUrl;
		} else if (this.method === "srcdoc" && typeof contents === "string") {
			this.frame.srcdoc = contents;
		} else if (typeof contents === "string") {
			this.document.open();
			this.document.write("<!DOCTYPE html>");
			this.document.write(contents);
			this.document.close();
		} else {
            // Assume Document
            const s = new XMLSerializer();
            const xmlString = s.serializeToString(contents);
            this.document.open();
			this.document.write("<!DOCTYPE html>");
			this.document.write(xmlString);
			this.document.close();
        }

		return loading.promise;
	}

	/**
	 * onLoad
	 * @param {Event} event 
	 * @param {Defer<any>} defer 
	 */
	onLoad(event: Event, defer: Defer<any>): void {
		this.document = (event.target as HTMLIFrameElement).contentDocument;
		if (!this.document) {
			defer.reject(new Error("No Document loaded"));
			return;
		}
		
		this.contents = new Contents(this.document, this.document.body, this.section);

		let link = this.document.querySelector("link[rel='canonical']");
		if (link) {
			link.setAttribute("href", this.section.canonical || "");
		} else {
			link = this.document.createElement("link");
			link.setAttribute("rel", "canonical");
			link.setAttribute("href", this.section.canonical || "");
			this.document.head.appendChild(link);
		}

		this.contents.on(EVENTS.CONTENTS.RESIZED, (rect: any) => {
			/**
			 * @event resized
			 * @param {object} rect
			 * @memberof IframeView
			 */
			this.emit(EVENTS.VIEWS.RESIZED, rect);
		});

		defer.resolve(this.contents);
	}

	/**
	 * Show container
	 * @override
	 */
	show(): void {
		if (this.frame) {
			// Remind Safari to redraw the iframe
			this.frame.style.transform = "translateZ(0)";
			this.frame.style.transform = null;
		}
		super.show();
	}

	/**
	 * Destroy the IframeView object
	 * @override
	 */
	destroy(): void {
		if (this.blobUrl) {
			revokeBlobUrl(this.blobUrl);
			this.blobUrl = null;
		}

		if (this.displayed) {
			super.destroy();
			this.method = undefined as any;
			this.writingMode = undefined as any;
		}
	}
}

export default IframeView;
