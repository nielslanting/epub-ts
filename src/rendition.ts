import EventEmitter from "event-emitter";
import Annotations from "./annotations";
import Contents from "./contents";
import EpubCFI from "./epubcfi";
import Section from "./section";
import Layout from "./layout";
import Themes from "./themes";
import Book from "./book";
import Defer from "./utils/defer";
import Hook from "./utils/hook";
import Viewport from "./viewport";
import Views from "./managers/helpers/views";
import Queue from "./utils/queue";
import { extend, isFloat } from "./utils/core";
import { EPUBJS_VERSION, EVENTS, DOM_EVENTS } from "./utils/constants";
import DefaultViewManager from "./managers/default/index";
import ContinuousViewManager from "./managers/continuous/index";

export interface RenditionOptions {
	width?: string | number | null;
	height?: string | number | null;
	ignoreClass?: string;
	manager?: string | Function;
	view?: string | Function;
	flow?: string | null;
	method?: string;
	layout?: string | null;
	spread?: string | null;
	direction?: string | null;
	pageWidth?: number;
	pageHeight?: number;
	minSpreadWidth?: number;
	stylesheet?: string | null;
	script?: string | null;
	snap?: boolean | object | null;
	sandbox?: string[];
	[key: string]: any;
}

export interface LocationRange {
	atStart?: boolean;
	atEnd?: boolean;
	start?: {
		cfi: string;
		href?: string;
		index?: number;
		displayed?: {
			page: number;
			total: number;
		};
		location?: number;
		percentage?: number;
		page?: number;
	};
	end?: {
		cfi: string;
		href?: string;
		index?: number;
		displayed?: {
			page: number;
			total: number;
		};
		location?: number;
		percentage?: number;
		page?: number;
	};
}

export interface RenditionHooks {
	content: Hook;
	display: Hook;
	layout: Hook;
	render: Hook;
	show: Hook;
	unloaded: Hook;
}

interface Rendition extends EventEmitter.Emitter {}

/**
 * Rendition class
 * @description
 * Displays an Epub as a series of Views for each Section.
 * Requires Manager and View class to handle specifics of rendering
 * the section content.
 */
class Rendition {
	settings: RenditionOptions;
	book: Book;
	hooks: RenditionHooks;
	annotations: Annotations;
	themes: Themes;
	epubcfi: EpubCFI;
	location: LocationRange | null;
	starting: Defer<void>;
	started: Promise<void>;
	q: Queue;
	layout?: Layout;
	viewport?: Viewport;
	manager?: any;

	/**
	 * Constructor
	 * @param {Book} book
	 * @param {RenditionOptions} [options]
	 */
	constructor(book: Book, options?: RenditionOptions) {
		/**
		 * @member {object} settings
		 * @memberof Rendition
		 * @readonly
		 */
		this.settings = extend({
			width: null,
			height: null,
			manager: "default",
			view: "iframe",
			flow: null,
			method: "write", // the 'baseUrl' value is set from the 'book.settings.replacements' property
			layout: null,
			spread: null,
			minSpreadWidth: 800,
			script: null,
			snap: null,
			direction: null, // TODO: implement to 'auto' detection
			ignoreClass: "",
			sandbox: [],
			stylesheet: null
		}, options || {});

		this.book = book;
		/**
		 * Adds Hook methods to the Rendition prototype
		 * @member {object} hooks
		 * @property {Hook} hooks.content
		 * @property {Hook} hooks.display
		 * @property {Hook} hooks.layout
		 * @property {Hook} hooks.render
		 * @property {Hook} hooks.show
		 * @property {Hook} hooks.unloaded
		 * @memberof Rendition
		 */
		this.hooks = {
			content: new Hook(this),
			display: new Hook(this),
			layout: new Hook(this),
			render: new Hook(this),
			show: new Hook(this),
			unloaded: new Hook(this)
		}
		this.hooks.content.register(this.handleLinks.bind(this));
		this.hooks.content.register(this.passEvents.bind(this));
		this.hooks.content.register(this.adjustImages.bind(this));

		(this.book as any).sections.hooks.content.register(this.injectIdentifier.bind(this));

		if (this.settings.stylesheet) {
			(this.book as any).sections.hooks.content.register(this.injectStylesheet.bind(this));
		}

		if (this.settings.script) {
			(this.book as any).sections.hooks.content.register(this.injectScript.bind(this));
		}
		/**
		 * @member {Annotations} annotations
		 * @memberof Rendition
		 * @readonly
		 */
		this.annotations = new Annotations(this as any);
		/**
		 * @member {Themes} themes
		 * @memberof Rendition
		 * @readonly
		 */
		this.themes = new Themes(this as any);
		/**
		 * @member {EpubCFI} epubcfi
		 * @memberof Rendition
		 * @readonly
		 */
		this.epubcfi = new EpubCFI();
		/**
		 * A Rendered Location Range
		 * @type {LocationRange | null}
		 * @memberof Rendition
		 */
		this.location = null;
		this.starting = new Defer<void>();
		/**
		 * returns after the rendition has started
		 * @member {Promise<any>} started
		 * @memberof Rendition
		 */
		this.started = this.starting.promise;
		this.q = new Queue(this);
		// Hold queue until book is opened
		this.q.enqueue((this.book as any).opened);
		// Block the queue until rendering is started
		this.q.enqueue(this.start.bind(this));
	}

	/**
	 * Require the manager from passed string, or as a class function
	 * @param {string|function} manager 
	 * @return {any} manager
	 * @private
	 */
	requireManager(manager: string | Function): any {

		let ret;

		// If manager is a string, try to load from imported managers
		if (typeof manager === "string") {
			switch (manager) {
				case "continuous":
					ret = ContinuousViewManager;
					break;
				default:
					ret = DefaultViewManager;
					break;
			}
		} else if (typeof manager === "function") {
			// otherwise, assume we were passed a class function
			ret = manager;
		}

		return ret;
	}

	/**
	 * Start the rendering
	 * @private
	 */
	start() {

		const props = this.determineLayoutProperties();
		/**
		 * @member {Layout} layout
		 * @memberof Rendition
		 * @readonly
		 */
		this.layout = new Layout(props);
		this.layout.on(EVENTS.LAYOUT.UPDATED, (props: Layout, changed: any) => {
			/**
			 * Emit of updated the Layout state
			 * @event layout
			 * @param {Layout} props
			 * @param {object} changed
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.LAYOUT, props, changed);
		});
		/**
		 * @member {Viewport} viewport
		 * @memberof Rendition
		 * @readonly
		 */
		this.viewport = new Viewport(this.layout as any);
		this.viewport.on(EVENTS.VIEWPORT.RESIZED, (rect: DOMRect) => {

			if (this.layout!.flow === "paginated") {
				this.layout!.set({
					width: rect.width,
					height: rect.height
				});
			} else if (this.layout!.axis === "horizontal") {
				this.layout!.set({
					height: rect.height
				});
			} else if (this.layout!.axis === "vertical") {
				this.layout!.set({
					width: rect.width,
				});
			}
			if (!this.location) return;
			/**
			 * Emit that the rendition has been resized
			 * @event resized
			 * @param {object} rect
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.RESIZED, rect);
		});
		this.viewport.on(EVENTS.VIEWPORT.ORIENTATION_CHANGE, (target: any) => {
			/**
			 * @event orientationchange
			 * @param {object} target
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.ORIENTATION_CHANGE, target);
		});

		if (!this.manager) {
			const managerClass = this.requireManager(this.settings.manager!);
			const options = {
				snap: this.settings.snap,
				view: this.settings.view,
				method: this.settings.method,
				sandbox: this.settings.sandbox,
				ignoreClass: this.settings.ignoreClass
			};
			this.manager = new managerClass(this.book, options);
		}

		this.manager.on(EVENTS.MANAGERS.ADDED, this.afterDisplayed.bind(this));
		this.manager.on(EVENTS.MANAGERS.REMOVED, this.afterRemoved.bind(this));
		this.manager.on(EVENTS.MANAGERS.RESIZED, this.onResized.bind(this));
		this.manager.on(EVENTS.MANAGERS.RELOCATED, this.relocated.bind(this));
		/**
		 * Emit that rendering has started
		 * @event started
		 * @memberof Rendition
		 */
		this.emit(EVENTS.RENDITION.STARTED);
		(navigator as any).epubReadingSystem = {
			name: "epub-js",
			version: EPUBJS_VERSION,
			layoutStyle: this.layout.style,
			hasFeature: (name: string) => {
				switch (name) {
					case "dom-manipulation":
						return true;
					case "layout-changes":
						return true;
					case "touch-events":
						return true;
					case "mouse-events":
						return true;
					case "keyboard-events":
						return true;
					case "spine-scripting":
						return false;
					default:
						return false;
				}
			}
		};
		this.starting.resolve();
	}

	/**
	 * Attach to viewport container
	 * @param {Element|string} element viewport element
	 * @return {Promise<any>}
	 * @description
	 * Call to attach the container to an element in the dom.
	 * Container must be attached before rendering can begin.
	 */
	attachTo(element: Element | string): Promise<any> {

		return this.q.enqueue(() => {
			// Start rendering
			this.manager.render(element, {
				width: this.settings.width,
				height: this.settings.height
			});
			/**
			 * Emit that rendering has attached to an element
			 * @event attached
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.ATTACHED);
		});
	}

	/**
	 * Display a point in the book
	 * @param {string|number} [target] `Section.index` OR `Section.idref` OR `Section.href` OR EpubCFI
	 * @example rendition.display()
	 * @example rendition.display(3)
	 * @example rendition.display("#chapter_001")
	 * @example rendition.display("chapter_001.xhtml")
	 * @example rendition.display("epubcfi(/6/8!/4/2/16/1:0)")
	 * @return {Promise<Section>}
	 * @description
	 * The request will be added to the rendering Queue, so it will wait until 
	 * book is opened, rendering started and all other rendering tasks have 
	 * finished to be called.
	 */
	display(target?: string | number): Promise<Section> {

		return this.q.enqueue(this._display.bind(this), target);
	}

	/**
	 * Tells the manager what to display immediately
	 * @param {string|number} [target]
	 * @return {Promise<Section>}
	 * @private
	 */
	_display(target?: string | number): Promise<Section> {

		const displaying = new Defer<Section>();

		// Check if this is a book percentage
		if ((this.book as any).locations.size && isFloat(target)) {
			target = (this.book as any).locations.cfiFromPercentage(parseFloat(target as string));
		}

		const section = (this.book as any).sections.get(target);

		if (!section) {
			displaying.reject(new Error("No Section Found"));
			return displaying.promise;
		}

		this.manager.display(section, target).then(() => {

			displaying.resolve(section);
			/**
			 * Emit that a section has been displayed
			 * @event displayed
			 * @param {Section} section
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.DISPLAYED, section);
		}, (err: Error) => {
			/**
			 * Emit that has been an error displaying
			 * @event displayError
			 * @param {Error} err
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.DISPLAY_ERROR, err);
		}).then(() => {
			this.viewport!.update();
		});

		return displaying.promise;
	}

	/**
	 * Report what section has been displayed
	 * @param {object} view
	 * @private
	 */
	afterDisplayed(view: any) {

		view.on(EVENTS.VIEWS.MARK_CLICKED, (cfiRange: string, data: any) => {
			this.triggerMarkEvent(cfiRange, data, view.contents)
		});

		this.hooks.render.trigger(view, this).then(() => {
			if (view.contents) {
				this.hooks.content.trigger(view.contents, this).then(() => {
					/**
					 * Emit that a section has been rendered
					 * @event rendered
					 * @param {View} view
					 * @memberof Rendition
					 */
					this.emit(EVENTS.RENDITION.RENDERED, view);
				});
			} else {
				this.emit(EVENTS.RENDITION.RENDERED, view);
			}
		});
	}

	/**
	 * Report what has been removed
	 * @param {object} view
	 * @private
	 */
	afterRemoved(view: any) {

		this.hooks.unloaded.trigger(view, this).then(() => {
			/**
			 * Emit that a section has been removed
			 * @event removed
			 * @param {View} view
			 * @memberof Rendition
			 */
			this.emit(EVENTS.RENDITION.REMOVED, view);
		})
	}

	/**
	 * Report resize events and display the last seen location
	 * @param {object} view 
	 * @private
	 */
	onResized(view: any): Promise<any> {

		return this.adjustImages(view.contents);
	}

	/**
	 * Move the Rendition to a specific offset
	 * Usually you would be better off calling display()
	 * @param {object} offset
	 */
	moveTo(offset: any) {

		this.manager.moveTo(offset);
	}

	/**
	 * Resize viewport container
	 * @param {number|string} [width]
	 * @param {number|string} [height]
	 * @returns {{ width: number, height: number }}
	 * @example rendition.resize(800, 600)
	 * @example rendition.resize("90%", 600)
	 */
	resize(width?: number | string, height?: number | string): { width: number, height: number } {

		return this.viewport!.size(width, height);
	}

	/**
	 * Clear all rendered views
	 */
	clear() {

		this.manager.clear();
	}

	/**
	 * Go to the next "page" in the rendition
	 * @return {Promise<any>}
	 */
	next(): Promise<any> {

		return this.q.enqueue(this.manager.next.bind(this.manager));
	}

	/**
	 * Go to the previous "page" in the rendition
	 * @return {Promise<any>}
	 */
	prev(): Promise<any> {

		return this.q.enqueue(this.manager.prev.bind(this.manager));
	}

	/**
	 * Determine the Layout properties from metadata and settings
	 * @link http://www.idpf.org/epub/301/spec/epub-publications.html#meta-properties-rendering
	 * @return {object} Layout properties
	 * @private
	 */
	determineLayoutProperties(): any {

		const { metadata, direction } = (this.book as any).packaging;
		return {
			name: this.settings.layout || metadata.get("layout"),
			flow: this.settings.flow || metadata.get("flow"),
			spread: this.settings.spread || metadata.get("spread"),
			viewport: metadata.get("viewport"),
			direction: this.settings.direction || direction || "ltr",
			orientation: this.settings.orientation || metadata.get("orientation"),
			minSpreadWidth: this.settings.minSpreadWidth,
			pageWidth: this.settings.pageWidth,
			pageHeight: this.settings.pageHeight
		}
	}

	/**
	 * Layout configuration
	 * @param {object} options
	 */
	updateLayout(options: any) {

		this.layout!.set(options);
	}

	/**
	 * Get the Current Location object
	 * @return {object|Promise<object>} location (may be a promise)
	 */
	currentLocation(): any {

		const location = this.manager.currentLocation(); // [{}]
		if (location && location.then && typeof location.then === "function") {
			return location.then((result: any) => {
				return this.located(result);
			});
		} else if (location) {
			return this.located(location);
		}
	}

	/**
	 * Creates a Rendition#locationRange from location passed by the Manager
	 * @param {object[]} target Location sections
	 * @returns {object}
	 * @private
	 */
	located(target: any[]): LocationRange | undefined {

		if (target.length === 0) return {};

		const start = target[0];
		const end = target[target.length - 1];
		const loc: LocationRange = {
			atStart: false,
			atEnd: false,
			start: {
				cfi: start.mapping.start,
				href: start.href,
				index: start.index,
				displayed: {
					page: start.pages[0],
					total: start.total
				}
			},
			end: {
				cfi: end.mapping.end,
				href: end.href,
				index: end.index,
				displayed: {
					page: end.pages[end.pages.length - 1],
					total: end.total
				}
			}
		};

		const locations = (this.book as any).locations;
		if (locations.size) {
			const locStart = locations.locationFromCfi(start.mapping.start);
			const locEnd = locations.locationFromCfi(end.mapping.end);

			if (locStart !== -1) {
				loc.start!.location = locStart;
				loc.start!.percentage = locations.percentageFromLocation(locStart);
			}
			if (locEnd !== -1) {
				loc.end!.location = locEnd;
				loc.end!.percentage = locations.percentageFromLocation(locEnd);
			}
		}

		const pageList = (this.book as any).navigation.pageList;
		if (pageList && pageList.length) {
			const pageStart = pageList.pageFromCfi(start.mapping.start);
			const pageEnd = pageList.pageFromCfi(end.mapping.end);

			if (pageStart !== -1) {
				loc.start!.page = pageStart;
			}
			if (pageEnd !== -1) {
				loc.end!.page = pageEnd;
			}
		}

		const startPage = loc.start!.displayed!.page;
		if ((this.book as any).sections.first().index === start.index &&
			startPage === 0) {
			loc.atStart = true;
		}

		const endPage = loc.end!.displayed!.page;
		if ((this.book as any).sections.last().index === end.index &&
			endPage === loc.end!.displayed!.total - 1) {
			loc.atEnd = true;
		}

		return loc;
	}

	/**
	 * relocated event handler
	 * @fires relocated
	 * @param {object[]} loc 
	 * @private
	 */
	relocated(loc: any[]) {

		const located = this.located(loc);
		if (!located || (!located.start || !located.end)) {
			return;
		}
		this.location = located;
		/**
		 * @event relocated
		 * @param {object} location
		 * @memberof Rendition
		 */
		this.emit(EVENTS.RENDITION.RELOCATED, this.location);
	}

	/**
	 * Pass the events from a view's Contents
	 * @param {Contents} contents contents
	 * @private
	 */
	passEvents(contents: Contents) {

		DOM_EVENTS.forEach((e) => {
			contents.on(e, (ev: Event) => this.triggerViewEvent(ev, contents));
		});

		contents.on(EVENTS.CONTENTS.SELECTED, (e: string) => this.triggerSelectedEvent(e, contents));
	}

	/**
	 * Emit events passed by a view
	 * @param {Event} e
	 * @param {Contents} contents
	 * @private
	 */
	triggerViewEvent(e: Event, contents: Contents) {

		this.emit(e.type, e, contents);
	}

	/**
	 * Emit a selection event's CFI Range passed from a a view
	 * @param {string} cfirange
	 * @param {Contents} contents
	 * @private
	 */
	triggerSelectedEvent(cfirange: string, contents: Contents) {
		/**
		 * Emit that a text selection has occurred
		 * @event selected
		 * @param {string} cfirange
		 * @param {Contents} contents
		 * @memberof Rendition
		 */
		this.emit(EVENTS.RENDITION.SELECTED, cfirange, contents);
	}

	/**
	 * Emit a markClicked event with the cfiRange and data from a mark
	 * @param {string} cfiRange
	 * @param {object} data 
	 * @param {Contents} contents 
	 * @private
	 */
	triggerMarkEvent(cfiRange: string, data: any, contents: Contents) {
		/**
		 * Emit that a mark was clicked
		 * @event markClicked
		 * @param {EpubCFI} cfiRange
		 * @param {object} data
		 * @param {Contents} contents
		 * @memberof Rendition
		 */
		this.emit(EVENTS.RENDITION.MARK_CLICKED, cfiRange, data, contents);
	}

	/**
	 * Get a Range from a Visible CFI
	 * @param {string} epubcfi EpubCfi string
	 * @param {string} ignoreClass
	 * @return {Range|undefined}
	 */
	getRange(epubcfi: string, ignoreClass?: string): Range | undefined {

		const cfi = new EpubCFI(epubcfi);
		const found = this.manager.visible().filter((view: any) => {
			if (cfi.spinePos === view.section.index) return true;
		});

		// Should only every return 1 item
		if (found.length) {
			return found[0].contents.range(cfi, ignoreClass);
		}
	}

	/**
	 * Hook to adjust images to fit in columns
	 * @param {Contents} contents
	 * @returns {Promise<Node|null>}
	 * @private
	 */
	adjustImages(contents: Contents): Promise<Node | null> {

		const content = contents ? contents.content : null;
		if (!content) {
			return Promise.resolve(null);
		}
		const padding = {
			top: parseFloat(content.style.paddingTop || "0"),
			bottom: parseFloat(content.style.paddingBottom || "0"),
			left: parseFloat(content.style.paddingLeft || "0"),
			right: parseFloat(content.style.paddingRight || "0")
		};
		const paddingX = padding.left + padding.right;
		const paddingY = padding.top + padding.bottom;
		const width = (this.layout!.columnWidth ? (this.layout!.columnWidth - paddingX) + "px" : "100%") + " !important";
		const height = (content.offsetHeight - paddingY) + "px !important";

		return contents.appendStylesheet("images", {
			"img": {
				"max-width": width,
				"max-height": height,
				"object-fit": "contain",
				"page-break-inside": "avoid",
				"break-inside": "avoid",
				"box-sizing": "border-box"
			},
			"svg": {
				"max-width": width,
				"max-height": height,
				"page-break-inside": "avoid",
				"break-inside": "avoid"
			}
		});
	}

	/**
	 * Get the Contents object of each rendered view
	 * @returns {Array<Contents>}
	 */
	getContents(): Array<Contents> {

		return this.manager ? this.manager.getContents() : [];
	}

	/**
	 * Get the views member from the manager
	 * @returns {Views|Array<any>}
	 */
	views(): Views | Array<any> {

		const views = this.manager ? this.manager.views : undefined;
		return views || [];
	}

	/**
	 * Hook to handle link clicks in rendered content
	 * @param {Contents} contents
	 * @private
	 */
	handleLinks(contents: Contents) {

		if (contents) {
			contents.on(EVENTS.CONTENTS.LINK_CLICKED, (href: string) => {
				this.display(href);
			});
		}
	}

	/**
	 * Hook to handle injecting stylesheet before
	 * a Section is serialized
	 * @param {Document} doc
	 * @param {Section} section
	 * @private
	 */
	injectStylesheet(doc: Document, section: Section) {

		const style = doc.createElement("link");
		style.setAttribute("type", "text/css");
		style.setAttribute("rel", "stylesheet");
		style.setAttribute("href", this.settings.stylesheet!);
		doc.getElementsByTagName("head")[0].appendChild(style);
	}

	/**
	 * Hook to handle injecting scripts before
	 * a Section is serialized
	 * @param {Document} doc
	 * @param {Section} section
	 * @private
	 */
	injectScript(doc: Document, section: Section) {

		const script = doc.createElement("script");
		script.setAttribute("type", "text/javascript");
		script.setAttribute("src", this.settings.script!);
		script.textContent = " "; // Needed to prevent self closing tag
		doc.getElementsByTagName("head")[0].appendChild(script);
	}

	/**
	 * Hook to handle the document identifier before a Section is serialized
	 * @param {Document} doc
	 * @param {Section} section 
	 * @private
	 */
	injectIdentifier(doc: Document, section: Section) {

		const ident = (this.book as any).packaging.metadata.get("identifier");
		const meta = doc.createElement("meta");
		meta.setAttribute("name", "dc.relation.ispartof");
		if (ident) meta.setAttribute("content", ident);
		doc.getElementsByTagName("head")[0].appendChild(meta);
	}

	/**
	 * Remove and Clean Up the Rendition
	 */
	destroy() {

		this.q.destroy();
		this.layout!.destroy();
		this.themes.destroy();
		this.viewport!.destroy();
		this.manager.destroy();
		this.hooks.display.clear();
		this.hooks.content.clear();
		this.hooks.layout.clear();
		this.hooks.render.clear();
		this.hooks.show.clear();
		this.hooks.unloaded.clear();
		(this.hooks as any) = undefined;
		(this.layout as any) = undefined;
		(this.themes as any) = undefined;
		(this.manager as any) = undefined;
		(this.epubcfi as any) = undefined;
		(this.started as any) = undefined;
		(this.starting as any) = undefined;
		(this.viewport as any) = undefined;
		(this.q as any) = undefined;
	}
}

EventEmitter(Rendition.prototype);

export default Rendition;