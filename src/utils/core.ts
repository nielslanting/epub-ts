/**
 * @module core
 */

/**
 * Generates a UUID
 * @link https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
 * @returns {string} uuid
 */
export const uuid = (): string => {

	let d = new Date().getTime();
	const uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (d + Math.random() * 16) % 16 | 0;
		d = Math.floor(d / 16);
		return (c == "x" ? r : (r & 0x7 | 0x8)).toString(16);
	});
	return uuid;
}

/**
 * Gets the height of a document
 * @returns {number} height
 */
export const documentHeight = (): number => {

	return Math.max(
		document.documentElement.clientHeight,
		document.body.scrollHeight,
		document.documentElement.scrollHeight,
		document.body.offsetHeight,
		document.documentElement.offsetHeight
	);
}

/**
 * Checks if a node is an element
 * @param {any} obj
 * @returns {boolean}
 */
export const isElement = (obj: any): obj is Element => {

	return !!(obj && (obj as Node).nodeType == Node.ELEMENT_NODE);
}

/**
 * isNumber
 * @param {any} n
 * @returns {boolean}
 */
export const isNumber = (n: any): boolean => {

	return !isNaN(parseFloat(n)) && isFinite(n);
}

/**
 * isFloat
 * @param {any} n
 * @returns {boolean}
 */
export const isFloat = (n: any): boolean => {

	const f = parseFloat(n);

	if (isNumber(n) === false) {
		return false;
	}

	if (typeof n === "string" && n.indexOf(".") > -1) {
		return true;
	}

	return Math.floor(f) !== f;
}

/**
 * Get a prefixed css property
 * @param {string} unprefixed
 * @returns {string}
 */
export const prefixed = (unprefixed: string): string => {

	const vendors = ["Webkit", "webkit", "Moz", "O", "ms"];
	const prefixes = ["-webkit-", "-webkit-", "-moz-", "-o-", "-ms-"];
	const lower = unprefixed.toLowerCase();
	const length = vendors.length;

	if (typeof (document) === "undefined" || typeof ((document.body.style as any)[lower]) !== "undefined") {
		return unprefixed;
	}

	for (let i = 0; i < length; i++) {
		if (typeof ((document.body.style as any)[prefixes[i] + lower]) !== "undefined") {
			return prefixes[i] + lower;
		}
	}

	return unprefixed;
}

/**
 * Apply defaults to an object
 * @param {any} obj
 * @param {any[]} args
 * @returns {any}
 */
export const defaults = (obj: any, ...args: any[]): any => {

	for (let i = 0, length = args.length; i < length; i++) {
		const source = args[i];
		for (const prop in source) {
			if (obj[prop] === void 0) obj[prop] = source[prop];
		}
	}
	return obj;
}

/**
 * Extend properties of an object
 * @param {any} target
 * @param {any[]} args
 * @returns {any}
 */
export const extend = (target: any, ...args: any[]): any => {

	args.forEach((source) => {
		if (!source) return;
		Object.getOwnPropertyNames(source).forEach((prop) => {
			const descriptor = Object.getOwnPropertyDescriptor(source, prop);
			if (descriptor) {
				Object.defineProperty(
					target,
					prop,
					descriptor
				);
			}
		});
	});
	return target;
}

/**
 * Finds where something would fit into a sorted array
 * @param {any} item
 * @param {any[]} array
 * @param {function} [compareFunction]
 * @param {number} [start]
 * @param {number} [end]
 * @returns {number} location (in array)
 */
export const locationOf = (item: any, array: any[], compareFunction?: (a: any, b: any) => number, start?: number, end?: number): number => {

	const _start = start || 0;
	const _end = end || array.length;
	const pivot = Math.floor(_start + (_end - _start) / 2);

	if (!compareFunction) {
		compareFunction = (a: any, b: any) => {
			if (a > b) return 1;
			if (a < b) return -1;
			return 0;
		};
	}
	if (_end - _start <= 0) {
		return pivot;
	}

	const compared = compareFunction(array[pivot], item);

	if (_end - _start === 1) {
		return compared >= 0 ? pivot : pivot + 1;
	}
	if (compared === 0) {
		return pivot;
	}
	if (compared === -1) {
		return locationOf(item, array, compareFunction, pivot, _end);
	} else {
		return locationOf(item, array, compareFunction, _start, pivot);
	}
}

/**
 * Fast quicksort insert for sorted array -- based on:
 * @link https://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
 * @param {any} item
 * @param {any[]} array
 * @param {function} [compareFunction]
 * @returns {number} location (in array)
 */
export const insert = (item: any, array: any[], compareFunction?: (a: any, b: any) => number): number => {

	const location = locationOf(item, array, compareFunction);
	array.splice(location, 0, item);

	return location;
}

/**
 * Finds index of something in a sorted array
 * Returns -1 if not found
 * @param {any} item
 * @param {any[]} array
 * @param {function} [compareFunction]
 * @param {number} [start]
 * @param {number} [end]
 * @returns {number} index (in array) or -1
 */
export const indexOfSorted = (item: any, array: any[], compareFunction?: (a: any, b: any) => number, start?: number, end?: number): number => {

	const _start = start || 0;
	const _end = end || array.length;
	const pivot = Math.floor(_start + (_end - _start) / 2);

	if (!compareFunction) {
		compareFunction = (a: any, b: any) => {
			if (a > b) return 1;
			if (a < b) return -1;
			return 0;
		};
	}
	if (_end - _start <= 0) {
		return -1; // Not found
	}

	const compared = compareFunction(array[pivot], item);

	if (_end - _start === 1) {
		return compared === 0 ? pivot : -1;
	}
	if (compared === 0) {
		return pivot; // Found
	}
	if (compared === -1) {
		return indexOfSorted(item, array, compareFunction, pivot, _end);
	} else {
		return indexOfSorted(item, array, compareFunction, _start, pivot);
	}
}

/**
 * Find the bounds of an element
 * taking padding and margin into account
 * @param {Element} el
 * @returns {{ height: number, width: number }}
 */
export const bounds = (el: Element): { height: number, width: number } => {

	const style = window.getComputedStyle(el);
	const widthProps = [
		"width",
		"paddingRight",
		"paddingLeft",
		"marginRight",
		"marginLeft",
		"borderRightWidth",
		"borderLeftWidth"
	];
	const heightProps = [
		"height",
		"paddingTop",
		"paddingBottom",
		"marginTop",
		"marginBottom",
		"borderTopWidth",
		"borderBottomWidth"
	];
	const ret = {
		height: 0,
		width: 0
	};

	widthProps.forEach((prop) => {
		ret.width += parseFloat((style as any)[prop]) || 0;
	});

	heightProps.forEach((prop) => {
		ret.height += parseFloat((style as any)[prop]) || 0;
	});

	return ret;
}

/**
 * Find the bounds of an element
 * taking padding, margin and borders into account
 * @param {Element} el
 * @returns {{ height: number, width: number }}
 */
export const borders = (el: Element): { height: number, width: number } => {

	const style = window.getComputedStyle(el);
	const widthProps = [
		"paddingRight",
		"paddingLeft",
		"marginRight",
		"marginLeft",
		"borderRightWidth",
		"borderLeftWidth"
	];
	const heightProps = [
		"paddingTop",
		"paddingBottom",
		"marginTop",
		"marginBottom",
		"borderTopWidth",
		"borderBottomWidth"
	];
	const ret = {
		height: 0,
		width: 0
	};

	widthProps.forEach((prop) => {
		ret.width += parseFloat((style as any)[prop]) || 0;
	});

	heightProps.forEach((prop) => {
		ret.height += parseFloat((style as any)[prop]) || 0;
	});

	return ret;
}

/**
 * Find the bounds of any node
 * allows for getting bounds of text nodes by wrapping them in a range
 * @param {Node} node
 * @returns {DOMRect}
 */
export const nodeBounds = (node: Node): DOMRect => {

	let rect: DOMRect;
	const doc = node.ownerDocument!;
	if (node.nodeType == Node.TEXT_NODE) {
		const range = doc.createRange();
		range.selectNodeContents(node);
		rect = range.getBoundingClientRect();
	} else {
		rect = (node as Element).getBoundingClientRect();
	}
	return rect;
}

/**
 * Find the equivalent of getBoundingClientRect of a browser window
 * @returns {{ width: number, height: number, top: number, left: number, right: number, bottom: number }}
 */
export const windowBounds = (): { width: number, height: number, top: number, left: number, right: number, bottom: number } => {

	const width = window.innerWidth;
	const height = window.innerHeight;

	return {
		top: 0,
		left: 0,
		right: width,
		bottom: height,
		width: width,
		height: height
	};
}

/**
 * Gets the index of a node in its parent
 * @param {Node} node
 * @param {number} typeId
 * @return {number} index
 */
export const indexOfNode = (node: Node, typeId: number): number => {

	const parent = node.parentNode;
	if (!parent) return -1;
	const children = parent.childNodes;
	let index = -1;

	for (let i = 0; i < children.length; i++) {
		const sib = children[i];
		if (sib.nodeType === typeId) {
			index++;
		}
		if (sib == node) break;
	}

	return index;
}

/**
 * Gets the index of a text node in its parent
 * @param {Node} textNode
 * @returns {number} index
 */
export const indexOfTextNode = (textNode: Node): number => {

	return indexOfNode(textNode, Node.TEXT_NODE);
}

/**
 * Gets the index of an element node in its parent
 * @param {Element} elementNode
 * @returns {number} index
 */
export const indexOfElementNode = (elementNode: Element): number => {

	return indexOfNode(elementNode, Node.ELEMENT_NODE);
}

/**
 * Check if extension is xml
 * @param {string} ext
 * @returns {boolean}
 */
export const isXml = (ext: string): boolean => {

	return ["xml", "opf", "ncx"].indexOf(ext) > -1;
}

/**
 * Create a new blob
 * @param {any} content
 * @param {string} mime
 * @returns {Blob}
 */
export const createBlob = (content: any, mime: string): Blob => {

	return new Blob([content], { type: mime });
}

/**
 * Create a new blob url
 * @param {any} content
 * @param {string} mime
 * @returns {string} url
 */
export const createBlobUrl = (content: any, mime: string): string => {

	const blob = createBlob(content, mime);
	return URL.createObjectURL(blob);
}

/**
 * Remove a blob url
 * @param {string} url
 */
export const revokeBlobUrl = (url: string): void => {

	return URL.revokeObjectURL(url);
}

/**
 * Create a new base64 encoded url
 * @param {any} content
 * @param {string} mime
 * @returns {string|undefined} url
 */
export const createBase64Url = (content: any, mime: string): string | undefined => {

	if (typeof (content) !== "string") {
		// Only handles strings
		return;
	}

	const data = btoa(content);
	const datauri = "data:" + mime + ";base64," + data;

	return datauri;
}

/**
 * Get type of an object
 * @param {any} obj
 * @returns {string} type
 */
export const type = (obj: any): string => {

	return Object.prototype.toString.call(obj).slice(8, -1);
}

/**
 * Parse xml (or html) markup
 * @param {string} markup
 * @param {string} mime
 * @returns {Document} document
 */
export const parse = (markup: string, mime: string): Document => {

	// Remove byte order mark before parsing
	// https://www.w3.org/International/questions/qa-byte-order-mark
	if (markup.charCodeAt(0) === 0xFEFF) {
		markup = markup.slice(1);
	}

	const parser = new DOMParser();
	return parser.parseFromString(markup, mime as any);
}

/**
 * querySelector polyfill
 * @param {Element|Document} el
 * @param {string} sel selector string
 * @returns {Element|null|undefined} element
 */
export const qs = (el: Element | Document, sel: string): Element | null | undefined => {

	if (!el) {
		throw new Error("No Element Provided");
	}

	if (typeof el.querySelector !== "undefined") {
		return el.querySelector(sel);
	} else {
		const elements = (el as Element).getElementsByTagName(sel);
		if (elements.length) {
			return elements[0];
		}
	}
}

/**
 * querySelectorAll polyfill
 * @param {Element|Document} el
 * @param {string} sel selector string
 * @returns {NodeList|HTMLCollectionOf<Element>} elements
 */
export const qsa = (el: Element | Document, sel: string): NodeList | HTMLCollectionOf<Element> => {

	if (typeof el.querySelectorAll !== "undefined") {
		return el.querySelectorAll(sel);
	} else {
		return (el as Element).getElementsByTagName(sel);
	}
}

/**
 * querySelector by property
 * @param {any} el
 * @param {string} sel selector string
 * @param {any} props
 * @returns {Element|null|undefined} elements
 */
export const qsp = (el: any, sel: string, props: any): Element | null | undefined => {

	if (typeof el.querySelector !== "undefined") {
		let selector = sel + "[";
		for (const prop in props) {
			selector += prop + "~='" + props[prop] + "'";
		}
		selector += "]";
		return el.querySelector(selector);
	} else {
		const q = el.getElementsByTagName(sel);
		const filtered = Array.prototype.slice.call(q, 0).filter((el: Element) => {
			for (const prop in props) {
				if (el.getAttribute(prop) === props[prop]) {
					return true;
				}
			}
			return false;
		});

		if (filtered && filtered.length > 0) {
			return filtered[0];
		}
	}
}

/**
 * Sprint through all text nodes in a document
 * @param {Element|Document} root element to start with
 * @param {function} func function to run on each element
 */
export const sprint = (root: Element | Document, func: (node: Node) => void): void => {

	const doc = root.ownerDocument || (root as Document);
	if (typeof (doc.createTreeWalker) !== "undefined") {
		treeWalker(root, func, NodeFilter.SHOW_TEXT);
	} else {
		walk(root, (node: Node) => {
			if (node && node.nodeType === Node.TEXT_NODE) {
				func(node);
			}
			return false;
		});
	}
}

/**
 * Create a treeWalker
 * @param {Element|Document} root element to start with
 * @param {function} func function to run on each element
 * @param {number|NodeFilter} filter function or object to filter with
 */
export const treeWalker = (root: Element | Document, func: (node: Node) => void, filter: number | NodeFilter): void => {

	const treeWalker = document.createTreeWalker(root, filter as any, null, false);
	let node: Node | null;
	while (node = treeWalker.nextNode()) {
		func(node);
	}
}

/**
 * @param {Node} node
 * @param {function} callback false for continue,true for break inside callback
 * @returns {boolean}
 */
export const walk = (node: Node, callback: (node: Node) => boolean): boolean => {

	if (callback(node)) {
		return true;
	}
	let child = node.firstChild;
	if (child) {
		do {
			let walked = walk(child, callback); // recursive call
			if (walked) {
				return true;
			}
			child = child.nextSibling;
		} while (child);
	}
	return false;
}

/**
 * Convert a blob to a base64 encoded string
 * @param {Blob} blob
 * @returns {Promise<string|ArrayBuffer|null>}
 */
export const blob2base64 = (blob: Blob): Promise<string | ArrayBuffer | null> => {

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.readAsDataURL(blob);
		reader.onloadend = () => {
			resolve(reader.result);
		};
		reader.onerror = reject;
	});
}

/**
 * querySelector with filter by epub type
 * @param {any} html
 * @param {string} element element type to find
 * @param {string} type epub type to find
 * @returns {Element|undefined} elements
 */
export const querySelectorByType = (html: any, element: string, type: string): Element | undefined => {

	let query: any;
	if (typeof html.querySelector !== "undefined") {
		query = html.querySelector(`${element}[*|type="${type}"]`);
	}
	// Handle IE not supporting namespaced epub:type in querySelector
	if (!query) {
		const elements = qsa(html, element);
		for (let i = 0; i < elements.length; i++) {
			const el = elements[i] as Element;
			if (el.getAttributeNS("http://www.idpf.org/2007/ops", "type") === type ||
				el.getAttribute("epub:type") === type) {
				return el;
			}
		}
	} else {
		return query;
	}
}

/**
 * Find direct descendents of an element
 * @param {Element} el
 * @returns {Element[]} children
 */
export const findChildren = (el: Element): Element[] => {

	const result: Element[] = [];
	const childNodes = el.childNodes;
	for (let i = 0; i < childNodes.length; i++) {
		const node = childNodes[i];
		if (node.nodeType === Node.ELEMENT_NODE) {
			result.push(node as Element);
		}
	}
	return result;
}

/**
 * Find all parents (ancestors) of an element
 * @param {Node} node
 * @returns {Node[]} parents
 */
export const parents = (node: Node): Node[] => {

	const nodes: Node[] = [node];
	let parent = node.parentNode;
	while (parent) {
		nodes.unshift(parent);
		parent = parent.parentNode;
	}
	return nodes
}

/**
 * Find all direct descendents of a specific type
 * @param {Element} el
 * @param {string} nodeName
 * @param {boolean} [single]
 * @returns {any} children
 */
export const filterChildren = (el: Element, nodeName: string, single?: boolean): any => {

	const result: Element[] = [];
	const childNodes = el.childNodes;
	for (let i = 0; i < childNodes.length; i++) {
		const node = childNodes[i];
		if (node.nodeType === Node.ELEMENT_NODE &&
			node.nodeName.toLowerCase() === nodeName) {
			if (single) {
				return node;
			} else {
				result.push(node as Element);
			}
		}
	}
	if (!single) {
		return result;
	}
}

/**
 * Filter all parents (ancestors) with tag name
 * @param {Node} node
 * @param {string} tagname
 * @returns {Element|undefined} parents
 */
export const getParentByTagName = (node: Node, tagname: string): Element | undefined => {

	if (node === null || tagname === "") return;
	let parent = node.parentNode;
	while (parent && parent.nodeType === Node.ELEMENT_NODE) {
		if ((parent as Element).tagName.toLowerCase() === tagname) {
			return parent as Element;
		}
		parent = parent.parentNode;
	}
}