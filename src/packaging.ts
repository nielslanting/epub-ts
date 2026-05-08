import Metadata from "./packaging/metadata";
import Manifest from "./packaging/manifest";
import Spine from "./packaging/spine";
import { qs } from "./utils/core";

/**
 * Open Packaging Format Parser
 */
class Packaging {
	metadata: Metadata;
	manifest: Manifest;
	spine: Spine;
	direction: string | null;
	version: string | null;
	uniqueIdentifier: string | null;

	/**
	 * Constructor
	 */
	constructor() {
		/**
		 * @member {Metadata} metadata
		 * @memberof Packaging
		 * @readonly
		 */
		this.metadata = new Metadata();
		/**
		 * @member {Manifest} manifest
		 * @memberof Packaging
		 * @readonly
		 */
		this.manifest = new Manifest();
		/**
		 * @member {Spine} spine
		 * @memberof Packaging
		 * @readonly
		 */
		this.spine = new Spine();
		/**
		 * @member {string|null} direction
		 * @memberof Packaging
		 * @readonly
		 */
		this.direction = null;
		/**
		 * @member {string|null} version Package version
		 * @memberof Packaging
		 * @readonly
		 */
		this.version = null;
		/**
		 * @member {string|null} uniqueIdentifier
		 * @memberof Packaging
		 * @readonly
		 */
		this.uniqueIdentifier = null;
	}

	/**
	 * Clear packaging parts
	 */
	clear(): void {
		this.metadata.clear();
		this.manifest.clear();
		this.spine.clear();
		this.direction = null;
		this.version = null;
		this.uniqueIdentifier = null;
	}

	/**
	 * Parse OPF XML
	 * @param {Document} packageXml OPF XML
	 * @return {Promise<Packaging>}
	 */
	async parse(packageXml: Document): Promise<Packaging> {
		if (!packageXml) {
			throw new Error("Package File Not Found");
		}

		const metadataNode = qs(packageXml, "metadata");
		if (!metadataNode) {
			throw new Error("No Metadata Found");
		}

		const manifestNode = qs(packageXml, "manifest");
		if (!manifestNode) {
			throw new Error("No Manifest Found");
		}

		const spineNode = qs(packageXml, "spine");
		if (!spineNode) {
			throw new Error("No Spine Found");
		}

		const tasks: Promise<any>[] = [];
		tasks.push(this.metadata.parse(metadataNode));
		tasks.push(this.manifest.parse(manifestNode));
		tasks.push(this.spine.parse(spineNode));
		this.direction = this.parseDirection(packageXml, spineNode);
		this.version = this.parseVersion(packageXml);
		this.uniqueIdentifier = this.metadata.get("identifier");
		if (typeof this.uniqueIdentifier === "undefined") {
			this.uniqueIdentifier = this.findUniqueIdentifier(packageXml);
		}

		return Promise.all(tasks).then(() => {
			return this;
		});
	}

	/**
	 * Parse direction flow
	 * @param {Document} packageXml
	 * @param {Element} node spine node 
	 * @returns {string}
	 * @private
	 */
	parseDirection(packageXml: Document, node: Element): string {
		const el = packageXml.documentElement;
		let dir = el.getAttribute("dir");
		if (dir === null) {
			dir = node.getAttribute("page-progression-direction");
		}
		return dir || "";
	}

	/**
	 * Parse package version
	 * @param {Document} packageXml 
	 * @returns {string}
	 * @private
	 */
	parseVersion(packageXml: Document): string {
		const el = packageXml.documentElement;
		return el.getAttribute("version") || "";
	}

	/**
	 * Find Unique Identifier
	 * @param {Document} packageXml
	 * @return {string} Unique Identifier text
	 * @private
	 */
	findUniqueIdentifier(packageXml: Document): string {
		const el = packageXml.documentElement;
		const uniqueIdentifier = el.getAttribute("unique-identifier");
		if (!uniqueIdentifier) {
			return "";
		}

		const identifier = packageXml.getElementById(uniqueIdentifier);
		if (!identifier) {
			return "";
		}

		if (identifier.localName === "identifier" &&
			identifier.namespaceURI === "http://purl.org/dc/elements/1.1/") {
			return identifier.childNodes.length > 0 ? (identifier.childNodes[0].nodeValue?.trim() || "") : "";
		}

		return "";
	}

	/**
	 * Load package from JSON
	 * @param {any} data Serialized JSON object data
	 * @return {Promise<Packaging>}
	 */
	async load(data: any): Promise<Packaging> {
		const tasks: Promise<any>[] = [];
		tasks.push(this.metadata.load(data.metadata));
		tasks.push(this.manifest.load(data.manifest));
		tasks.push(this.spine.load(data.spine));
		this.direction = data.direction;
		this.version = data.version;
		this.uniqueIdentifier = this.metadata.get("identifier");

		return Promise.all(tasks).then(() => {
			return this;
		});
	}

	/**
	 * destroy
	 */
	destroy(): void {
		this.metadata.destroy();
		this.manifest.destroy();
		this.spine.destroy();

		this.metadata = undefined as any;
		this.manifest = undefined as any;
		this.spine = undefined as any;
		this.direction = undefined as any;
		this.version = undefined as any;
		this.uniqueIdentifier = undefined as any;
	}
}

export default Packaging;
