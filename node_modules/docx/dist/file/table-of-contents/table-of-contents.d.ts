import { FileChild } from '../file-child';
import { XmlComponent } from '../xml-components';
import { ITableOfContentsOptions } from './table-of-contents-properties';
type ToCEntry = {
    readonly title: string;
    readonly level: number;
    readonly page?: number;
    readonly href?: string;
};
export declare class TableOfContents extends FileChild {
    constructor(alias?: string, { contentChildren, cachedEntries, beginDirty, ...properties }?: ITableOfContentsOptions & {
        readonly contentChildren?: readonly (XmlComponent | string)[];
        readonly cachedEntries?: readonly ToCEntry[];
        readonly beginDirty?: boolean;
    });
    private getTabStopsForLevel;
    private buildCachedContentRun;
    private buildCachedContentParagraphChild;
}
export {};
