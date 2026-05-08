import Book from "../../book";
import View from "../views/view";
import Section from "../../section";
import { extend } from "../../utils/core";
import Defer from "../../utils/defer";
import DefaultViewManager, { DefaultViewManagerOptions } from "../default";
import Snap from "../helpers/snap";
import { EVENTS } from "../../utils/constants";

const AXIS_H = "horizontal";

export interface ContinuousViewManagerOptions extends DefaultViewManagerOptions {
	axis?: string | null;
	offsetDelta?: number;
	afterScrolledTimeout?: number;
}

/**
 * Continuous view manager
 * @extends {DefaultViewManager}
 */
class ContinuousViewManager extends DefaultViewManager {
	name: string;
	settings: ContinuousViewManagerOptions;
	snapper?: Snap;
	trimTimeout?: any;
	ignore?: boolean;
	scrollDeltaVert?: number;
	scrollDeltaHorz?: number;
	prevScrollTop?: number;
	prevScrollLeft?: number;
	scrollTimeout?: any;

	/**
	 * Constructor
	 * @param {Book} book
	 * @param {ContinuousViewManagerOptions} [options]
	 */
	constructor(book: Book, options?: ContinuousViewManagerOptions) {
		super(book, options);
		/**
		 * @member {string} name
		 * @memberof ContinuousViewManager
		 * @readonly
		 */
		this.name = "continuous";
		this.settings = extend({
			axis: null,
			snap: null,
			view: "iframe",
			method: null,
			offset: 500,
			offsetDelta: 250,
			ignoreClass: "",
			forceEvenPages: false,
			afterScrolledTimeout: 10
		}, options || {});
	}

	/**
	 * render
	 * @param {Element|string} element viewport element
	 * @param {object} size 
	 * @override
	 */
	render(element: Element | string, size: { width: string | number, height: string | number }): void {
		super.render(element, size);

		if (this.paginated && this.settings.snap) {
			this.snapper = new Snap(this, this.settings.snap);
		}
	}

	/**
	 * display
	 * @param {Section} section 
	 * @param {string|number} [target] 
	 * @returns {Promise<View|null>} displaying promise
	 * @override
	 */
	async display(section: Section, target?: string | number): Promise<View | null> {
		return super.display(section, target).then(() => this.fill() as Promise<any>);
	}

	/**
	 * fill
	 * @param {Defer<any>} [value]
	 * @returns {Promise<any>}
	 */
	fill(value?: Defer<any>): Promise<any> {
		const full = value || new Defer<any>();

		this.q.enqueue(() => {
			return this.check();
		}).then((result: any) => {
			if (result) {
				this.fill(full); // recursive call
			} else {
				full.resolve(null);
			}
		});

		return full.promise;
	}

	/**
	 * moveTo
	 * @param {object} offset 
	 * @override
	 */
	moveTo(offset: { top: number, left: number }): void {
		let distX = 0, distY = 0;

		if (this.paginated) {
			distX = Math.floor(offset.left / this.layout.delta) * this.layout.delta;
		} else {
			distY = offset.top;
		}

		if (distX > 0 || distY > 0) {
			this.scrollBy(distX, distY, true);
		}
	}

	/**
	 * Remove Previous Listeners if present
	 * @param {View} view 
	 */
	removeShownListeners(view: View): void {
		view.off(EVENTS.VIEWS.DISPLAYED);
	}

	/**
	 * update
	 * @param {number} [offset] 
	 * @returns {Promise<any>}
	 */
	async update(offset?: number): Promise<any> {
		const views = this.views as any;
		const delta = offset || this.settings.offset || 0;
		const promises: Promise<any>[] = [];

		for (let i = 0; i < views.length; i++) {
			const view = views[i];

			if (this.isVisible(view, delta, delta)) {
				if (view.displayed) {
					// Avoid forcing iframe redraw on every scroll tick.
					if (
						(view.element && view.element.style.visibility !== "visible") ||
						(view.frame && view.frame.style.visibility !== "visible")
					) {
						view.show();
					}
				} else {
					const displayed = view.display(this.load)
						.then((v: View) => {
							v.show();
						});
					promises.push(displayed);
				}
			} else {
				// Keep offscreen views hidden during active scroll to avoid
				// frequent iframe teardown / rebuild flicker around section edges.
				if (
					view.displayed &&
					(view.element && view.element.style.visibility !== "hidden")
				) {
					view.hide();
				}

				this.scheduleTrim(350);
			}
		}

		if (promises.length) {
			return Promise.all(promises);
		} else {
			return Promise.resolve(null);
		}
	}

	/**
	 * scheduleTrim
	 * @param {number} [delay=250] 
	 */
	scheduleTrim(delay: number = 250): void {
		clearTimeout(this.trimTimeout);
		this.trimTimeout = setTimeout(() => {
			// Avoid trimming while momentum scroll is still active.
			if ((this.scrollDeltaVert || 0) > 2 || (this.scrollDeltaHorz || 0) > 2) {
				this.scheduleTrim(120);
				return;
			}
			this.q.enqueue(this.trim.bind(this));
		}, delay);
	}

	/**
	 * trim
	 * @returns {Promise<any>}
	 */
	trim(): Promise<any> {
		const task = new Defer<any>();
		const displayed = this.views.displayed();
		if (displayed.length === 0) {
			task.resolve(null);
			return task.promise;
		}
		const first = displayed[0];
		const last = displayed[displayed.length - 1];
		const firstIndex = this.views.indexOf(first);
		const lastIndex = this.views.indexOf(last);
		const above = (this.views as any).slice(0, firstIndex);
		const below = (this.views as any).slice(lastIndex + 1);

		// Erase all but last above
		for (let i = 0; i < above.length - 1; i++) {
			this.erase(above[i], true);
		}

		// Erase all except first below
		for (let j = 1; j < below.length; j++) {
			this.erase(below[j], false);
		}

		task.resolve(null);
		return task.promise;
	}

	/**
	 * erase
	 * @param {View} view 
	 * @param {boolean} above 
	 */
	erase(view: View, above: boolean): void {
		const lsc = this.views.container;
		const prevTop = lsc.scrollTop;
		const prevLeft = lsc.scrollLeft;

		const bounds = view.position(); // rect from view

		this.views.remove(view);

		if (above) {
			if (this.layout.axis === "vertical") {
				this.scrollTo(prevLeft, prevTop - bounds.height, true);
			} else {
				if (this.layout.direction === "rtl") {
					this.scrollTo(prevLeft + Math.floor(bounds.width), prevTop, true);
				} else {
					this.scrollTo(prevLeft - Math.floor(bounds.width), prevTop, true);
				}
			}
		}
	}

	/**
	 * check
	 * @param {number} [offsetLeft]
	 * @param {number} [offsetTop]
	 * @returns {Promise<any>}
	 * @private
	 */
	async check(offsetLeft?: number, offsetTop?: number): Promise<any> {
		const promises: Promise<any>[] = [];
		const vph = this.layout.axis === AXIS_H;
		const lsc = this.views.container;
		const rtl = this.layout.direction === "rtl";
		let delta = this.settings.offset || 0;

		if (offsetLeft && vph) {
			delta = offsetLeft;
		}

		if (offsetTop && !vph) {
			delta = offsetTop;
		}

		const rect = this.viewport.rect;
		const visibleLength = vph ? Math.floor(rect.width) : rect.height;
		const contentLength = vph ? lsc.scrollWidth : lsc.scrollHeight;
		let offset = vph ? lsc.scrollLeft : lsc.scrollTop;

		if (this.writingMode && this.writingMode.indexOf(AXIS_H) === 0) {
			// Scroll offset starts at width of element
			if (rtl && this.scrollType === "default") {
				offset = contentLength - visibleLength - offset;
			}
			// Scroll offset starts at 0 and goes negative
			if (rtl && this.scrollType === "negative") {
				offset = offset * -1;
			}
		}

		const append = () => {
			const view = this.views.last();
			const next = view && view.section.next();
			if (next) {
				promises.push(this.append(next));
			}
		};

		const prepend = () => {
			const view = this.views.first();
			const prev = view && view.section.prev();
			if (prev) {
				promises.push(this.prepend(prev));
			}
		};

		const end = offset + visibleLength + delta;
		const start = offset - delta;

		if (end >= contentLength) {
			append();
		}

		if (start < 0) {
			prepend();
		}

		if (promises.length) {
			return Promise.all(promises).then(() => {
				return this.check();
			}).then(() => {
				return this.update(delta);
			});
		} else {
			return this.update(delta);
		}
	}

	/**
	 * scrolled
	 * @param {Event} e 
	 * @override
	 */
	scrolled(e: any): void {
		this.q.enqueue(() => {
			return this.check();
		}).then(() => {
			this.relocated();
			this.emit(EVENTS.MANAGERS.SCROLLED, {
				top: e.target.scrollTop,
				left: e.target.scrollLeft
			});
		});
	}

	/**
	 * onscroll
	 * @param {Event} e 
	 * @override
	 */
	onscroll(e: any): void {
		const lsc = this.views.container;
		const scrollTop = lsc.scrollTop;
		const scrollLeft = lsc.scrollLeft;

		if (!this.ignore) {
			this.scrollend(e);
		} else {
			this.ignore = false;
		}

		this.scrollDeltaVert = (this.scrollDeltaVert || 0) + Math.abs(scrollTop - (this.prevScrollTop || 0));
		this.scrollDeltaHorz = (this.scrollDeltaHorz || 0) + Math.abs(scrollLeft - (this.prevScrollLeft || 0));

		this.prevScrollTop = scrollTop;
		this.prevScrollLeft = scrollLeft;

		clearTimeout(this.scrollTimeout);
		this.scrollTimeout = setTimeout(() => {
			this.scrollDeltaVert = 0;
			this.scrollDeltaHorz = 0;
		}, 150);
	}

	/**
	 * next
	 * @returns {Promise<any>}
	 * @override
	 */
	next(): Promise<any> {
		if (this.views.length === 0) {
			return Promise.resolve(null);
		}

		if (this.paginated &&
			this.layout.axis === AXIS_H) {
			this.scrollBy(this.layout.delta, 0, true);
		} else {
			this.scrollBy(0, this.layout.height, true);
		}

		return this.q.enqueue(() => {
			return this.check();
		});
	}

	/**
	 * prev
	 * @returns {Promise<any>}
	 * @override
	 */
	prev(): Promise<any> {
		if (this.views.length === 0) {
			return Promise.resolve(null);
		}

		if (this.paginated &&
			this.layout.axis === AXIS_H) {
			this.scrollBy(-this.layout.delta, 0, true);
		} else {
			this.scrollBy(0, -this.layout.height, true);
		}

		return this.q.enqueue(() => {
			return this.check();
		});
	}

	/**
	 * destroy
	 * @override
	 */
	destroy(): void {
		clearTimeout(this.trimTimeout);
		clearTimeout(this.scrollTimeout);

		super.destroy();

		if (this.snapper) {
			this.snapper.destroy();
		}
	}
}

export default ContinuousViewManager;
