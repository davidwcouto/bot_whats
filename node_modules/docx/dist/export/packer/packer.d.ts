import { Stream } from 'stream';
import { File } from '../../file/file';
import { OutputByType, OutputType } from '../../util/output-type';
import { IXmlifyedFile } from './next-compiler';
export declare const PrettifyType: {
    readonly NONE: "";
    readonly WITH_2_BLANKS: "  ";
    readonly WITH_4_BLANKS: "    ";
    readonly WITH_TAB: "\t";
};
export declare class Packer {
    static pack<T extends OutputType>(file: File, type: T, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<OutputByType[T]>;
    static toString(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<string>;
    static toBuffer(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<Buffer>;
    static toBase64String(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<string>;
    static toBlob(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<Blob>;
    static toArrayBuffer(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Promise<ArrayBuffer>;
    static toStream(file: File, prettify?: boolean | (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): Stream;
    private static readonly compiler;
}
