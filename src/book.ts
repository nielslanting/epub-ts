import EventEmitter from "event-emitter";
import { extend } from "./utils/core";
import Defer from "./utils/defer";
import Url from "./utils/url";
import Path from "./utils/path";
import Locations from "./locations";
import Container from "./container";
import Packaging from "./packaging";
import Navigation from "./navigation";
import Resources from "./resources";
import Rendition, { RenditionOptions } from "./rendition";
import Archive from "./archive";
import request from "./utils/request";
import EpubCFI from "./epubcfi";
import Section from "./section";
import Storage from "./storage";
import {
	EPUBJS_NAME,
	EPUBJS_VERSION,
	EVENTS
} from "./utils/constants";
import Sections from "./sections";

const CONTAINER_PATH_0 = "META-INF/container.xml";
const CONTAINER_PATH_1 = "META-INF/container.json";
const INPUT_TYPE = {
	BINARY: "binary",
	BASE64: "base64",
	EPUB: "epub",
	DIRECTORY: "directory"
};

export interface BookRequestOptions {
	method?: Function;
	withCredentials?: boolean;
	headers?: any;
	[key: string]: any;
}

export interface BookOptions {
	format?: string;
	request?: BookRequestOptions;
	encoding?: string;
	replacements?: string;
	canonical?: (path: string) => string;
	store?: string;
	[key: string]: any;
}

interface Book extends EventEmitter.Emitter {}

/**
 * An Epub representation with methods for the loading, 
 * parsing and manipulation of its contents.
 */
class Book {
	settings: BookOptions;
	request: any;
	archive?: Archive;
	storage: Storage;
	rendition?: Rendition;
	container: Container;
	packaging: Packaging;
	resources: Resources;
	sections: Sections;
	locations: Locations;
	navigation: Navigation;
	url?: Url;
	archived?: boolean;
	cover?: string | null;
	path?: Path;
	isOpen?: boolean;
	opening: Defer<Book>;
	opened: Promise<Book>;
	loading: {
		packaging: Defer<Packaging>;
		resources: Defer<Resources>;
		navigation: Defer<Navigation>;
		sections: Defer<Sections>;
		cover: Defer<string | null>;
	};
	loaded: {
		packaging: Promise<Packaging>;
		resources: Promise<Resources>;
		navigation: Promise<Navigation>;
		sections: Promise<Sections>;
		cover: Promise<string | null>;
	};

	/**
	 * Constructor
	 * @param {string|ArrayBuffer} [input] Url, Path or ArrayBuffer
	 * @param {BookOptions} [options]
	 * @param {string} [options.format='xml'] epub container format
	 * @param {object} [options.request] object options to xhr request
	 * @param {Function} [options.request.method] a request function to use instead of the default
	 * @param {boolean} [options.request.withCredentials=false] send the xhr request withCredentials
	 * @param {string[]} [options.request.headers=[]] send the xhr request headers
	 * @param {string} [options.encoding='binary'] optional to pass `"binary"` or `"base64"` for archived Epubs
	 * @param {string} [options.replacements=null] use `"base64"` or `"blobUrl"` for replacing assets
	 * @param {Function} [options.canonical] optional function to determine canonical urls for a path
	 * @param {string} [options.store=null] cache the contents in local storage, value should be the name of the reader
	 * @example new Book()
	 * @example new Book("/path/to/book/", { store: "epub-js" })
	 * @example new Book({ replacements: "base64", store: "epub-js" })
	 */
	constructor(input?: any, options?: BookOptions) {

		if (typeof (options) === "undefined" &&
			typeof (input) !== "string" &&
			input instanceof Blob === false &&
			input instanceof ArrayBuffer === false) {
			options = input;
			input = undefined;
		}

		this.settings = extend({
			canonical: undefined,
			encoding: undefined,
			replacements: null,
			request: {
				method: undefined,
				withCredentials: false,
				headers: []
			},
			store: null
		}, options || {});
		/**
		 * @member {Function} request
		 * @memberof Book
		 * @readonly
		 */
		this.request = this.settings.request!.method || request;
		/**
		 * @member {Archive} archive
		 * @memberof Book
		 * @private
		 */
		this.archive = undefined;
		/**
		 * @member {Storage} storage
		 * @memberof Book
		 * @readonly
		 */
		this.storage = new Storage(this.settings.store);
		/**
		 * @member {Rendition} rendition
		 * @memberof Book
		 * @readonly
		 */
		this.rendition = undefined;
		/**
		 * @member {Container} container
		 * @memberof Book
		 * @readonly
		 */
		this.container = new Container();
		/**
		 * @member {Packaging} packaging
		 * @memberof Book
		 * @readonly
		 */
		this.packaging = new Packaging();
		/**
		 * @member {Resources} resources
		 * @memberof Book
		 * @readonly
		 */
		this.resources = new Resources(
			this.request.bind(this),
			this.resolve.bind(this),
			this.settings.replacements
		);
		/**
		 * @member {Sections} sections
		 * @memberof Book
		 * @readonly
		 */
		this.sections = new Sections();
		/**
		 * @member {Locations} locations
		 * @memberof Book
		 * @readonly
		 */
		this.locations = new Locations(
			this.sections as any,
			this.load.bind(this)
		);
		/**
		 * @member {Navigation} navigation
		 * @memberof Book
		 * @readonly
		 */
		this.navigation = new Navigation();
		/**
		 * @member {Url} url
		 * @memberof Book
		 * @readonly
		 */
		this.url = undefined;

		this.opening = new Defer<Book>();
		this.opened = this.opening.promise;
		this.loading = {
			packaging: new Defer<Packaging>(),
			resources: new Defer<Resources>(),
			navigation: new Defer<Navigation>(),
			sections: new Defer<Sections>(),
			cover: new Defer<string | null>(),
		};
		this.loaded = {
			packaging: this.loading.packaging.promise,
			resources: this.loading.resources.promise,
			navigation: this.loading.navigation.promise,
			sections: this.loading.sections.promise,
			cover: this.loading.cover.promise
		};

		if (this.settings.store) {
			this.storage.createInstance();
		}

		if (input) {
			this.open(input).catch((error: Error) => {
				/**
				 * @event openFailed
				 * @param {object} error
				 * @memberof Book
				 */
				this.emit(EVENTS.BOOK.OPEN_FAILED, error);
			});
		}
	}

	/**
	 * Init Promises
	 * @private
	 */
	init() {
		/**
		 * @member {boolean} archived
		 * @memberof Book
		 * @readonly
		 */
		this.archived = false;
		/**
		 * @member {string} cover
		 * @memberof Book
		 * @readonly
		 */
		this.cover = null;
		/**
		 * @member {Path} path
		 * @memberof Book
		 * @readonly
		 */
		this.path = undefined;
		/**
		 * @member {boolean} isOpen
		 * @memberof Book
		 * @readonly
		 */
		this.isOpen = false;
		this.opening = new Defer<Book>();
		/**
		 * @member {Promise<Book>} opened returns after the book is loaded
		 * @memberof Book
		 * @readonly
		 */
		this.opened = this.opening.promise;
		this.loading = {
			packaging: new Defer<Packaging>(),
			resources: new Defer<Resources>(),
			navigation: new Defer<Navigation>(),
			sections: new Defer<Sections>(),
			cover: new Defer<string | null>(),
		};
		/**
		 * Sequential loading of tasks
		 * @member {object} loaded
		 * @property {Promise<Packaging>} packaging
		 * @property {Promise<Resources>} resources
		 * @property {Promise<Navigation>} navigation
		 * @property {Promise<Sections>} sections
		 * @property {Promise<string>} cover
		 * @memberof Book
		 * @readonly
		 */
		this.loaded = {
			packaging: this.loading.packaging.promise,
			resources: this.loading.resources.promise,
			navigation: this.loading.navigation.promise,
			sections: this.loading.sections.promise,
			cover: this.loading.cover.promise
		};
	}

	/**
	 * Clear parts
	 */
	clear() {

		this.container.clear();
		this.packaging.clear();
		this.resources.clear();
		this.navigation.clear();
		this.sections.clear();
		this.locations.clear();
		if (this.archive) {
			this.archive.clear();
		}
	}

	/**
	 * Open a epub or url
	 * @param {string|ArrayBuffer} input Url, Path or ArrayBuffer
	 * @param {string} [openAs] input type: `"binary"` OR `"base64"` OR `"epub"` OR `"json"` OR `"directory"`
	 * @returns {Promise<Book>} of when the book has been loaded
	 * @example book.open("/path/to/book/")
	 * @example book.open("/path/to/book.epub")
	 * @example book.open("https://example.com/book/")
	 * @example book.open("https://example.com/book.epub")
	 * @example book.open([arraybuffer], "binary")
	 */
	async open(input: string | ArrayBuffer, openAs?: string): Promise<Book> {

		this.init();
		const type = openAs || this.determineType(input);

		if (this.settings.store) {
			this.store(input);
		}

		let opening: Promise<any>;
		if (type === INPUT_TYPE.BINARY) {
			this.archived = true;
			this.url = new Url("/", "");
			opening = this.openEpub(input);
		} else if (type === INPUT_TYPE.BASE64) {
			this.archived = true;
			this.url = new Url("/", "");
			opening = this.openEpub(input, type);
		} else if (type === INPUT_TYPE.EPUB) {
			this.archived = true;
			this.url = new Url("/", "");
			opening = this.request(input, "binary",
				this.settings.request!.withCredentials,
				this.settings.request!.headers
			).then(this.openEpub.bind(this));
		} else {
			this.url = new Url(input as string);
			let path;
			if (this.settings.format === "json") {
				path = CONTAINER_PATH_1;
			} else {
				path = CONTAINER_PATH_0;
			}
			opening = this.openContainer(path, type);
		}

		return opening;
	}

	/**
	 * Open an archived epub
	 * @param {string|ArrayBuffer} input
	 * @param {string} [type] input type: `"base64"`
	 * @returns {Promise<Book>}
	 * @private
	 */
	async openEpub(input: string | ArrayBuffer, type?: string): Promise<Book> {

		const encoding = type || this.settings.encoding;

		return this.unarchive(input, encoding).then(() => {
			return this.openContainer(CONTAINER_PATH_0);
		});
	}

	/**
	 * Open the epub container
	 * @param {string} url
	 * @param {string} [type]
	 * @returns {Promise<any>}
	 * @private
	 */
	async openContainer(url: string, type?: string): Promise<any> {

		return this.load(url).then((data) => {
			if (this.settings.format === "json") {
				return this.container.load(data);
			} else {
				return this.container.parse(data);
			}
		}).then((container) => {
			const uri = this.resolve(container.fullPath);
			return this.openPackaging(uri);
		});
	}

	/**
	 * Open the package.opf
	 * @param {string} url
	 * @returns {Promise<any>}
	 * @private
	 */
	async openPackaging(url: string): Promise<any> {

		this.path = new Path(url);
		return this.load(url).then((data) => {
			if (this.settings.format === "json") {
				return this.packaging.load(data);
			} else {
				return this.packaging.parse(data);
			}
		}).then(() => {
			return this.loadNavigation();
		}).then(() => {
			return this.unpack();
		});
	}

	/**
	 * Load a resource from the Book
	 * @param {string} path path to the resource to load
	 * @param {string} [type=null] 
	 * @returns {Promise<any>} returns a promise with the requested resource
	 */
	load(path: string, type: string | null = null): Promise<any> {

		const resolved = this.resolve(path);

		if (this.archived) {
			return this.archive!.request(resolved);
		} else {
			return this.request(resolved, type,
				this.settings.request!.withCredentials,
				this.settings.request!.headers);
		}
	}

	/**
	 * Resolve a path to it's absolute position in the Book
	 * @param {string} path
	 * @param {boolean} [absolute=false] force resolving the full URL
	 * @returns {string} the resolved path string
	 */
	resolve(path: string, absolute: boolean = false): string {

		if (!path) return "";

		if (path.indexOf("://") > -1) {
			return path; // is absolute
		}

		let resolved = path;
		if (this.path) {
			resolved = this.path.resolve(this.path.directory, path);
		}

		if (absolute === false && this.url) {
			resolved = this.url.resolve(resolved);
		}

		return resolved;
	}

	/**
	 * Get a canonical link to a path
	 * @param {string} path
	 * @returns {string} the canonical path string
	 */
	canonical(path: string): string {

		if (!path) return "";

		let url;
		if (this.settings.canonical) {
			url = this.settings.canonical(path);
		} else {
			url = this.resolve(path, true);
		}

		return url;
	}

	/**
	 * Determine the type of they input passed to open
	 * @param {string|ArrayBuffer} input
	 * @returns {string} values: `"binary"` OR `"directory"` OR `"epub"` OR `"opf"`
	 * @private
	 */
	determineType(input: string | ArrayBuffer): string {

		if (this.settings.encoding === "base64") {
			return INPUT_TYPE.BASE64;
		}

		if (typeof (input) !== "string") {
			return INPUT_TYPE.BINARY;
		}

		const path = new Url(input).path;

		let extension = path.extension;
		// If there's a search string, remove it before determining type
		if (extension) {
			extension = extension.replace(/\?.*$/, "");
		}

		if (extension === "epub") {
			return INPUT_TYPE.EPUB;
		} else {
			return INPUT_TYPE.DIRECTORY;
		}
	}

	/**
	 * Unpack the contents of the book packaging
	 * @returns {Promise<Book>}
	 * @private
	 */
	async unpack(): Promise<Book> {

		this.loading.packaging.resolve(this.packaging);
		this.loading.navigation.resolve(this.navigation);
		this.resources.unpack(
			this.packaging.manifest as any,
			this.archive,
			this.storage
		).then((resources: any) => {
			this.loading.resources.resolve(resources);
		});
		this.sections.unpack(
			this.packaging as any,
			this.navigation as any,
			this.resolve.bind(this),
			this.canonical.bind(this)
		).then((sections: any) => {
			this.loading.sections.resolve(sections);
		});

		if (this.resources.replacements) {
			(this.sections.hooks as any).serialize.register(
				this.resources.substitute.bind(this.resources)
			);
		}

		if ((this.packaging.manifest as any).coverPath) {
			this.cover = this.resolve((this.packaging.manifest as any).coverPath);
		}

		this.loading.cover.resolve(this.cover || null);
		const tasks = [...Object.values(this.loaded)];

		return Promise.all(tasks).then(() => {
			this.isOpen = true;
			this.opening.resolve(this)
			return this.opened;
		});
	}

	/**
	 * Load navigation
	 * @returns {Promise<Navigation>}
	 * @private
	 */
	async loadNavigation(): Promise<Navigation> {

		const navPath = (this.packaging.manifest as any).navPath;

		if (navPath) {
			return this.load(navPath).then((data) => {
				if (this.settings.format === "json") {
					return this.navigation.load(data);
				} else {
					return this.navigation.parse(data);
				}
			});
		} else {
			return Promise.resolve(this.navigation);
		}
	}

	/**
	 * Gets a Section of the Book from the Spine
	 * Alias for `book.sections.get`
	 * @param {string|number} [target]
	 * @returns {Section|null}
	 * @example book.section()
	 * @example book.section(3)
	 * @example book.section("#chapter_001")
	 * @example book.section("chapter_001.xhtml")
	 * @example book.section("epubcfi(/6/8!/4/2/16/1:0)")
	 */
	section(target?: string | number): Section | null {

		return this.sections.get(target as any) as any;
	}

	/**
	 * Sugar to render a book to an element
	 * @param {Element|string} element element or string to add a rendition to
	 * @param {RenditionOptions} [options]
	 * @returns {Rendition}
	 */
	renderTo(element: Element | string, options?: RenditionOptions): Rendition {

		const method = "blobUrl";

		if (this.settings.replacements === method) {
			options = extend({ method }, options || {})
		}
		this.rendition = new Rendition(this, options);
		this.rendition.attachTo(element);

		return this.rendition;
	}

	/**
	 * Set if request should use withCredentials
	 * @param {boolean} credentials
	 */
	setRequestCredentials(credentials: boolean) {

		this.settings.request!.withCredentials = credentials;
	}

	/**
	 * Set headers request should use
	 * @param {string[]} headers
	 */
	setRequestHeaders(headers: any[]) {

		this.settings.request!.headers = headers;
	}

	/**
	 * Unarchive a zipped epub
	 * @param {string|ArrayBuffer} input url string or arraybuffer data
	 * @param {string} [encoding] input type: `"base64"`
	 * @returns {Promise<any>}
	 * @private
	 */
	unarchive(input: string | ArrayBuffer, encoding?: string): Promise<any> {

		this.archive = new Archive();
		return this.archive.open(input, encoding);
	}

	/**
	 * Storage configure
	 * @param {string|ArrayBuffer} input
	 * @private
	 */
	store(input: string | ArrayBuffer) {

		if (typeof input === "string") {
			//-- replace request method to go through store
			this.request = this.storage.dispatch.bind(this.storage);
		}
	}

	/**
	 * Get the cover url
	 * @returns {Promise<string|null>} coverUrl
	 */
	async coverUrl(): Promise<string | null> {

		return this.loaded.cover.then(() => {
			if (this.archived && this.cover) {
				return this.resources.createUrl(this.cover);
			}
			return this.cover || null;
		});
	}

	/**
	 * Find a DOM Range for a given CFI Range
	 * @param {EpubCFI|string} cfiRange a epub cfi range
	 * @returns {Promise<Range>}
	 */
	async getRange(cfiRange: EpubCFI | string): Promise<Range> {

		const cfi = new EpubCFI(cfiRange);
		const item: any = this.sections.get(cfi.spinePos);
		const request = this.load.bind(this);
		if (!item) {
			return new Promise((resolve, reject) => {
				reject(new Error("CFI could not be found"));
			});
		}
		return item.load(request).then((contents: any) => {
			const range = cfi.toRange(item.document);
			return range;
		});
	}

	/**
	 * Generates the Book Key using the identifier in the manifest or other string provided
	 * @param {string} [identifier] to use instead of metadata identifier
	 * @returns {string} key
	 */
	key(identifier?: string): string {

		const ident = identifier ||
			(this.packaging.metadata as any).get("identifier") ||
			this.url!.filename;
		return `${EPUBJS_NAME}:${EPUBJS_VERSION}:${ident}`;
	}

	/**
	 * Destroy the Book and all associated objects
	 */
	destroy() {

		(this.isOpen as any) = undefined;
		(this.opened as any) = undefined;
		(this.loaded as any) = undefined;
		(this.opening as any) = undefined;
		(this.loading as any) = undefined;

		this.archive && this.archive.destroy();
		this.storage && this.storage.destroy();
		this.sections && this.sections.destroy();
		this.locations && this.locations.destroy();
		this.resources && this.resources.destroy();
		this.container && this.container.destroy();
		this.packaging && this.packaging.destroy();
		this.rendition && this.rendition.destroy();
		this.navigation && this.navigation.destroy();

		this.archive = undefined;
		(this.storage as any) = undefined;
		(this.archived as any) = undefined;
		(this.sections as any) = undefined;
		(this.locations as any) = undefined;
		(this.resources as any) = undefined;
		(this.container as any) = undefined;
		(this.packaging as any) = undefined;
		this.rendition = undefined;
		(this.navigation as any) = undefined;

		this.url = undefined;
		this.path = undefined;
		this.cover = undefined;
		this.request = undefined;
		(this.settings as any) = undefined;
	}
}

EventEmitter(Book.prototype);

export default Book;