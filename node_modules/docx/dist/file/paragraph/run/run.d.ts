import { FootnoteReferenceRun } from '../../footnotes/footnote/run/reference-run';
import { FieldInstruction } from '../../table-of-contents/field-instruction';
import { XmlComponent } from '../../xml-components';
import { AnnotationReference, CarriageReturn, ContinuationSeparator, DayLong, DayShort, EndnoteReference, FootnoteReferenceElement, LastRenderedPageBreak, MonthLong, MonthShort, NoBreakHyphen, PageNumberElement, Separator, SoftHyphen, Tab, YearLong, YearShort } from './empty-children';
import { IParagraphRunPropertiesOptions, IRunPropertiesOptions, RunProperties } from './properties';
type IRunOptionsBase = {
    readonly children?: readonly (FieldInstruction | (typeof PageNumber)[keyof typeof PageNumber] | FootnoteReferenceRun | AnnotationReference | CarriageReturn | ContinuationSeparator | DayLong | DayShort | EndnoteReference | FootnoteReferenceElement | LastRenderedPageBreak | MonthLong | MonthShort | NoBreakHyphen | PageNumberElement | Separator | SoftHyphen | Tab | YearLong | YearShort | XmlComponent | string)[];
    readonly break?: number;
    readonly text?: string;
};
export type IRunOptions = IRunOptionsBase & IRunPropertiesOptions;
export type IParagraphRunOptions = IRunOptionsBase & IParagraphRunPropertiesOptions;
export declare const PageNumber: {
    readonly CURRENT: "CURRENT";
    readonly TOTAL_PAGES: "TOTAL_PAGES";
    readonly TOTAL_PAGES_IN_SECTION: "TOTAL_PAGES_IN_SECTION";
    readonly CURRENT_SECTION: "SECTION";
};
export declare class Run extends XmlComponent {
    protected readonly properties: RunProperties;
    constructor(options: IRunOptions);
}
export {};
