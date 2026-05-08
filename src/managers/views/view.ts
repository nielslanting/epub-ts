import EventEmitter from "event-emitter";
import EpubCFI from "../../epubcfi";
import Section from "../../section";
import Layout from "../../layout";
import Defer from "../../utils/defer";
import Marks from "../../marks-pane/marks";
import Highlight from "../../marks-pane/highlight";
import Underline from "../../marks-pane/underline";
import { uuid } from "../../utils/core";
import { EVENTS } from "../../utils/constants";
import Contents from "../../contents";

export interface ViewSettings {
	ignoreClass?: string;
	forceEvenPages?: boolean;
	method?: string | null;
	sandbox?: string[];
	width?: number;
	height?: number;
	snap?: any;
	[key: string]: any;
}

/**
 * The View base class
 */
class View {
	id: string;
	contents: Contents | any;
	container: HTMLElement;
	displayed: boolean;
	document: Document | null;
	expanding: boolean;
	frame: Element | any;
	marks: Marks | any;
	width: number;
	height: number;
	layout: Layout;
	section: Section;
	settings: ViewSettings;
	size?: { width: number; height: number };
	element?: Element; // Used by some subclasses or Continuous view manager

	/**
	 * Constructor
	 * @param {Layout} layout 
	 * @param {Section} section 
	 * @param {ViewSettings} [options]
	 */
	constructor(layout: Layout, section: Section, options?: ViewSettings) {
		/**
		 * @member {string} id
		 * @memberof View
		 * @readonly
		 */
		this.id = "vi-" + uuid();
		/**
		 * @member {Contents} contents
		 * @memberof View
		 * @readonly
		 */
		this.contents = null as any;
		/**
		 * @member {Element} container
		 * @memberof View
		 * @readonly
		 */
		this.container = null as any;
		/**
		 * @member {boolean} displayed
		 * @memberof View
		 * @readonly
		 */
		this.displayed = false;
		/**
		 * @member {Document} document
		 * @memberof View
		 * @readonly
		 */
		this.document = null;
		/**
		 * @member {boolean} expanding
		 * @memberof View
		 * @readonly
		 */
		this.expanding = false;
		/**
		 * @member {Node} frame
		 * @memberof View
		 * @readonly
		 */
		this.frame = null as any;
		/**
		 * @member {Marks} marks
		 * @memberof View
		 * @readonly
		 */
		this.marks = null;
		/**
		 * @member {number} width
		 * @memberof View
		 * @readonly
		 */
		this.width = 0;
		/**
		 * @member {number} height
		 * @memberof View
		 * @readonly
		 */
		this.height = 0;
		this.layout = layout;
		this.section = section;
		/**
		 * @member {object} settings
		 * @memberof View
		 * @readonly
		 */
		this.settings = options || {};
		this.init();
	}

	/**
	 * Create the view-container
	 * @private
	 */
	init(): void {
		this.container = document.createElement("div");
		this.container.classList.add("view-container");
		this.container.style.height = "0";
		this.container.style.width = "0";
		this.container.style.overflow = "hidden";
		this.container.style.position = "relative";
		if (this.section && this.section.index !== undefined) {
			this.container.setAttribute("ref", String(this.section.index));
		}
	}

	/**
	 * Clear all marks
	 * @returns {number} number of marks
	 */
	clear(): number {
		let len = 0;

		if (this.marks) {
			this.marks.forEach((mark: any, key: string) => {
				if (mark instanceof Highlight) {
					len = this.unhighlight(mark.data["epubcfi"]) ? (len += 1) : len;
				} else {
					len = this.ununderline(mark.data["epubcfi"]) ? (len += 1) : len;
				}
			});
		}
		return len;
	}

	/**
	 * Create frame element
	 * @returns {Element} iframe
	 */
	create(): Element | void {}

	/**
	 * render
	 * @param {function} request 
	 * @returns {Promise<any>} section render
	 */
	render(request: any): Promise<any> {
		const def = new Defer<any>();

		this.create();
		this.section.render(request).then((contents: string | Document) => {
			return this.load(contents);
		}).then((output: any) => {
			this.update();
			def.resolve(output);
		}, (err: any) => {
			/**
			 * @event loaderror
			 * @param {object} err
			 * @memberof View
			 */
			this.emit(EVENTS.VIEWS.LOAD_ERROR, err);
			def.reject(err);
		}).then(() => {
			/**
			 * @event rendered
			 * @param {IframeView|InlineView|View} view
			 * @memberof View
			 */
			this.emit(EVENTS.VIEWS.RENDERED, this);
		});

		return def.promise;
	}

	/**
	 * Reset frame
	 */
	reset(): void {
		if (this.frame) {
			this.frame.style.width = "0";
			this.frame.style.height = "0";
			this.width = 0;
			this.height = 0;
		}
	}

	/**
	 * Update view
	 */
	update(): void {
		if (this.contents) {
			this.contents.format(this.layout);
		}
		this.axis();
		this.mode();
		this.expand();
	}

	/**
	 * Update axis
	 */
	axis(): void {
		if (this.layout.axis === "horizontal") {
			this.container.style.flex = "none";
		} else {
			this.container.style.flex = "initial";
		}
	}

	/**
	 * Update mode
	 * @param {string} [value] 
	 */
	mode(value?: string): void {}

	/**
	 * Expanding
	 */
	expand(): void {
		if (!this.frame || this.expanding || !this.contents) return;

		this.expanding = true;
		const sz = this.contents.textSize();
		const pw = this.layout.pageWidth;

		if (this.layout.flow === "paginated") {
			if (sz.width % pw > 0) {
				sz.width = Math.ceil(sz.width / pw) * pw;
			}

			if (this.settings.forceEvenPages) {
				const columns = (sz.width / pw);
				if (this.layout.divisor > 1 &&
					this.layout.name === "reflowable" &&
					(columns % 2 > 0)) {
					// add a blank page
					sz.width += pw;
				}
			}
		}

		if (this.width !== sz.width ||
			this.height !== sz.height) {
			this.reframe(sz.width, sz.height);
		}

		this.expanding = false;
	}

	/**
	 * reframe
	 * @param {number} width 
	 * @param {number} height 
	 */
	reframe(width: number, height: number): void {
		if (!this.frame) return;

		this.container.style.width = width + "px";
		this.container.style.height = height + "px";

		this.frame.style.width = width + "px";
		this.frame.style.height = height + "px";

		this.width = width;
		this.height = height;

		this.marks && this.marks.render();
	}

	/**
	 * Load frame
	 * @param {string|Document} contents 
	 * @returns {Promise<any>} loading promise
	 */
	load(contents: string | Document): Promise<any> {
		return Promise.resolve();
	}

	/**
	 * Display view
	 * @param {function} request 
	 * @returns {Promise<View>} displayed promise
	 */
	display(request: any): Promise<View> {
		const displayed = new Defer<View>();

		if (this.displayed) {
			displayed.resolve(this);
		} else {
			this.render(request).then(() => {
				/**
				 * @event displayed
				 * @memberof View
				 */
				this.emit(EVENTS.VIEWS.DISPLAYED);
				this.displayed = true;
				displayed.resolve(this);
			}, (err: any) => {
				displayed.reject(err);
			});
		}

		return displayed.promise;
	}

	/**
	 * Show container
	 */
	show(): void {
		this.container.style.visibility = "visible";
		if (this.frame) {
			this.frame.style.visibility = "visible";
		}
		/**
		 * @event shown
		 * @param {View} view
		 * @memberof View
		 */
		this.emit(EVENTS.VIEWS.SHOWN, this);
	}

	/**
	 * Hide container
	 */
	hide(): void {
		this.container.style.visibility = "hidden";
		if (this.frame) {
			this.frame.style.visibility = "hidden";
		}
		/**
		 * @event hidden
		 * @param {View} view
		 * @memberof View
		 */
		this.emit(EVENTS.VIEWS.HIDDEN, this);
	}

	/**
	 * offset
	 * @returns {{ top: number, left: number }}
	 */
	offset(): { top: number, left: number } {
		return {
			top: this.container.offsetTop,
			left: this.container.offsetLeft
		};
	}

	/**
	 * position
	 * @returns {DOMRect}
	 */
	position(): DOMRect {
		return this.container.getBoundingClientRect();
	}

	/**
	 * locationOf
	 * @param {string|EpubCFI} target 
	 * @returns {{ top: number, left: number }}
	 */
	locationOf(target: string | EpubCFI): { top: number, left: number } {
		if (!this.contents) return { left: 0, top: 0 };
		const pos = this.contents.locationOf(target, this.settings.ignoreClass);

		return {
			left: pos.left,
			top: pos.top
		};
	}

	/**
	 * highlight
	 * @param {string} cfiRange 
	 * @param {object} [data={}] 
	 * @param {function} [cb=null] callback function
	 * @param {string} [className='epubjs-hl'] 
	 * @param {object} [styles={}] 
	 * @returns {object|undefined}
	 */
	highlight(cfiRange: string, data: any = {}, cb: any = null, className: string = "epubjs-hl", styles: any = {}): object | undefined {
		if (!this.contents) return;

		data["epubcfi"] = cfiRange;

		if (this.marks === null) {
			this.marks = new Marks(this.frame, this.container);
		}

		const attributes = Object.assign({
			"fill": "yellow",
			"fill-opacity": "0.3",
			"mix-blend-mode": "multiply"
		}, styles);
		const emitter = (e: Event) => {
			/**
			 * @event markClicked
			 * @param {string} cfiRange
			 * @param {object} data
			 * @memberof View
			 */
			this.emit(EVENTS.VIEWS.MARK_CLICKED, cfiRange, data);
		};
		const key = encodeURI("epubjs-hl:" + cfiRange);
		const range = this.contents.range(cfiRange);
		const m = new Highlight(range, {
			className,
			data,
			attributes,
			listeners: [emitter, cb]
		});
		const h = this.marks.appendMark(key, m);

		h.element.setAttribute("ref", className);
		h.element.addEventListener("click", emitter);
		h.element.addEventListener("touchstart", emitter);

		if (cb) {
			h.element.addEventListener("click", cb);
			h.element.addEventListener("touchstart", cb);
		}

		return h;
	}

	/**
	 * unhighlight
	 * @param {string} cfiRange 
	 * @returns {boolean}
	 */
	unhighlight(cfiRange: string): boolean {
		const key = encodeURI("epubjs-hl:" + cfiRange);
		const mark = this.marks && this.marks.get(key);
		let result = false;
		if (mark) {
			mark.listeners.forEach((l: any) => {
				if (l) {
					mark.element.removeEventListener("click", l);
					mark.element.removeEventListener("touchstart", l);
				}
			});
			this.marks.removeMark(key);
			result = true;
		}
		return result;
	}

	/**
	 * underline
	 * @param {string} cfiRange 
	 * @param {object} [data={}] 
	 * @param {function} [cb=null]
	 * @param {string} [className='epubjs-ul'] 
	 * @param {object} [styles={}] 
	 * @returns {object|undefined}
	 */
	underline(cfiRange: string, data: any = {}, cb: any = null, className: string = "epubjs-ul", styles: any = {}): object | undefined {
		if (!this.contents) return;

		data["epubcfi"] = cfiRange;

		if (this.marks === null) {
			this.marks = new Marks(this.frame, this.container);
		}

		const attributes = Object.assign({
			"stroke": "black",
			"stroke-opacity": "0.3",
			"mix-blend-mode": "multiply"
		}, styles);
		const emitter = (e: Event) => {
			/**
			 * @event markClicked
			 * @param {string} cfiRange
			 * @param {object} data
			 * @memberof View
			 */
			this.emit(EVENTS.VIEWS.MARK_CLICKED, cfiRange, data);
		};
		const key = encodeURI("epubjs-ul:" + cfiRange);
		const range = this.contents.range(cfiRange);
		const m = new Underline(range, {
			className,
			data,
			attributes,
			listeners: [emitter, cb]
		});
		const h = this.marks.appendMark(key, m);

		h.element.setAttribute("ref", className);
		h.element.addEventListener("click", emitter);
		h.element.addEventListener("touchstart", emitter);

		if (cb) {
			h.element.addEventListener("click", cb);
			h.element.addEventListener("touchstart", cb);
		}
		return h;
	}

	/**
	 * ununderline
	 * @param {string} cfiRange 
	 * @returns {boolean}
	 */
	ununderline(cfiRange: string): boolean {
		const key = encodeURI("epubjs-ul:" + cfiRange);
		const mark = this.marks && this.marks.get(key);
		let result = false;
		if (mark) {
			mark.listeners.forEach((l: any) => {
				if (l) {
					mark.element.removeEventListener("click", l);
					mark.element.removeEventListener("touchstart", l);
				}
			});
			this.marks.removeMark(key);
			result = true;
		}
		return result;
	}

	/**
	 * Destroy the View object
	 */
	destroy(): void {
		if (this.marks && this.displayed) {
			this.marks.element && this.marks.element.remove();
			this.marks.clear();
			this.marks = undefined;
		}
		if (this.displayed) {
			this.displayed = false;
			if (this.frame && this.container.contains(this.frame)) {
				this.container.removeChild(this.frame);
			}
			this.container = undefined as any;
			if (this.contents) {
				this.contents.destroy();
				this.contents = undefined;
			}
		}
		this.expanding = false;
		this.document = undefined as any;
		this.frame = undefined as any;
		this.size = undefined;
		this.id = undefined as any;
		this.width = undefined as any;
		this.height = undefined as any;
		this.settings = undefined as any;
	}
}

interface View extends EventEmitter.Emitter {}
EventEmitter(View.prototype);

export default View;
