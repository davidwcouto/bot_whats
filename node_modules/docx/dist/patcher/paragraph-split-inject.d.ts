import { Element } from 'xml-js';
export declare class TokenNotFoundError extends Error {
    constructor(token: string);
}
export declare const findRunElementIndexWithToken: (paragraphElement: Element, token: string) => number;
export declare const splitRunElement: (runElement: Element, token: string) => {
    readonly left: Element;
    readonly right: Element;
};
