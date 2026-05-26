import { ElementWrapper } from './traverser';
export type IRenderedParagraphNode = {
    readonly text: string;
    readonly runs: readonly IRenderedRunNode[];
    readonly index: number;
    readonly pathToParagraph: readonly number[];
};
type StartAndEnd = {
    readonly start: number;
    readonly end: number;
};
type IParts = {
    readonly text: string;
    readonly index: number;
} & StartAndEnd;
export type IRenderedRunNode = {
    readonly text: string;
    readonly parts: readonly IParts[];
    readonly index: number;
} & StartAndEnd;
export declare const renderParagraphNode: (node: ElementWrapper) => IRenderedParagraphNode;
export {};
