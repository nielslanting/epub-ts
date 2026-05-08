import RangeObject from "./utils/rangeobject";
import { findChildren, isNumber } from "./utils/core";

export interface CFIStep {
	id: string | null;
	index: number;
	type: "element" | "text";
	tagName?: string;
}

export interface CFITerminal {
	offset: number | null;
	assertion: string | null;
}

export interface CFIComponent {
	steps: CFIStep[];
	terminal: CFITerminal;
}

/**
 * Parsing and creation of EpubCFIs:
 * @link https://idpf.org/epub/linking/cfi/epub-cfi.html
 * 
 * Implements:
 * - Character Offset: `epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)`
 * - Simple Ranges: `epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)`
 * 
 * Does Not Implement:
 * - Temporal Offset `(~)`
 * - Spatial Offset `(@)`
 * - Temporal-Spatial Offset `(~ + @)`
 * - Text Location Assertion `([)`
 */
class EpubCFI {
	base: CFIComponent;
	hash: string;
	ignoreClass: string;
	path: CFIComponent;
	range: boolean;
	spinePos: number;
	start: CFIComponent | null;
	end: CFIComponent | null;
	type: string | undefined;

	/**
	 * Constructor
	 * @param {string|Range|Node|EpubCFI} [data] values: 'epubcfi(..)' OR range OR node
	 * @param {string|CFIComponent} [base] base component
	 * @param {string} [ignoreClass] class to ignore when parsing DOM
	 */
	constructor(data?: any, base?: string | CFIComponent, ignoreClass?: string) {
		this.base = { steps: [], terminal: { offset: null, assertion: null } };
		this.hash = "";
		this.ignoreClass = "";
		this.path = { steps: [], terminal: { offset: null, assertion: null } };
		this.range = false;
		this.spinePos = 0;
		this.start = null;
		this.end = null;
		this.type = undefined;

		if (data || base || ignoreClass) {
			this.set({ data, base, ignoreClass });
		}
	}

	/**
	 * Set object data options
	 * @param {object} [options]
	 * @param {string|Range|Node|EpubCFI} [options.data]
	 * @param {string|CFIComponent} [options.base]
	 * @param {string} [options.ignoreClass]
	 * @returns {EpubCFI}
	 */
	set(options: { data?: any; base?: string | CFIComponent; ignoreClass?: string }): EpubCFI {

		let data: any, base: any, igcl: any, type: any;
		const b = (value: any) => {
			if (base) return;
			if (typeof value === "string") {
				this.base = this.parseComponent(value);
				if (this.base.steps.length > 1) {
					this.spinePos = this.base.steps[1].index;
				}
			} else if (typeof value === "object" && value.steps) {
				this.base = value;
			}
			base = this.base;
		};
		const c = (value: any) => {
			if (igcl) return;
			if (typeof value === "string") {
				this.ignoreClass = value;
			}
			igcl = this.ignoreClass;
		};
		const d = (value: any) => {
			if (data) return;
			type = type || this.checkType(value);
			if (type === "string") {
				data = this.parse(value);
			} else if (type === "range") {
				data = this.fromRange(value, base, igcl);
			} else if (type === "node") {
				data = this.fromNode(value, base, igcl);
			} else if (type === "EpubCFI") {
				data = value;
			} else if (!value) {
				data = this;
			} else {
				throw new TypeError("not a valid argument for EpubCFI");
			}
			data.type = type || this.type;
		};

		if (options.base) b(options.base);
		if (options.ignoreClass) c(options.ignoreClass);
		if (options.data !== undefined) d(options.data);

		return data ? Object.assign(this, data) : this;
	}

	/**
	 * Check the type to input
	 * @param {any} cfiFrom
	 * @returns {string|undefined} argument type
	 */
	checkType(cfiFrom: any): string | undefined {

		if (typeof cfiFrom === "undefined") {
			return undefined;
		} else if (this.isCfiString(cfiFrom)) {
			return "string";
		} else if (typeof cfiFrom === "object") {
			if (cfiFrom instanceof Range ||
				(typeof cfiFrom.startContainer !== "undefined" && typeof cfiFrom.endContainer !== "undefined")) {
				return "range";
			} else if (cfiFrom instanceof Node) {
				return "node";
			} else if (cfiFrom instanceof EpubCFI) {
				return "EpubCFI";
			} else return undefined;
		} else return undefined;
	}

	/**
	 * Collapse a CFI Range to a single CFI Position
	 * @param {boolean} [toStart]
	 */
	collapse(toStart?: boolean): void {

		if (this.range === false) return;

		if (toStart && this.start) {
			this.path.steps = this.path.steps.concat(this.start.steps);
			this.path.terminal = this.start.terminal;
		} else if (!toStart && this.end) {
			this.path.steps = this.path.steps.concat(this.end.steps);
			this.path.terminal = this.end.terminal;
		}

		this.range = false;
	}

	/**
	 * Compare which of two CFIs is earlier in the text
	 * @param {string|EpubCFI} cfiOne 
	 * @param {string|EpubCFI} cfiTwo 
	 * @returns {number} First is earlier = -1, Second is earlier = 1, They are equal = 0 
	 */
	compare(cfiOne: string | EpubCFI, cfiTwo: string | EpubCFI): number {

		if (typeof cfiOne === "string") {
			cfiOne = new EpubCFI(cfiOne);
		}
		if (typeof cfiTwo === "string") {
			cfiTwo = new EpubCFI(cfiTwo);
		}
		// Compare Spine Positions
		if (cfiOne.spinePos > cfiTwo.spinePos) return 1;
		if (cfiOne.spinePos < cfiTwo.spinePos) return -1;

		let stepsA: CFIStep[], terminalA: CFITerminal;
		if (cfiOne.range && cfiOne.start) {
			stepsA = cfiOne.path.steps.concat(cfiOne.start.steps);
			terminalA = cfiOne.start.terminal;
		} else {
			stepsA = cfiOne.path.steps;
			terminalA = cfiOne.path.terminal;
		}

		let stepsB: CFIStep[], terminalB: CFITerminal;
		if (cfiTwo.range && cfiTwo.start) {
			stepsB = cfiTwo.path.steps.concat(cfiTwo.start.steps);
			terminalB = cfiTwo.start.terminal;
		} else {
			stepsB = cfiTwo.path.steps;
			terminalB = cfiTwo.path.terminal;
		}
		// Compare Each Step in the First item
		for (let i = 0; i < stepsA.length; i++) {
			if (!stepsA[i]) return -1;
			if (!stepsB[i]) return 1;
			if (stepsA[i].index > stepsB[i].index) return 1;
			if (stepsA[i].index < stepsB[i].index) return -1;
		}
		// All steps in First equal to Second and First is Less Specific
		if (stepsA.length < stepsB.length) return -1;

		// Compare the character offset of the text node
		if ((terminalA.offset || 0) > (terminalB.offset || 0)) return 1;
		if ((terminalA.offset || 0) < (terminalB.offset || 0)) return -1;

		return 0; // CFI's are equal
	}

	/**
	 * Generate chapter component
	 * @param {number} spineNodeIndex
	 * @param {number} position
	 * @param {string} [id] 
	 * @returns {string} EpubCFI string format
	 */
	generateChapterComponent(spineNodeIndex: number, position: number, id?: string): string {

		const pos = position;
		const index = (spineNodeIndex + 1) * 2;
		let cfi = "/" + index + "/";
		cfi += (pos + 1) * 2;
		if (id) cfi += "[" + id + "]";
		return cfi;
	}

	/**
	 * Get chapter component
	 * @param {string} cfiStr EpubCFI string format
	 * @returns {string} Base component
	 * @private
	 */
	getBaseComponent(cfiStr: string): string {

		const indirection = cfiStr.split("!");
		return indirection[0];
	}

	/**
	 * Get path component
	 * @param {string} cfiStr EpubCFI string format
	 * @returns {string|undefined} Path component
	 * @private
	 */
	getPathComponent(cfiStr: string): string | undefined {

		const indirection = cfiStr.split("!");
		if (indirection[1]) {
			const ranges = indirection[1].split(",");
			return ranges[0];
		}
		return undefined;
	}

	/**
	 * getRange
	 * @param {string} cfiStr EubCFI string format
	 * @returns {string[]|null} An array of ranges or null if the array length is not 3
	 * @private
	 */
	getRange(cfiStr: string): string[] | null {

		const ranges = cfiStr.split(",");

		if (ranges.length === 3) {
			return [
				ranges[1],
				ranges[2]
			];
		}

		return null;
	}

	/**
	 * Get the offset component of a character (unused)
	 * @param {string} cfiStr 
	 * @returns {string}
	 * @private
	 */
	getCharacterOffsetComponent(cfiStr: string): string {

		const arr = cfiStr.split(":");
		return arr[1] || "";
	}

	/**
	 * Check if a string is wrapped with "epubcfi()"
	 * @param {any} str EpubCFI string format
	 * @returns {boolean} `true` if the string is valid, `false` otherwise
	 */
	isCfiString(str: any): boolean {

		if (typeof str === "string" &&
			str.indexOf("epubcfi(") === 0 &&
			str[str.length - 1] === ")") {
			return true;
		}
		return false;
	}

	/**
	 * joinSteps
	 * @param {CFIStep[]} steps 
	 * @returns {string} 
	 * @private
	 */
	joinSteps(steps: CFIStep[]): string {

		if (!steps) return "";
		return steps.map(part => {

			let segment = "";
			if (part.type === "element") {
				segment += (part.index + 1) * 2;
			}
			if (part.type === "text") {
				segment += 1 + (2 * part.index);
			}
			if (part.id) {
				segment += "[" + part.id + "]";
			}
			return segment;

		}).join("/");
	}

	/**
	 * pathTo
	 * @param {Node} node 
	 * @param {number|null} offset 
	 * @param {string} [ignoreClass] 
	 * @returns {CFIComponent} segment object
	 * @private
	 */
	pathTo(node: Node, offset: number | null, ignoreClass?: string): CFIComponent {

		const segment: CFIComponent = {
			steps: [],
			terminal: {
				offset: null,
				assertion: null
			}
		};

		let step: CFIStep | undefined, curNode: Node | null = node;
		while (
			curNode &&
			curNode.parentNode &&
			curNode.parentNode.nodeType !== Node.DOCUMENT_NODE) {

			if (ignoreClass) {
				step = this.filteredStep(curNode, ignoreClass);
			} else {
				step = this.step(curNode);
			}

			if (step) segment.steps.unshift(step);
			curNode = curNode.parentNode;
		}

		if (offset !== null && offset >= 0) {
			segment.terminal.offset = offset;
			// Make sure we are getting to a textNode if there is an offset
			const len = segment.steps.length;
			const idx = len ? (len - 1) : len;
			const stp = len > 0 ? segment.steps[idx].type : null; 
			if (stp && stp !== "text") {
				segment.steps.push({
					index: 0,
					type: "text",
					id: null
				});
			}
		}

		return segment;
	}

	/**
	 * equalStep
	 * @param {CFIStep|null} stepA 
	 * @param {CFIStep|null} stepB 
	 * @returns {boolean}
	 * @private
	 */
	equalStep(stepA: CFIStep | null, stepB: CFIStep | null): boolean {

		if (stepA && stepB &&
			stepA.id === stepB.id &&
			stepA.index === stepB.index &&
			stepA.type === stepB.type) {
			return true;
		}
		return false;
	}

	/**
	 * filter
	 * @param {Node} node 
	 * @param {string} [ignoreClass] 
	 * @returns {Node|null} 
	 * @private
	 */
	filter(node: Node, ignoreClass?: string): Node | null {

		if (!ignoreClass) return node;

		let parent: HTMLElement | null;
		let isText: boolean;
		let needsIgnoring: boolean;

		if (node.nodeType === Node.TEXT_NODE) {
			isText = true;
			parent = node.parentNode as HTMLElement;
			needsIgnoring = parent.classList.contains(ignoreClass);
		} else {
			isText = false;
			needsIgnoring = (node as HTMLElement).classList.contains(ignoreClass);
		}

		if (needsIgnoring && isText && parent!) {
			const prevSibling = parent.previousSibling;
			const nextSibling = parent.nextSibling;
			let sibling: Node | null = null; // to join with

			// If the sibling is a text node, join the nodes
			if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
				sibling = prevSibling;
			} else if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
				sibling = nextSibling;
			}

			return sibling || node;

		} else if (needsIgnoring && !isText) {
			// Otherwise just skip the element node
			return null;
		} else {
			// No need to filter
			return node;
		}
	}

	/**
	 * filteredPosition
	 * @param {Node} node 
	 * @param {string} [ignoreClass] 
	 * @returns {number} index
	 * @private
	 */
	filteredPosition(node: Node, ignoreClass?: string): number {

		let children: any, map: any;

		if (node.nodeType === Node.ELEMENT_NODE) {
			children = node.parentNode!.children;
			map = this.normalizedMap(children, Node.ELEMENT_NODE, ignoreClass);
		} else {
			children = node.parentNode!.childNodes;
			// Inside an ignored node
			if (ignoreClass && (node.parentNode as HTMLElement).classList.contains(ignoreClass)) {
				node = node.parentNode!;
				children = node.parentNode!.childNodes;
			}
			map = this.normalizedMap(children, Node.TEXT_NODE, ignoreClass);
		}

		const index = Array.prototype.indexOf.call(children, node);

		return map[index];
	}

	/**
	 * filteredStep
	 * @param {Node} node 
	 * @param {string} ignoreClass 
	 * @returns {CFIStep|undefined} step
	 * @private
	 */
	filteredStep(node: Node, ignoreClass: string): CFIStep | undefined {

		const _node = this.filter(node, ignoreClass);

		// Node filtered, so ignore
		if (_node === null) return;
		return {
			id: (_node as HTMLElement).id || null,
			index: this.filteredPosition(_node, ignoreClass),
			tagName: (_node as HTMLElement).tagName,
			type: (_node.nodeType === Node.TEXT_NODE) ? "text" : "element"
		}
	}

	/**
	 * findNode
	 * @param {CFIStep[]} steps 
	 * @param {Document} [doc] 
	 * @param {string} [ignoreClass] 
	 * @returns {Node|null}
	 * @private
	 */
	findNode(steps: CFIStep[], doc?: Document, ignoreClass?: string): Node | null {

		const dc = doc || document;
		let container: Node | null;

		if (ignoreClass) {
			container = this.walkToNode(steps, dc, ignoreClass);
		} else if (typeof dc.evaluate !== "undefined") {
			const xpath = this.stepsToXpath(steps);
			const xtype = XPathResult.FIRST_ORDERED_NODE_TYPE;
			container = dc.evaluate(xpath, dc, null, xtype, null).singleNodeValue;
		} else {
			container = this.walkToNode(steps, dc);
		}

		return container;
	}

	/**
	 * fixMiss
	 * @param {CFIStep[]} steps 
	 * @param {number} offset 
	 * @param {Document} [doc] 
	 * @param {string} [ignoreClass] 
	 * @returns {any}
	 * @private
	 */
	fixMiss(steps: CFIStep[], offset: number, doc?: Document, ignoreClass?: string): any {

		let container = this.findNode(steps.slice(0, -1), doc, ignoreClass);
		if (!container) return;
		const children = container.childNodes;
		const lastStepIndex = steps[steps.length - 1].index;
		const map = this.normalizedMap(children as any, Node.TEXT_NODE, ignoreClass);

		for (const childIndex in map) {

			if (!map.hasOwnProperty(childIndex)) continue;

			if (map[childIndex] === lastStepIndex) {
				const child = children[parseInt(childIndex)];
				const len = child.textContent?.length || 0;
				if (offset > len) {
					offset = offset - len;
				} else {
					if (child.nodeType === Node.ELEMENT_NODE) {
						container = child.childNodes[0];
					} else {
						container = child;
					}
					break;
				}
			}
		}

		return {
			container: container,
			offset: offset
		}
	}

	/**
	 * Create a EpubCFI object from a Node
	 * @param {Node} node
	 * @param {string|CFIComponent} base
	 * @param {string} [ignoreClass]
	 * @returns {EpubCFI}
	 */
	fromNode(node: Node, base: string | CFIComponent, ignoreClass?: string): EpubCFI {

		const cfi = new EpubCFI();

		if (typeof base === "string") {
			cfi.base = this.parseComponent(base);
			if (cfi.base.steps.length > 1) {
				cfi.spinePos = cfi.base.steps[1].index;
			}
		} else if (typeof base === "object") {
			cfi.base = base;
		}

		cfi.path = this.pathTo(node, null, ignoreClass);
		return cfi;
	}

	/**
	 * Create a CFI object from a Range
	 * @param {Range} range
	 * @param {string|CFIComponent} base
	 * @param {string} [ignoreClass]
	 * @returns {EpubCFI} 
	 */
	fromRange(range: Range, base: string | CFIComponent, ignoreClass?: string): EpubCFI {

		const cfi = new EpubCFI();
		const start = range.startContainer;
		const end = range.endContainer;
		let startOffset = range.startOffset;
		let endOffset = range.endOffset;
		let needsIgnoring = false;
		const doc = start.ownerDocument!;

		if (ignoreClass) {
			// Tell pathTo if / what to ignore
			needsIgnoring = (doc.querySelector("." + ignoreClass) !== null);
		}

		if (typeof base === "string") {
			cfi.base = this.parseComponent(base);
			if (cfi.base.steps.length > 1) {
				cfi.spinePos = cfi.base.steps[1].index;
			}
		} else if (typeof base === "object") {
			cfi.base = base;
		}

		const offset = () => {
			if (needsIgnoring && ignoreClass) {
				startOffset = this.patchOffset(start, startOffset, ignoreClass);
			}
		};

		if (range.collapsed) {
			offset();
			cfi.path = this.pathTo(start, startOffset, ignoreClass);
		} else {
			cfi.range = true;
			offset();

			cfi.start = this.pathTo(start, startOffset, ignoreClass);
			if (needsIgnoring && ignoreClass) {
				endOffset = this.patchOffset(end, endOffset, ignoreClass);
			}

			cfi.end = this.pathTo(end, endOffset, ignoreClass);

			// Create a new empty path
			cfi.path = {
				steps: [],
				terminal: { offset: null, assertion: null }
			}

			// Push steps that are shared between start and end to the common path
			if (cfi.start && cfi.end) {
				for (let i = 0, len = cfi.start.steps.length; i < len; i++) {
					if (this.equalStep(cfi.start.steps[i], cfi.end.steps[i])) {
						if (i === len - 1) {
							// Last step is equal, check terminals
							if (cfi.start.terminal.offset === cfi.end.terminal.offset &&
								cfi.start.terminal.assertion === cfi.end.terminal.assertion) {
								// CFI's are equal
								cfi.path.steps.push(cfi.start.steps[i]);
								// Not a range
								cfi.range = false;
							}
						} else {
							cfi.path.steps.push(cfi.start.steps[i]);
						}
					} else {
						break;
					}
				}

				cfi.start.steps = cfi.start.steps.slice(cfi.path.steps.length);
				cfi.end.steps = cfi.end.steps.slice(cfi.path.steps.length);
			}
		}

		return cfi;
	}

	/**
	 * normalizedMap
	 * @param {NodeList|HTMLCollectionOf<Element>} children 
	 * @param {number} nodeType 
	 * @param {string} [ignoreClass] 
	 * @returns {any}
	 * @private
	 */
	normalizedMap(children: NodeList | HTMLCollectionOf<Element>, nodeType: number, ignoreClass?: string): any {

		const output: any = {};
		let prevIndex = -1;
		let currNodeType: number;
		let prevNodeType: number | undefined;

		for (let i = 0, len = children.length; i < len; i++) {
			const child = children[i] as any;
			currNodeType = child.nodeType;

			// Check if needs ignoring
			if (ignoreClass && currNodeType === Node.ELEMENT_NODE &&
				child.classList.contains(ignoreClass)) {
				currNodeType = Node.TEXT_NODE;
			}

			if (i > 0 &&
				currNodeType === Node.TEXT_NODE &&
				prevNodeType === Node.TEXT_NODE) {
				// join text nodes
				output[i] = prevIndex;
			} else if (nodeType === currNodeType) {
				prevIndex = prevIndex + 1;
				output[i] = prevIndex;
			}

			prevNodeType = currNodeType;
		}

		return output;
	}

	/**
	 * Parse a cfi string to a EpubCFI object representation
	 * @param {string} hash EpubCFI string format
	 * @returns {EpubCFI} EpubCFI object
	 */
	parse(hash: string): EpubCFI {

		const cfi = new EpubCFI();

		if (typeof hash !== "string") {
			throw new TypeError("invalid argument type");
		}

		if (this.isCfiString(hash)) {
			// Remove initial 'epubcfi(' and ending ')'
			cfi.hash = hash; // save EpubCFI string
			cfi.type = "string";
			hash = hash.slice(8, hash.length - 1);
		} else {
			throw new Error("invalid EpubCFI string format");
		}

		const baseComponent = this.getBaseComponent(hash);

		// Make sure this is a valid cfi or return
		if (!baseComponent) {
			cfi.spinePos = -1;
			return cfi;
		}

		cfi.base = this.parseComponent(baseComponent);

		const pathComponent = this.getPathComponent(hash);
		if (pathComponent) {
			cfi.path = this.parseComponent(pathComponent);
		}

		const range = this.getRange(hash);
		if (range) {
			cfi.range = true;
			cfi.start = this.parseComponent(range[0]);
			cfi.end = this.parseComponent(range[1]);
		}

		// Chapter segment is always the second step
		if (cfi.base.steps.length > 1) {
			cfi.spinePos = cfi.base.steps[1].index;
		}

		return cfi;
	}

	/**
	 * Parsing the component string value
	 * @param {string} value string value
	 * @returns {CFIComponent} component object
	 * @private
	 */
	parseComponent(value: string): CFIComponent {

		const component: CFIComponent = {
			steps: [],
			terminal: {
				offset: null,
				assertion: null
			}
		}

		const parts = value.split(":");
		const steps = parts[0].split("/");

		if (parts.length > 1) {
			component.terminal = this.parseTerminal(parts[1]);
		}

		if (steps[0] === "") {
			steps.shift(); // Ignore the first slash
		}

		component.steps = steps.map(step => this.parseStep(step)).filter(s => s !== undefined) as CFIStep[];
		return component;
	}

	/**
	 * Parsing the step string value
	 * Check if step is a text node or element
	 * @param {string} str string value
	 * @returns {CFIStep|undefined} step object
	 * @private
	 */
	parseStep(str: string): CFIStep | undefined {

		const num = parseInt(str);
		if (isNaN(num)) return;
		const isElement = (num % 2 === 0);
		const hasBrackets = str.match(/\[(.*)\]/);
		return {
			id: hasBrackets && hasBrackets[1] ? hasBrackets[1] : null,
			index: isElement ? num / 2 - 1 : (num - 1) / 2,
			type: isElement ? "element" : "text"
		}
	}

	/**
	 * Parsing the terminal string value
	 * @param {string} str string value
	 * @returns {CFITerminal} terminal object
	 * @private
	 */
	parseTerminal(str: string): CFITerminal {

		const arr = str.match(/\[(.*)\]/);
		const cmp = arr && arr[1];
		const txt = cmp ? str.split("[")[0] : str;
		const num = parseInt(txt);
		return {
			assertion: cmp ? arr[1] : null,
			offset: isNumber(num) ? num : null
		}
	}

	/**
	 * Get patch offset of text node
	 * @param {Node} node 
	 * @param {number} offset 
	 * @param {string} ignoreClass 
	 * @returns {number} Total offset
	 * @private
	 */
	patchOffset(node: Node, offset: number, ignoreClass: string): number {

		if (node.nodeType !== Node.TEXT_NODE) {
			throw new Error("Anchor must be a text node");
		}

		let curr: Node | null = node;
		let totalOffset = offset;

		// If the parent is a ignored node, get offset from it's start
		if ((node.parentNode as HTMLElement).classList.contains(ignoreClass)) {
			curr = node.parentNode;
		}

		while (curr && (curr as any).previousSibling) {
			const prev = (curr as any).previousSibling;
			if (prev.nodeType === Node.ELEMENT_NODE) {
				// Originally a text node, so join
				if (prev.classList.contains(ignoreClass)) {
					totalOffset += prev.textContent.length;
				} else {
					break; // Normal node, dont join
				}
			} else {
				// If the previous sibling is a text node, join the nodes
				totalOffset += prev.textContent.length;
			}
			curr = prev;
		}

		return totalOffset;
	}

	/**
	 * Get position index
	 * @param {Node} node 
	 * @returns {number} Position index
	 * @private
	 */
	position(node: Node): number {

		let children: any, index: number;

		if (node.nodeType === Node.ELEMENT_NODE) {
			children = node.parentNode!.children;
			if (!children) {
				children = findChildren(node.parentNode as Element);
			}
			index = Array.prototype.indexOf.call(children, node);
		} else {
			children = this.textNodes(node.parentNode!);
			index = children.indexOf(node);
		}

		return index;
	}

	/**
	 * segmentString
	 * @param {CFIComponent} segment 
	 * @returns {string}
	 * @private
	 */
	segmentString(segment: CFIComponent): string {

		let str = "/";
		str += this.joinSteps(segment.steps);

		if (segment.terminal && segment.terminal.offset !== null) {
			str += ":" + segment.terminal.offset;
		}
		if (segment.terminal && segment.terminal.assertion !== null) {
			str += "[" + segment.terminal.assertion + "]";
		}

		return str;
	}

	/**
	 * step
	 * @param {Node} node 
	 * @returns {CFIStep} step object
	 * @private
	 */
	step(node: Node): CFIStep {

		return {
			id: (node as HTMLElement).id || null,
			index: this.position(node),
			tagName: (node as HTMLElement).tagName,
			type: (node.nodeType === Node.TEXT_NODE) ? "text" : "element"
		}
	}

	/**
	 * stepsToXpath
	 * @param {CFIStep[]} steps 
	 * @returns {string}
	 * @private
	 */
	stepsToXpath(steps: CFIStep[]): string {

		const xpath = [".", "*"];

		steps.forEach(step => {

			const position = step.index + 1;

			if (step.id) {
				xpath.push("*[position()=" + position + " and @id='" + step.id + "']");
			} else if (step.type === "text") {
				xpath.push("text()[" + position + "]");
			} else {
				xpath.push("*[" + position + "]");
			}
		})

		return xpath.join("/");
	}

	/**
	 * textNodes
	 * @param {Node} container 
	 * @param {string} [ignoreClass] 
	 * @returns {Node[]}
	 * @private
	 */
	textNodes(container: Node, ignoreClass?: string): Node[] {

		return Array.prototype.slice.call(container.childNodes).filter(node => {
			if (node.nodeType === Node.TEXT_NODE) {
				return true;
			} else if (ignoreClass && (node as HTMLElement).classList && (node as HTMLElement).classList.contains(ignoreClass)) {
				return true;
			}
			return false;
		})
	}

	/**
	 * Creates a DOM range representing a CFI
	 * @param {Document} [doc] document referenced in the base
	 * @param {string} [ignoreClass]
	 * @return {Range}
	 */
	toRange(doc?: Document, ignoreClass?: string): Range {

		const dc = doc || document;
		let start: CFIComponent, end: CFIComponent | null = null, startContainer: Node | null, endContainer: Node | null = null;
		let startSteps: CFIStep[], endSteps: CFIStep[] | undefined, hasOffset: boolean;
		let range: any, missed: any;
		const needsIgnoring = ignoreClass && (dc.querySelector("." + ignoreClass) !== null);
		const reqClass = needsIgnoring ? ignoreClass : undefined;

		if (typeof (dc.createRange) !== "undefined") {
			range = dc.createRange();
		} else {
			range = new RangeObject();
		}

		if (this.range) {
			start = this.start!;
			startSteps = this.path.steps.concat(start.steps);
			startContainer = this.findNode(startSteps, dc, reqClass);
			end = this.end!;
			endSteps = this.path.steps.concat(end.steps);
			endContainer = this.findNode(endSteps, dc, reqClass);
		} else {
			start = this.path;
			startSteps = this.path.steps;
			startContainer = this.findNode(startSteps, dc, reqClass);
		}

		if (startContainer) {
			try {
				hasOffset = start.terminal.offset !== null;
				range.setStart(startContainer, hasOffset ? start.terminal.offset : 0);
			} catch (e) {
				missed = this.fixMiss(startSteps, start.terminal.offset || 0, dc, reqClass);
				if (missed) {
					range.setStart(missed.container, missed.offset);
				}
				console.warn(e);
			}
		} else {
			throw new Error("No startContainer found for " + this.toString());
		}

		if (endContainer && end) {
			try {
				hasOffset = end.terminal.offset !== null;
				range.setEnd(endContainer, hasOffset ? end.terminal.offset : 0);
			} catch (e) {
				missed = this.fixMiss(endSteps!, end.terminal.offset || 0, dc, reqClass);
				if (missed) {
					range.setEnd(missed.container, missed.offset);
				}
				console.warn(e);
			}
		}

		return range;
	}

	/**
	 * Convert CFI to a epubcfi(...) string
	 * @returns {string} EpubCFI string format
	 */
	toString(): string {

		let str = "epubcfi(";
		str += this.segmentString(this.base);
		str += "!";
		str += this.segmentString(this.path);
		// Add Range, if present
		if (this.range && this.start) {
			str += ",";
			str += this.segmentString(this.start);
		}
		if (this.range && this.end) {
			str += ",";
			str += this.segmentString(this.end);
		}
		str += ")";
		return str;
	}

	/**
	 * walkToNode
	 * @param {CFIStep[]} steps 
	 * @param {Document} [doc] 
	 * @param {string} [ignoreClass] 
	 * @returns {Node|null}
	 * @private
	 */
	walkToNode(steps: CFIStep[], doc?: Document, ignoreClass?: string): Node | null {

		const dc = doc || document;
		let container: any = dc.documentElement;

		for (let i = 0, len = steps.length; i < len; i++) {
			const step = steps[i];

			if (step.type === "element") {
				if (step.id) {
					container = dc.getElementById(step.id);
				}
				else {
					const children = container.children || findChildren(container);
					container = children[step.index];
				}
			} else if (step.type === "text") {
				container = this.textNodes(container, ignoreClass)[step.index];
			}
			if (!container) {
				break;
			}
		}

		return container;
	}

	/**
	 * Destroy the EpubCFI object
	 */
	destroy(): void {

		(Object.keys(this) as (keyof this)[]).forEach(p => ((this as any)[p] = undefined));
	}
}

export default EpubCFI;