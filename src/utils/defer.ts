import { uuid } from "./core";

/**
 * Creates a new pending promise and provides methods to resolve or reject it.
 */
class Defer<T = any> {
  id: string;
  dump: any;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  promise: Promise<T>;

    /**
     * Constructor
     */
    constructor() {
        /**
         * @member {string} id
         * @memberof Defer
         * @readonly
         */
        this.id = uuid();
        /**
         * Dump for debug trace
         * @member {object} dump
         * @memberof Defer
         */
        this.dump = {};
        /**
         * A newly created Pomise object.
         * Initially in pending state.
         * @member {Promise} promise
         * @memberof Defer
         * @readonly
         */
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    /**
     * Dectroy the Defer object
     */
    destroy() {
        this.resolve = undefined as any;
        this.reject = undefined as any;
        this.promise = undefined as any;
    }
}

export default Defer;