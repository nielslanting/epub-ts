import EventEmitter from "event-emitter";
import localforage from "localforage";
import request from "./utils/request";
import mime from "./utils/mime";
import Defer from "./utils/defer";
import Input from "./input";

/**
 * Handles saving and requesting files from local storage
 * @extends {Input}
 */
class Storage extends Input {
	name: string;
	online: boolean;
	declare instance: LocalForage;
	/**
	 * Constructor
	 * @param {string} name This should be the name of the application for modals
	 */
	constructor(name: string) {
		super();
		/**
		 * @member {string} name
		 * @memberof Storage
		 * @readonly
		 */
		this.name = name;
		/**
		 * @member {boolean} online Current status
		 * @memberof Storage
		 * @readonly
		 */
		this.online = window.navigator.onLine;
		this.instance = null as any; // initialized later or let's create it in constructor actually? No, createInstance handles it
	}

	/**
	 * Create LocalForage instance
	 */
	createInstance(): void {
		if (localforage) {
			this.instance = localforage.createInstance({
				name: this.name
			});
			this.appendListeners();
		} else {
			throw new TypeError("LocalForage lib not loaded");
		}
	}

	/**
	 * Append event listeners
	 * @private
	 */
	appendListeners(): void {
		window.addEventListener("online", this.status.bind(this));
		window.addEventListener("offline", this.status.bind(this));
	}

	/**
	 * Remove event listeners
	 * @private
	 */
	removeListeners(): void {
		window.removeEventListener("online", this.status.bind(this));
		window.removeEventListener("offline", this.status.bind(this));
	}

	/**
	 * Update the online / offline status
	 * @param {Event} event 
	 * @private
	 */
	status(event: Event): void {
		this.online = event.type === "online";

		if (this.online) {
			this.emit("online");
		} else {
			this.emit("offline");
		}
	}

	/**
	 * Get entry from Storage
	 * @param {string|number} input key
	 * @returns {Promise<any>}
	 * @example storage.get(0).then(data => ...)
	 * @example storage.get('https://example.com/to/book.epub').then(data => ...)
	 */
	async get(input: string | number): Promise<any> {
		const key = this.getKey(input);
		return this.instance.getItem(key);
	}

	/**
	 * Set data into Storage
	 * @param {string|number} input
	 * @param {any} data
	 * @return {Promise<any>}
	 */
	async set(input: string | number, data: any): Promise<any> {
		const key = this.getKey(input);
		return this.instance.setItem(key, data);
	}

	/**
	 * Put data into Storage
	 * @param {string} url 
	 * @returns {Promise<any>}
	 */
	async put(url: string): Promise<any> {
		return this.get(url).then((data) => {
			return data || request(url, "binary").then((result) => {
				return this.set(url, result);
			});
		});
	}

	/**
	 * Dispatch a request by URL
	 * @param {string} url a url to request from storage
	 * @param {string} [type] specify the type of the returned result
	 * @param {boolean} [withCredentials]
	 * @param {any} [headers]
	 * @return {Promise<any>}
	 */
	async dispatch(url: string, type?: string, withCredentials?: boolean, headers?: any): Promise<any> {
		if (this.online) {
			//-- From network
			const tasks: Promise<any>[] = [];
			tasks.push(request(
				url,
				type,
				withCredentials,
				headers
			));
			tasks.push(this.put(url));
			return Promise.all(tasks).then((result) => {
				return result[0] || null;
			});
		} else {
			//-- From storage
			return this.request(url, type);
		}
	}

	/**
	 * Get entry key from input
	 * @param {string|number} input 
	 * @returns {string} key
	 * @private
	 */
	getKey(input: string | number): string {
		let key: string;
		if (typeof input === "string") {
			key = input;
		} else {
			key = `book-${input}`;
		}
		return key;
	}

	/**
	 * Get a Blob from Storage by URL
	 * @param {string} url
	 * @param {string} [mimeType]
	 * @returns {Promise<Blob|null>}
	 * @override
	 */
	async getBlob(url: string, mimeType?: string): Promise<Blob | null> {
		return this.get(url).then((data) => {
			if (!data) return null;
			const type = mimeType || mime.lookup(url);
			return new Blob([data], { type });
		});
	}

	/**
	 * Get a Text from Storage by URL
	 * @param {string} url
	 * @param {string} [mimeType]
	 * @returns {Promise<string|null>}
	 * @override
	 */
	async getText(url: string, mimeType?: string): Promise<string | null> {
		return this.get(url).then((data) => {
			if (!data) return null;
			const def = new Defer<string>();
			const reader = new FileReader();
			const type = mimeType || mime.lookup(url);
			const blob = new Blob([data], { type });
			reader.onloadend = () => {
				def.resolve(reader.result as string);
			};
			reader.readAsText(blob, type);
			return def.promise;
		});
	}

	/**
	 * Get a base64 encoded result from Storage by URL
	 * @param {string} url
	 * @param {string} [mimeType]
	 * @returns {Promise<string|null>} base64 encoded
	 * @override
	 */
	async getBase64(url: string, mimeType?: string): Promise<string | null> {
		return this.get(url).then((data) => {
			if (!data) return null;
			const def = new Defer<string>();
			const reader = new FileReader();
			const type = mimeType || mime.lookup(url);
			const blob = new Blob([data], { type });
			reader.onloadend = () => {
				def.resolve(reader.result as string);
			};
			reader.readAsDataURL(blob, type);
			return def.promise;
		});
	}

	/**
	 * destroy
	 * @override
	 */
	destroy(): void {
		super.destroy();
		this.removeListeners();
	}
}

// Ensure EventEmitter is merged into prototype.
interface Storage extends EventEmitter.Emitter {}
EventEmitter(Storage.prototype);

export default Storage;
