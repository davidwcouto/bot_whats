import { default as JSZip } from 'jszip';
import { File } from '../../file/file';
import { PrettifyType } from './packer';
export type IXmlifyedFile = {
    readonly data: string;
    readonly path: string;
};
export declare class Compiler {
    private readonly formatter;
    private readonly imageReplacer;
    private readonly numberingReplacer;
    constructor();
    compile(file: File, prettifyXml?: (typeof PrettifyType)[keyof typeof PrettifyType], overrides?: readonly IXmlifyedFile[]): JSZip;
    private xmlifyFile;
}
