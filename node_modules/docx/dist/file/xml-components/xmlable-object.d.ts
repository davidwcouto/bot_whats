export type IXmlAttribute = Readonly<Record<string, string | number | boolean>>;
export interface IXmlableObject extends Record<string, unknown> {
    readonly [key: string]: any;
}
export declare const WORKAROUND3 = "";
