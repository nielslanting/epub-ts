import request from "./utils/request";
import mime from "./utils/mime";
import Input from "./input";
import JSZip from "jszip";

/**
 * Handles Unzipping a requesting files from an Epub Archive
 * @extends {Input}
 */
class Archive extends Input {
	declare instance: JSZip;
	constructor() {
		super();
		this.instance = this.createInstance();
	}

	/**
	 * Create JSZip instance
	 * @returns {JSZip}
	 */
	createInstance(): JSZip {
		if (JSZip) {
			return new JSZip();
		} else {
			throw new Error("JSZip lib not loaded");
		}
	}

	/**
	 * Open an archive
	 * @param {string|ArrayBuffer} input
	 * @param {string} [encoding] tells JSZip if the input data is base64 encoded
	 * @returns {Promise<JSZip>} zipfile
	 */
	open(input: string | ArrayBuffer, encoding?: string): Promise<JSZip> {
		if (typeof input === "string" && encoding === "base64") {
			const data = input.split(",");
			input = data.length === 2 ? data[1] : input;
		}
		return this.instance.loadAsync(input, {
			base64: encoding === "base64"
		});
	}

	/**
	 * Clear the JSZip.files to empty
	 */
	clear(): void {
		const props = this.instance.files;
		Object.keys(props).forEach(p => this.instance.remove(p));
	}

	/**
	 * Load and Open an archive
	 * @param {string} zipUrl
	 * @param {boolean} [isBase64] tells JSZip if the input data is base64 encoded
	 * @returns {Promise<JSZip>} zipfile
	 */
	async openUrl(zipUrl: string, isBase64?: boolean): Promise<JSZip> {
		return request(zipUrl, "binary").then((data: any) => {
			return this.instance.loadAsync(data, {
				base64: isBase64
			});
		});
	}

	/**
	 * Get entry from Archive
	 * @param {string} url 
	 * @returns {JSZip.JSZipObject | null} entry
	 * @example archive.get("META-INF/container.xml")
	 */
	get(url: string): JSZip.JSZipObject | null {
		const path = url.length && url[0] === '/' ? url.substring(1) : url;
		const name = window.decodeURIComponent(path);
		return this.instance.file(name);
	}

	/**
	 * Get a Blob from Archive by URL
	 * @param {string} url
	 * @param {string} [mimeType]
	 * @returns {Promise<Blob|null>}
	 * @override
	 */
	async getBlob(url: string, mimeType?: string): Promise<Blob | null> {
		const entry = this.get(url);

		if (entry) {
			const type = mimeType || mime.lookup(entry.name);
			return entry.async("uint8array").then((data) => {
				return new Blob([data], { type });
			});
		} else {
			return Promise.resolve(null);
		}
	}

	/**
	 * Get Text from Archive by URL
	 * @param {string} url
	 * @returns {Promise<string|null>}
	 * @override
	 */
	async getText(url: string): Promise<string | null> {
		const entry = this.get(url);

		if (entry) {
			return entry.async("string").then((text) => {
				return text;
			});
		} else {
			return Promise.resolve(null);
		}
	}

	/**
	 * Get a base64 encoded result from Archive by URL
	 * @param {string} url
	 * @param {string} [mimeType]
	 * @returns {Promise<string|null>} base64 encoded
	 * @override
	 */
	async getBase64(url: string, mimeType?: string): Promise<string | null> {
		const entry = this.get(url);

		if (entry) {
			const type = mimeType || mime.lookup(entry.name);
			return entry.async("base64").then((data) => {
				return "data:" + type + ";base64," + data;
			});
		} else {
			return Promise.resolve(null);
		}
	}
}

export default Archive;
