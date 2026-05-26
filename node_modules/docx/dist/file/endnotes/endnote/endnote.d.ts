import { Paragraph } from '../../paragraph';
import { XmlComponent } from '../../xml-components';
export declare const EndnoteType: {
    readonly SEPARATOR: "separator";
    readonly CONTINUATION_SEPARATOR: "continuationSeparator";
};
export type IEndnoteOptions = {
    readonly id: number;
    readonly type?: (typeof EndnoteType)[keyof typeof EndnoteType];
    readonly children: readonly Paragraph[];
};
export declare class Endnote extends XmlComponent {
    constructor(options: IEndnoteOptions);
}
